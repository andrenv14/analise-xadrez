import baseBruta from './aberturas.json'

/**
 * Base de aberturas — 3.810 posições de `lichess-org/chess-openings` (CC0-1.0,
 * domínio público), gerada por `scripts/gerar-aberturas.mjs`.
 *
 * São 432 KB crus, 60 KB comprimidos, embutidos no bundle. Ao lado dos 7 MB do
 * WASM do motor isso é ruído, então a base entra inteira — sem subconjunto.
 */

type BaseDeAberturas = {
  /** Maior profundidade, em meios-lances, de qualquer entrada da base. */
  profundidadeMaxima: number
  /** Chave da posição -> "ECO|Nome". */
  posicoes: Record<string, string>
}

const BASE = baseBruta as BaseDeAberturas

export type Abertura = {
  /** Classificação ECO, ex: `C41`. */
  eco: string
  /** Nome em inglês, ex: `Philidor Defense`. */
  nome: string
}

/**
 * Chave de posição: os quatro primeiros campos da FEN, sem os contadores.
 *
 * Precisa ser idêntica à do gerador — e é, porque os dois lados calculam a FEN
 * com o mesmo chess.js.
 */
function chaveDaPosicao(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ')
}

function procurar(fen: string): Abertura | null {
  const registro = BASE.posicoes[chaveDaPosicao(fen)]
  if (!registro) return null
  const separador = registro.indexOf('|')
  return { eco: registro.slice(0, separador), nome: registro.slice(separador + 1) }
}

/**
 * Até que meio-lance a partida ainda está em teoria conhecida.
 *
 * Devolve o maior ply cuja posição resultante está na base — não o primeiro
 * buraco. A distinção importa: a base nomeia posições, não cobre todos os
 * lances de uma linha. Na Najdorf, a posição após `4.Nxd4` não tem nome, mas a
 * de `4...Nf6` tem; cortar no primeiro buraco encerraria a teoria no lance 3 de
 * uma partida que segue no livro até o lance 8.
 *
 * A busca para na profundidade máxima da base. Sem esse limite, uma posição de
 * meio-jogo que por acaso batesse com uma entrada profunda reabriria a teoria
 * no lance 40, o que só poderia ser coincidência.
 *
 * `fensPorPly[j]` é a posição depois do meio-lance `j + 1`.
 */
export function limiteDaTeoria(fensPorPly: string[]): number {
  const teto = Math.min(fensPorPly.length, BASE.profundidadeMaxima)
  for (let ply = teto; ply >= 1; ply--) {
    if (chaveDaPosicao(fensPorPly[ply - 1]) in BASE.posicoes) return ply
  }
  return 0
}

/**
 * Abertura da partida: a mais específica reconhecida.
 *
 * Anda de trás para frente a partir do limite da teoria, que é o que a própria
 * fonte recomenda — assim uma partida que transpõe recebe o nome da linha em
 * que efetivamente caiu, e não o do primeiro lance.
 */
export function aberturaDaPartida(fensPorPly: string[]): Abertura | null {
  const limite = limiteDaTeoria(fensPorPly)
  return limite === 0 ? null : procurar(fensPorPly[limite - 1])
}
