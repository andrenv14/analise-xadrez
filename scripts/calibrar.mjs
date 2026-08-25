/**
 * Grade de calibração: profundidade × MultiPV.
 *
 * O que decide não é quanto tempo levou, e sim **em quantos lances a
 * classificação divergiu** da combinação de referência.
 *
 * O arranjo usa o código de verdade — `lerInfo`, `montarAnalise` e
 * `classificarPartida` vêm de `src/`, empacotados por rolldown. O que muda em
 * relação ao navegador é só o transporte: aqui o Stockfish roda como processo
 * Node (a mesma build single-thread), lá como Web Worker. O protocolo UCI e a
 * classificação são idênticos.
 *
 * Uso: node scripts/calibrar.mjs
 */
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const MOTOR = join(RAIZ, 'node_modules', 'stockfish', 'bin', 'stockfish-18-lite-single.js')

/**
 * Combinações a medir. A primeira é a referência de comparação.
 *
 * O eixo é profundidade, não tempo: `go movetime` não é determinístico e a
 * medição anterior encontrou 4 a 10 rótulos trocados em 33 ao reanalisar a
 * mesma partida com a mesma configuração — ruído maior que o efeito de
 * qualquer parâmetro. Com `go depth N` e o hash limpo entre posições, a
 * divergência entre duas execuções idênticas é zero.
 *
 * As duas últimas linhas repetem a referência: com o piso de ruído em zero,
 * qualquer divergência na tabela é efeito do parâmetro, não do acaso.
 */
const GRADE = [
  { profundidade: 16, linhas: 3, limparHash: true },
  { profundidade: 18, linhas: 3, limparHash: true },
  { profundidade: 16, linhas: 1, limparHash: true },
  { profundidade: 14, linhas: 3, limparHash: true },
  { profundidade: 14, linhas: 1, limparHash: true },
  { profundidade: 12, linhas: 3, limparHash: true },
  { profundidade: 12, linhas: 1, limparHash: true },
  { profundidade: 16, linhas: 3, limparHash: false, rotulo: 'profundidade 16, MultiPV 3, hash reusado' },
  { profundidade: 16, linhas: 3, limparHash: true, rotulo: 'controle: referência repetida' },
]

// --- Bundle do código real ------------------------------------------------

async function carregarNucleo() {
  const pasta = await mkdtemp(join(tmpdir(), 'calib-xadrez-'))
  const saida = join(pasta, 'nucleo.mjs')
  await new Promise((resolver, rejeitar) => {
    const p = spawn(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['rolldown', 'scripts/calibragem/nucleo.ts', '--format', 'esm', '--platform', 'node', '--file', saida],
      { cwd: RAIZ, stdio: 'ignore', shell: process.platform === 'win32' },
    )
    p.on('exit', (codigo) => (codigo === 0 ? resolver() : rejeitar(new Error('rolldown falhou'))))
    p.on('error', rejeitar)
  })
  const nucleo = await import(pathToFileURL(saida).href)
  return { nucleo, limpar: () => rm(pasta, { recursive: true, force: true }) }
}

// --- Motor como processo --------------------------------------------------

function abrirMotor() {
  const processo = spawn(process.execPath, [MOTOR], { stdio: ['pipe', 'pipe', 'ignore'] })
  const ouvintes = new Set()
  let resto = ''

  processo.stdout.on('data', (pedaco) => {
    resto += pedaco.toString()
    const partes = resto.split('\n')
    resto = partes.pop()
    for (const bruta of partes) {
      const linha = bruta.trim()
      if (linha) for (const ouvinte of [...ouvintes]) ouvinte(linha)
    }
  })

  const enviar = (comando) => processo.stdin.write(comando + '\n')

  const esperar = (predicado, timeoutMs = 120_000) =>
    new Promise((resolver, rejeitar) => {
      const cronometro = setTimeout(() => {
        ouvintes.delete(ouvinte)
        rejeitar(new Error('motor não respondeu a tempo'))
      }, timeoutMs)
      const ouvinte = (linha) => {
        if (!predicado(linha)) return
        clearTimeout(cronometro)
        ouvintes.delete(ouvinte)
        resolver(linha)
      }
      ouvintes.add(ouvinte)
    })

  const coletar = (ouvinte) => {
    ouvintes.add(ouvinte)
    return () => ouvintes.delete(ouvinte)
  }

  return { enviar, esperar, coletar, encerrar: () => processo.kill() }
}

