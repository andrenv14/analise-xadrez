import type { AnaliseDePosicao } from '../engine/tipos'
import type { ParsedGame } from '../chess/pgn'
import { aberturaDaPartida, limiteDaTeoria } from './aberturas'
import type { Abertura } from './aberturas'
import { classificarLance } from './classificacao'
import type { LanceClassificado } from './classificacao'

export type PartidaClassificada = {
  /**
   * Uma entrada por meio-lance. `null` enquanto faltar a análise de antes ou a
   * de depois — comum, já que a fila prioriza a posição selecionada e não
   * caminha em ordem.
   */
  lances: (LanceClassificado | null)[]
  /** Abertura reconhecida, ou `null` se a partida sai do livro de imediato. */
  abertura: Abertura | null
  /** Último meio-lance ainda dentro de teoria. 0 quando não há nenhum. */
  limiteDaTeoria: number
}

/**
 * Classifica a partida inteira.
 *
 * A teoria é resolvida uma vez, para a partida toda, e não posição a posição:
 * saber até onde vai o livro exige olhar a sequência inteira, porque a base
 * nomeia posições e tem buracos no meio de linhas conhecidas.
 */
export function classificarPartida(
  jogo: ParsedGame,
  analises: (AnaliseDePosicao | null)[],
): PartidaClassificada {
  const fensPorPly = jogo.plies.map((ply) => ply.fen)
  const limite = limiteDaTeoria(fensPorPly)

  const lances = jogo.plies.map((ply, j) => {
    const antes = analises[j] ?? null
    const depois = analises[j + 1] ?? null
    if (!antes || !depois) return null
    return classificarLance(antes, depois, ply.uci, ply.ply <= limite)
  })

  return { lances, abertura: aberturaDaPartida(fensPorPly), limiteDaTeoria: limite }
}
