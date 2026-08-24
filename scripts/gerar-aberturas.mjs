/**
 * Gera a base de aberturas estática a partir de `lichess-org/chess-openings`.
 *
 * Fonte: os TSV do repositório original (CC0-1.0, domínio público), baixados
 * direto do GitHub. Formato confirmado em agosto de 2026: cabeçalho
 * `eco\tname\tpgn`, três colunas.
 *
 * O repositório também publica um `dist/` com as colunas `uci` e `epd` já
 * calculadas, mas ele **não está versionado** — é artefato de build. Então a
 * chave de posição é calculada aqui, com o mesmo chess.js que o app usa para
 * consultar. Isso importa mais do que parece: a convenção de casa de en
 * passant varia entre implementações, e gerar chave e consulta com o mesmo
 * código torna a questão irrelevante.
 *
 * Uso: node scripts/gerar-aberturas.mjs
 */
import { writeFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Chess } from 'chess.js'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const DESTINO = join(RAIZ, 'src', 'analise', 'aberturas.json')

const BASE_URL = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master'
const ARQUIVOS = ['a.tsv', 'b.tsv', 'c.tsv', 'd.tsv', 'e.tsv']

/**
 * Chave de posição: os quatro primeiros campos da FEN (peças, vez, roque, en
 * passant), sem os contadores de lance. Duas partidas que chegam à mesma
 * posição por caminhos diferentes têm a mesma chave — que é justamente o que
 * faz a base reconhecer transposições.
 */
export function chaveDaPosicao(fen) {
  return fen.split(' ').slice(0, 4).join(' ')
}

function lerTsv(texto, arquivo) {
  const linhas = texto.split('\n').filter((l) => l.trim() !== '')
  const cabecalho = linhas[0].split('\t')
  if (cabecalho[0] !== 'eco' || cabecalho[1] !== 'name' || cabecalho[2] !== 'pgn') {
    throw new Error(
      `Formato inesperado em ${arquivo}: cabeçalho "${linhas[0]}". ` +
        'Esperava "eco\\tname\\tpgn". O formato da fonte mudou — pare e confira.',
    )
  }
  return linhas.slice(1).map((linha) => {
    const campos = linha.split('\t')
    if (campos.length !== 3) {
      throw new Error(`Linha com ${campos.length} colunas em ${arquivo}: ${linha.slice(0, 80)}`)
    }
    const [eco, name, pgn] = campos
    return { eco, name, pgn }
  })
}

console.log('Baixando de lichess-org/chess-openings (CC0-1.0)…')

const entradas = []
for (const arquivo of ARQUIVOS) {
  const resposta = await fetch(`${BASE_URL}/${arquivo}`)
  if (!resposta.ok) throw new Error(`Falha ao baixar ${arquivo}: HTTP ${resposta.status}`)
  const linhas = lerTsv(await resposta.text(), arquivo)
  console.log(`  ${arquivo}: ${linhas.length} aberturas`)
  entradas.push(...linhas)
}

console.log(`\nTotal: ${entradas.length} aberturas. Calculando posições…`)

/** chave da posição -> "ECO|Nome" */
const base = {}
let profundidadeMaxima = 0
let ignoradas = 0

for (const { eco, name, pgn } of entradas) {
  const chess = new Chess()
  try {
    chess.loadPgn(pgn)
  } catch {
    ignoradas++
    continue
  }
  const lances = chess.history().length
  if (lances === 0) {
    ignoradas++
    continue
  }
  profundidadeMaxima = Math.max(profundidadeMaxima, lances)

  const chave = chaveDaPosicao(chess.fen())
  // Colisão significa que duas entradas nomeiam a mesma posição. A fonte
  // avisa que isso acontece de propósito, para cobrir transposições; a
  // primeira entrada (arquivos em ordem alfabética de ECO) fica valendo.
  if (!(chave in base)) base[chave] = `${eco}|${name}`
}

// O JSON carrega a própria profundidade máxima: o app usa esse número para
// não sair procurando teoria no lance 60 de uma partida longa, onde um acerto
// só poderia ser coincidência.
const json = JSON.stringify({ profundidadeMaxima, posicoes: base })
await writeFile(DESTINO, json + '\n', 'utf8')

const bytes = Buffer.byteLength(json)
const comprimido = gzipSync(json).length

console.log(`\nEscrito em src/analise/aberturas.json`)
console.log(`  posições distintas: ${Object.keys(base).length}`)
console.log(`  entradas ignoradas: ${ignoradas}`)
console.log(`  profundidade máxima: ${profundidadeMaxima} meios-lances`)
console.log(`  tamanho: ${(bytes / 1024).toFixed(0)} KB cru, ${(comprimido / 1024).toFixed(0)} KB gzip`)
