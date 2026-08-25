import { Chess } from 'chess.js'

/** Um meio-lance (ply) da partida, já com a posição resultante. */
export type Ply = {
  /** 1 = primeiro meio-lance da partida. */
  ply: number
  /** Número do lance na notação (1, 1, 2, 2, ...). */
  moveNumber: number
  color: 'w' | 'b'
  san: string
  /** O mesmo lance em notação UCI (`e2e4`, `e7e8q`) — a língua do motor. */
  uci: string
  from: string
  to: string
  /** FEN da posição *depois* deste meio-lance. */
  fen: string
}

export type Resultado = '1-0' | '0-1' | '1/2-1/2' | '*'

/**
 * Como a partida acabou.
 *
 * A distinção que importa é entre o que o tabuleiro explica e o que só o PGN
 * conta. A maioria das partidas reais termina por abandono, tempo ou acordo —
 * a posição final não tem nada de especial, e sem dizer isso a tela mostra
 * "1-0" no cabeçalho e "+0.53" na barra sem explicar a contradição.
 */
export type Desfecho = {
  resultado: Resultado
  tipo:
    | 'mate'
    | 'afogamento'
    | 'empateNoTabuleiro'
    /** O PGN registra um vencedor que a posição final não explica. */
    | 'foraDoTabuleiro'
    /** O PGN não registra resultado: `*`. */
    | 'incompleta'
  /** Detalhe do empate no tabuleiro, quando aplicável. */
  motivoDoEmpate?: 'materialInsuficiente' | 'repeticao' | 'cinquentaLances'
}

export type ParsedGame = {
  headers: Record<string, string>
  /** FEN da posição inicial da partida (respeita o header FEN/SetUp). */
  startFen: string
  plies: Ply[]
  desfecho: Desfecho
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
 * Separa um texto em blocos de partida.
 *
 * Um export de "baixar minhas partidas" do Chess.com ou do Lichess vem com
 * várias partidas coladas, e é o que o usuário real tem à mão. A fronteira é
 * uma linha em branco seguida de uma linha de header: dentro de uma partida a
 * linha em branco é seguida pelos lances, que nunca começam com `[`.
 */
export function separarPartidas(texto: string): string[] {
  return texto
    .trim()
    .split(/\n\s*\n(?=\s*\[)/)
    .map((bloco) => bloco.trim())
    .filter((bloco) => bloco !== '')
}

/**
 * Converte um texto com uma ou mais partidas.
 *
 * Blocos sem lance nenhum são descartados em silêncio — um export costuma
 * trazer partidas anuladas ou abandonadas antes do primeiro lance, e derrubar
 * o texto inteiro por causa delas seria pior do que ignorá-las.
 */
export function parsePartidas(pgn: string): ParsedGame[] {
  const blocos = separarPartidas(pgn)
  if (blocos.length <= 1) return [parsePgn(pgn)]

  const partidas: ParsedGame[] = []
  let primeiroErro: PgnError | null = null

  for (const bloco of blocos) {
    try {
      partidas.push(parsePgn(bloco))
    } catch (erro) {
      if (erro instanceof PgnError && primeiroErro === null) primeiroErro = erro
    }
  }

  if (partidas.length === 0) {
    throw (
      primeiroErro ??
      new PgnError(`Encontrei ${blocos.length} partidas no texto, mas nenhuma tem lances.`)
    )
  }
  return partidas
}

/** Rótulo curto de uma partida, para o seletor. */
export function rotularPartida(jogo: ParsedGame, indice: number): string {
  const brancas = jogo.headers.White ?? 'Brancas'
  const pretas = jogo.headers.Black ?? 'Pretas'
  const data = jogo.headers.Date && jogo.headers.Date !== '????.??.??' ? ` · ${jogo.headers.Date}` : ''
  return `${indice + 1}. ${brancas} × ${pretas} — ${jogo.desfecho.resultado}${data}`
}

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
    const detalhe = erro instanceof Error ? erro.message : String(erro)
    // A mensagem tem que apontar para o lugar certo: uma FEN quebrada no
    // header não tem nada a ver com a notação dos lances.
    const mensagem = /fen/i.test(detalhe)
      ? 'A posição inicial no header FEN deste PGN é inválida. Confira o campo [FEN "..."] — ou remova-o, se a partida começa da posição normal.'
      : 'Não consegui ler este PGN. Confira se o texto está completo e se os lances estão em notação algébrica (por exemplo: 1. e4 e5 2. Nf3).'
    throw new PgnError(mensagem, detalhe)
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
    uci: lance.lan,
    from: lance.from,
    to: lance.to,
    fen: lance.after,
  }))

  return { headers: chess.getHeaders(), startFen, plies, desfecho: lerDesfecho(chess) }
}

/**
 * Lê o desfecho a partir da posição final e do marcador do PGN.
 *
 * `chess` precisa estar na posição final — é o estado em que `loadPgn` deixa.
 */
function lerDesfecho(chess: Chess): Desfecho {
  const bruto = chess.getHeaders().Result
  const resultado: Resultado =
    bruto === '1-0' || bruto === '0-1' || bruto === '1/2-1/2' ? bruto : '*'

  if (chess.isCheckmate()) return { resultado, tipo: 'mate' }
  if (chess.isStalemate()) return { resultado, tipo: 'afogamento' }
  if (chess.isInsufficientMaterial()) {
    return { resultado, tipo: 'empateNoTabuleiro', motivoDoEmpate: 'materialInsuficiente' }
  }
  if (chess.isThreefoldRepetition()) {
    return { resultado, tipo: 'empateNoTabuleiro', motivoDoEmpate: 'repeticao' }
  }
  if (chess.isDrawByFiftyMoves()) {
    return { resultado, tipo: 'empateNoTabuleiro', motivoDoEmpate: 'cinquentaLances' }
  }
  return { resultado, tipo: resultado === '*' ? 'incompleta' : 'foraDoTabuleiro' }
}

/** FEN da posição no índice dado. Índice 0 = posição inicial da partida. */
export function fenNoIndice(jogo: ParsedGame, indice: number): string {
  if (indice <= 0) return jogo.startFen
  const ply = jogo.plies[Math.min(indice, jogo.plies.length) - 1]
  return ply.fen
}