async function analisarPartida(nucleo, jogo, { tempoMs, profundidade, linhas, limparHash }) {
  const motor = abrirMotor()
  motor.enviar('uci')
  await motor.esperar((l) => l === 'uciok')
  motor.enviar('setoption name Threads value 1')
  motor.enviar(`setoption name MultiPV value ${linhas}`)
  motor.enviar('isready')
  await motor.esperar((l) => l === 'readyok')

  const total = jogo.plies.length + 1
  const analises = []
  const inicio = Date.now()
  let piorPosicaoMs = 0

  for (let i = 0; i < total; i++) {
    const fen = nucleo.fenNoIndice(jogo, i)

    // Sem limpar o hash, o resultado de uma posição depende de quais posições
    // foram analisadas antes dela — e a fila do app prioriza a selecionada,
    // então essa ordem muda conforme o usuário navega.
    if (limparHash) {
      motor.enviar('ucinewgame')
      motor.enviar('isready')
      await motor.esperar((l) => l === 'readyok')
    }

    const infos = new Map()
    const parar = motor.coletar((linha) => {
      if (!linha.startsWith('info')) return
      const info = nucleo.lerInfo(linha)
      if (info) infos.set(info.multipv, info)
    })
    const t0 = Date.now()
    motor.enviar(`position fen ${fen}`)
    motor.enviar(profundidade ? `go depth ${profundidade}` : `go movetime ${tempoMs}`)
    const bestmove = await motor.esperar((l) => l.startsWith('bestmove'))
    piorPosicaoMs = Math.max(piorPosicaoMs, Date.now() - t0)
    parar()
    analises.push(nucleo.montarAnalise(fen, infos, nucleo.lerMelhorLance(bestmove), { profundidade, linhas }))
  }

  const decorridoMs = Date.now() - inicio
  motor.encerrar()
  return { analises, decorridoMs, piorPosicaoMs }
}

// --- Comparação -----------------------------------------------------------

const nomeDe = (classificado) => classificado?.classificacao ?? '—'

function comparar(referencia, atual) {
  const divergencias = []
  for (let j = 0; j < referencia.length; j++) {
    const a = nomeDe(referencia[j])
    const b = nomeDe(atual[j])
    if (a !== b) divergencias.push({ ply: j + 1, referencia: a, atual: b })
  }
  return divergencias
}

function contar(classificacoes) {
  const contagem = new Map()
  for (const c of classificacoes) {
    const nome = nomeDe(c)
    contagem.set(nome, (contagem.get(nome) ?? 0) + 1)
  }
  return [...contagem.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([nome, n]) => `${nome} ${n}`)
    .join(', ')
}

// --- Execução -------------------------------------------------------------

const { nucleo, limpar } = await carregarNucleo()
const jogo = nucleo.parsePgn(nucleo.PGN_EXEMPLO)

console.log(`Partida de exemplo: ${jogo.plies.length} meios-lances, ${jogo.plies.length + 1} posições\n`)

const resultados = []
for (const combinacao of GRADE) {
  const nome = combinacao.rotulo ?? `profundidade ${combinacao.profundidade} / MultiPV ${combinacao.linhas}`
  process.stdout.write(`medindo ${nome}… `)
  const { analises, decorridoMs, piorPosicaoMs } = await analisarPartida(nucleo, jogo, combinacao)
  const classificacoes = nucleo.classificarPartida(jogo, analises)
  resultados.push({ ...combinacao, decorridoMs, piorPosicaoMs, classificacoes })
  console.log(`${(decorridoMs / 1000).toFixed(1)}s  (pior posição ${(piorPosicaoMs / 1000).toFixed(1)}s)`)
}

const referencia = resultados[0]

console.log('\n| tempo | MultiPV | total da partida | divergências vs referência |')
console.log('| ----- | ------- | ---------------- | -------------------------- |')
for (const r of resultados) {
  const ehReferencia = r === referencia
  const divergencias = ehReferencia ? [] : comparar(referencia.classificacoes, r.classificacoes)
  const coluna = ehReferencia
    ? '— (referência)'
    : `${divergencias.length} de ${jogo.plies.length}`
  const marca = r.rotulo ? ` *(${r.rotulo.split(':')[0]})*` : ''
  console.log(
    `| ${r.profundidade}${marca} | ${r.linhas} | ${(r.decorridoMs / 1000).toFixed(1)}s | ${(r.piorPosicaoMs / 1000).toFixed(1)}s | ${coluna} |`,
  )
}

console.log('\nDistribuição por combinação:')
for (const r of resultados) {
  console.log(`  ${r.rotulo ?? `prof ${r.profundidade}/MPV${r.linhas}`}: ${contar(r.classificacoes)}`)
}

console.log('\nDivergências, lance a lance:')
for (const r of resultados) {
  if (r === referencia) continue
  const divergencias = comparar(referencia.classificacoes, r.classificacoes)
  if (divergencias.length === 0) {
    console.log(`  ${r.rotulo ?? `prof ${r.profundidade}/MPV${r.linhas}`}: nenhuma`)
    continue
  }
  const detalhe = divergencias
    .map((d) => {
      const ply = jogo.plies[d.ply - 1]
      const numero = `${ply.moveNumber}${ply.color === 'w' ? '.' : '...'}${ply.san}`
      return `${numero} ${d.referencia}→${d.atual}`
    })
    .join('; ')
  console.log(`  ${r.rotulo ?? `prof ${r.profundidade}/MPV${r.linhas}`}: ${detalhe}`)
}

// --- Piso de ruído --------------------------------------------------------
// Divergência entre execuções idênticas. Com `go depth N` e hash limpo isso
// deve dar zero; se der outra coisa, a tabela acima não é interpretável e o
// problema não era o `movetime`.
const controles = resultados.filter((r) => r.rotulo?.startsWith('controle'))
if (controles.length > 0) {
  const valores = controles.map((r) => comparar(referencia.classificacoes, r.classificacoes).length)
  const media = valores.reduce((a, b) => a + b, 0) / valores.length
  console.log(
    `
Piso de ruído (referência contra si mesma, ${controles.length} réplicas): ` +
      `${Math.min(...valores)}–${Math.max(...valores)} de ${jogo.plies.length}, média ${media.toFixed(1)}`,
  )
}

await limpar()
