import type { AnaliseDePosicao } from '../engine/tipos'
import type { ParsedGame } from '../chess/pgn'
import { classificarLance } from './classificacao'
import type { LanceClassificado } from './classificacao'

/**
 * Classifica todos os meio-lances que já têm as duas pontas analisadas.
 *
 * O índice `j` do array devolvido corresponde ao meio-lance `j + 1`. Entradas
 * ficam `null` enquanto faltar a análise de antes ou a de depois — o que é
 * comum, já que a fila prioriza a posição selecionada e não caminha em ordem.
 */
export function classificarPartida(
  jogo: ParsedGame,
  analises: (AnaliseDePosicao | null)[],
): (LanceClassificado | null)[] {
  return jogo.plies.map((ply, j) => {
    const antes = analises[j] ?? null
    const depois = analises[j + 1] ?? null
    if (!antes || !depois) return null
    return classificarLance(antes, depois, ply.uci)
  })
}
