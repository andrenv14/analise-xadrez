import { Chess } from 'chess.js'

/** Um meio-lance (ply) da partida, já com a posição resultante. */
export type Ply = {
  /** 1 = primeiro meio-lance da partida. */
  ply: number
  /** Número do lance na notação (1, 1, 2, 2, ...). */
  moveNumber: number
  color: 'w' | 'b'
  san: string
  from: string
  to: string
  /** FEN da posição *depois* deste meio-lance. */
  fen: string
}

export type ParsedGame = {
  headers: Record<string, string>
  /** FEN da posição inicial da partida (respeita o header FEN/SetUp). */
  startFen: string
  plies: Ply[]
}

export class PgnError extends Error {
  /** Mensagem crua da biblioteca, para exibir como detalhe secundario. */
  detalhe?: string

  constructor(mensagem: string, detalhe?: string) {
    super(mensagem)
    this.name = 'PgnError'
    this.detalhe = detalhe
  }
}

const FEN_INICIAL = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/**
 * Converte um PGN em posições navegáveis.
 * Lança `PgnError` com mensagem legível quando o PGN não é aproveitável.
 */
export function parsePgn(pgn: string): ParsedGame {
  const texto = pgn.trim()
  if (texto === '') {
    throw new PgnError('Cole um PGN para analisar.')
  }

  const chess = new Chess()
  try {
    chess.loadPgn(texto)
  } catch (erro) {
    throw new PgnError(
      'Não consegui ler este PGN. Confira se o texto está completo e se os lances estão em notação algébrica (por exemplo: 1. e4 e5 2. Nf3).',
      erro instanceof Error ? erro.message : String(erro),
    )
  }

  const historico = chess.history({ verbose: true })
  if (historico.length === 0) {
    throw new PgnError('O PGN foi lido, mas não contém nenhum lance.')
  }

  const startFen = historico[0].before ?? FEN_INICIAL
  // A partida pode comecar de uma posicao arbitraria (header FEN/SetUp), entao
  // a numeracao dos lances sai da propria FEN inicial, nao do indice do array.
  const campos = startFen.split(' ')
  const comecaComPretas = campos[1] === 'b'
  const primeiroNumero = Number(campos[5]) || 1

  const plies: Ply[] = historico.map((lance, i) => ({
    ply: i + 1,
    moveNumber: primeiroNumero + Math.floor((i + (comecaComPretas ? 1 : 0)) / 2),
    color: lance.color,
    san: lance.san,
    from: lance.from,
    to: lance.to,
    fen: lance.after,
  }))

  return { headers: chess.getHeaders(), startFen, plies }
}

/** FEN da posição no índice dado. Índice 0 = posição inicial da partida. */
export function fenNoIndice(jogo: ParsedGame, indice: number): string {
  if (indice <= 0) return jogo.startFen
  const ply = jogo.plies[Math.min(indice, jogo.plies.length) - 1]
  return ply.fen
}
