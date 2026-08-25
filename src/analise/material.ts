import { Chess } from 'chess.js'
import type { Cor } from '../engine/avaliacao'

/** Valores clássicos em centipeões. O rei não entra na conta. */
const VALOR_DA_PECA: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 }

/** Saldo de material da cor dada, em centipeões (positivo = tem mais). */
export function saldoDeMaterial(fen: string, cor: Cor): number {
  const pecas = fen.split(' ')[0]
  let saldo = 0
  for (const caractere of pecas) {
    const valor = VALOR_DA_PECA[caractere.toLowerCase()]
    if (valor === undefined) continue
    const daBranca = caractere === caractere.toUpperCase()
    saldo += daBranca ? valor : -valor
  }
  return cor === 'w' ? saldo : -saldo
}

/** Aplica um lance UCI a uma FEN. `null` se o lance for ilegal ali. */
export function aplicarLanceUci(fen: string, lanceUci: string): string | null {
  if (lanceUci.length < 4) return null
  try {
    const chess = new Chess(fen)
    chess.move({
      from: lanceUci.slice(0, 2),
      to: lanceUci.slice(2, 4),
      promotion: lanceUci.length > 4 ? lanceUci[4] : undefined,
    })
    return chess.fen()
  } catch {
    return null
  }
}

export function contarLancesLegais(fen: string): number {
  try {
    return new Chess(fen).moves().length
  } catch {
    return 0
  }
}

export type EntregaDeMaterial = {
  /** Quanto material a cor entregou, em centipeões. Negativo = ganhou. */
  entregue: number
  /**
   * A melhor resposta do adversário captura **na casa de destino do lance
   * jogado**?
   *
   * É a assinatura do sacrifício de verdade, nas suas duas formas: peça que
   * vai para casa atacada (`Qb8+` e o adversário responde `Nxb8`) e captura
   * com peça mais valiosa (`Rxd7` tomando um cavalo com a torre, e o
   * adversário recaptura em d7).
   *
   * Sem esta condição, qualquer lance jogado com uma peça pendurada em outro
   * canto do tabuleiro é lido como entrega deliberada — o material ia cair de
   * qualquer forma, o lance não teve nada a ver com isso.
   */
  respostaCapturaNoDestino: boolean
}

/**
 * Quanto material a cor abre mão ao jogar `lanceUci`, medido **depois da
 * melhor resposta do adversário**.
 *
 * Olhar só a posição imediatamente após o lance não serve: em `Bxh7+` o
 * material sequer caiu ainda — a entrega só aparece depois de `Kxh7`. Por
 * isso a conta vai até a resposta que o motor considera melhor.
 *
 * Limitação assumida: a janela é de dois meios-lances. Sacrifício que só se
 * materializa três ou quatro lances adiante não é detectado. Aumentar a
 * janela exigiria confiar na variante inteira do motor, que em buscas curtas
 * é justamente a parte menos confiável.
 *
 * Segunda limitação assumida: sacrifício de deflexão em que a peça oferecida
 * **não é a que se moveu** também não é detectado, porque `respostaCapturaNoDestino`
 * é falso nele. É deliberado — pela informação disponível esse caso é
 * indistinguível de "havia peça pendurada e o lance não teve nada a ver".
 */
export function materialEntregue(
  fenAntes: string,
  lanceUci: string,
  melhorRespostaUci: string | null,
  cor: Cor,
): EntregaDeMaterial | null {
  const fenDepois = aplicarLanceUci(fenAntes, lanceUci)
  if (!fenDepois) return null

  const fenFinal = melhorRespostaUci ? (aplicarLanceUci(fenDepois, melhorRespostaUci) ?? fenDepois) : fenDepois

  return {
    entregue: saldoDeMaterial(fenAntes, cor) - saldoDeMaterial(fenFinal, cor),
    respostaCapturaNoDestino:
      melhorRespostaUci !== null && melhorRespostaUci.slice(2, 4) === lanceUci.slice(2, 4),
  }
}
