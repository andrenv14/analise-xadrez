/**
 * Grava as avaliações do motor usadas pelos testes.
 *
 * Os testes exercitam a **regra de classificação**, não o Stockfish. Rodar o
 * motor em teste seria lento e — mesmo com profundidade fixa — dependente de
 * ter o WASM baixado e da máquina. Gravando uma vez, o teste vira uma função
 * pura sobre dados fixos: roda em milissegundos e não pisca.
 *
 * Regravar só é necessário quando a profundidade, o MultiPV ou a versão do
 * Stockfish mudarem — e nesse caso as expectativas dos testes precisam ser
 * reconferidas, não ajustadas no automático.
 *
 * Uso: node scripts/gravar-avaliacoes.mjs
 */
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const MOTOR = join(RAIZ, 'node_modules', 'stockfish', 'bin', 'stockfish-18-lite-single.js')
const DESTINO = join(RAIZ, 'src', 'analise', '__fixtures__', 'avaliacoes.json')

const PROFUNDIDADE = 16
const LINHAS = 3

// --- núcleo empacotado (mesmo parser e mesmas regras do app) ---------------
async function carregarNucleo() {
  const saida = join(RAIZ, 'node_modules', '.cache', 'nucleo-gravacao.mjs')
  await mkdir(dirname(saida), { recursive: true })
  await new Promise((resolver, rejeitar) => {
    const p = spawn(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['rolldown', 'scripts/calibragem/nucleo.ts', '--format', 'esm', '--platform', 'node', '--file', saida],
      { cwd: RAIZ, stdio: 'ignore', shell: process.platform === 'win32' },
    )
    p.on('exit', (c) => (c === 0 ? resolver() : rejeitar(new Error('rolldown falhou'))))
    p.on('error', rejeitar)
  })
  return import(pathToFileURL(saida).href)
}

function abrirMotor() {
  const processo = spawn(process.execPath, [MOTOR], { stdio: ['pipe', 'pipe', 'ignore'] })
  const ouvintes = new Set()
  let resto = ''
  processo.stdout.on('data', (d) => {
    resto += d.toString()
    const partes = resto.split('\n')
    resto = partes.pop()
    for (const b of partes) { const l = b.trim(); if (l) for (const o of [...ouvintes]) o(l) }
  })
  const enviar = (c) => processo.stdin.write(c + '\n')
  const esperar = (pred) => new Promise((res) => {
    const o = (l) => { if (pred(l)) { ouvintes.delete(o); res(l) } }
    ouvintes.add(o)
  })
  const coletar = (o) => { ouvintes.add(o); return () => ouvintes.delete(o) }
  return { enviar, esperar, coletar, encerrar: () => processo.kill() }
}

const nucleo = await carregarNucleo()

const motor = abrirMotor()
motor.enviar('uci'); await motor.esperar((l) => l === 'uciok')
motor.enviar('setoption name Threads value 1')
motor.enviar(`setoption name MultiPV value ${LINHAS}`)
motor.enviar('isready'); await motor.esperar((l) => l === 'readyok')

async function analisar(fen) {
  motor.enviar('ucinewgame'); motor.enviar('isready'); await motor.esperar((l) => l === 'readyok')
  const infos = new Map()
  const parar = motor.coletar((l) => {
    if (!l.startsWith('info')) return
    const info = nucleo.lerInfo(l)
    if (info) infos.set(info.multipv, info)
  })
  motor.enviar('position fen ' + fen)
  motor.enviar(`go depth ${PROFUNDIDADE}`)
  const bm = await motor.esperar((l) => l.startsWith('bestmove'))
  parar()
  const analise = nucleo.montarAnalise(fen, infos, nucleo.lerMelhorLance(bm))
  // A variante completa não é lida por nada na classificação — só o primeiro
  // lance importa. Truncar mantém a fixture legível.
  return {
    ...analise,
    linhas: analise.linhas.map((l) => ({ ...l, variante: l.variante.slice(0, 1) })),
  }
}

/** Grava a partida inteira, posição a posição. */
async function gravarPartida(pgn) {
  const jogo = nucleo.parsePgn(pgn)
  const analises = []
  for (let i = 0; i <= jogo.plies.length; i++) {
    analises.push(await analisar(nucleo.fenNoIndice(jogo, i)))
  }
  return { pgn, analises }
}

/** Grava só os índices pedidos; os demais ficam `null`. */
async function gravarIndices(pgn, indices) {
  const jogo = nucleo.parsePgn(pgn)
  const analises = new Array(jogo.plies.length + 1).fill(null)
  for (const i of indices) analises[i] = await analisar(nucleo.fenNoIndice(jogo, i))
  return { pgn, analises }
}

const MORPHY = nucleo.PGN_EXEMPLO
const BOBO = '1. f3 e5 2. g4 Qh4# 0-1'
const NAJDORF =
  '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 7. Nb3 Be6 8. f3 Be7 9. Qd2 O-O *'
const PROMOCAO = '[SetUp "1"]\n[FEN "7k/P6p/8/8/8/8/7P/6RK w - - 0 1"]\n\n1. a8=Q# 1-0'

const longaPgn = await readFile(join(RAIZ, 'src', 'analise', '__fixtures__', 'partida-longa.pgn'), 'utf8')

console.log('Gravando avaliações (profundidade 16, MultiPV 3)…')
const fixture = {
  profundidade: PROFUNDIDADE,
  linhas: LINHAS,
  motor: 'stockfish-18-lite-single',
  partidas: {},
}

for (const [nome, tarefa] of [
  ['morphy', () => gravarPartida(MORPHY)],
  ['bobo', () => gravarPartida(BOBO)],
  ['najdorf', () => gravarPartida(NAJDORF)],
  ['promocaoComMate', () => gravarPartida(PROMOCAO)],
  // Da partida longa só interessam os três lances que já viraram "Brilhante"
  // por peça pendurada em outra casa: plies 36, 48 e 50, com as posições de
  // antes e depois de cada um.
  ['longaFalsosBrilhantes', () => gravarIndices(longaPgn, [35, 36, 47, 48, 49, 50])],
]) {
  process.stdout.write(`  ${nome}… `)
  fixture.partidas[nome] = await tarefa()
  console.log('ok')
}

motor.encerrar()
await mkdir(dirname(DESTINO), { recursive: true })
await writeFile(DESTINO, JSON.stringify(fixture, null, 1) + '\n', 'utf8')
const bytes = Buffer.byteLength(JSON.stringify(fixture))
console.log(`\nEscrito em src/analise/__fixtures__/avaliacoes.json (${(bytes / 1024).toFixed(0)} KB)`)
