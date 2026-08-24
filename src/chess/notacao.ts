import { Chess } from 'chess.js'

/**
 * Converte um lance do UCI (`e2e4`, `e7e8q`) para notação algébrica (`e4`,
 * `e8=Q`) na posição dada.
 *
 * O motor fala UCI e não conhece a posição; a tradução é responsabilidade da
 * camada de xadrez, não da camada de motor.
 */
export function uciParaSan(fen: string, lanceUci: string): string | null {
  if (lanceUci.length < 4) return null
  try {
    const chess = new Chess(fen)
    const lance = chess.move({
      from: lanceUci.slice(0, 2),
      to: lanceUci.slice(2, 4),
      promotion: lanceUci.length > 4 ? lanceUci[4] : undefined,
    })
    return lance.san
  } catch {
    return null
  }
}
