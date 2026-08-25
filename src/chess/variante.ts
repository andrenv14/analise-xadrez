import { Chess } from 'chess.js'

/**
 * Um lance jogado pelo usuário dentro de uma variante.
 *
 * Espelha `Ply` da partida, mas sem `ply`: numa variante não existe índice
 * absoluto na partida — o que existe é a distância desde a raiz.
 */
export type LanceDaVariante = {
  moveNumber: number
  color: 'w' | 'b'
  san: string
  uci: string
  from: string
  to: string
  /** FEN da posição depois deste lance. */
  fen: string
}

export type Variante = {
  /**
   * Posição da partida de onde a variante parte, no mesmo índice usado pela
   * navegação: 0 = posição inicial, n = depois do n-ésimo meio-lance.
   */
  raiz: number
  /** FEN da raiz, guardada para não depender do jogo em toda operação. */
  fenDaRaiz: string
  lances: LanceDaVariante[]
  /** Posição selecionada dentro da variante: 0 = a raiz, n = após n lances. */
  indice: number
}

export function criarVariante(raiz: number, fenDaRaiz: string): Variante {
  return { raiz, fenDaRaiz, lances: [], indice: 0 }
}

/** FEN da posição selecionada. Índice 0 = a raiz. */
export function fenDaVariante(variante: Variante, indice = variante.indice): string {
  if (indice <= 0) return variante.fenDaRaiz
  return variante.lances[Math.min(indice, variante.lances.length) - 1].fen
}

/**
 * Tenta jogar um lance a partir da posição selecionada.
 *
 * Devolve `null` quando o lance é ilegal — o chamador simplesmente não faz
 * nada, sem mensagem de erro: numa exploração livre, tentar um lance
 * impossível é parte de explorar, não um erro do usuário.
 *
 * Jogar a partir do meio da variante **descarta o que vinha depois**. É a
 * mesma coisa que qualquer editor faz quando se digita no meio de um texto
 * com histórico à frente, e evita ter que decidir o que fazer com uma cauda
 * que não segue mais da posição.
 */
export function jogarNaVariante(
  variante: Variante,
  de: string,
  para: string,
  promocao = 'q',
): Variante | null {
  const fen = fenDaVariante(variante)
  const chess = new Chess(fen)

  let lance
  try {
    lance = chess.move({ from: de, to: para, promotion: promocao })
  } catch {
    return null
  }
  if (!lance) return null

  const anteriores = variante.lances.slice(0, variante.indice)
  const campos = fen.split(' ')
  const novo: LanceDaVariante = {
    moveNumber: Number(campos[5]) || 1,
    color: lance.color,
    san: lance.san,
    uci: lance.lan,
    from: lance.from,
    to: lance.to,
    fen: lance.after,
  }

  return {
    ...variante,
    lances: [...anteriores, novo],
    indice: anteriores.length + 1,
  }
}

/** Move a seleção dentro da variante, sem sair dela. */
export function irParaNaVariante(variante: Variante, destino: number): Variante {
  return { ...variante, indice: Math.max(0, Math.min(destino, variante.lances.length)) }
}

/** FENs de todas as posições da variante, da primeira à última. */
export function fensDaVariante(variante: Variante): string[] {
  return variante.lances.map((lance) => lance.fen)
}
