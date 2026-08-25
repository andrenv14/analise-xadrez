import type { Desfecho } from '../chess/pgn'

const VENCEDOR: Record<string, string> = { '1-0': 'as brancas', '0-1': 'as pretas' }

const MOTIVO_DO_EMPATE: Record<string, string> = {
  materialInsuficiente: 'material insuficiente para dar mate',
  repeticao: 'repetição de posição',
  cinquentaLances: 'regra dos cinquenta lances',
}

/**
 * Explica o fim da partida na última posição.
 *
 * Existe por causa de uma contradição que a tela mostrava sem comentar: o
 * cabeçalho dizia "1-0" e a eval bar dizia "+0.53". A maioria das partidas
 * reais acaba por abandono, tempo ou acordo — a posição final não tem nada de
 * especial, e a avaliação dela não é o resultado.
 */
export function DesfechoDaPartida({ desfecho }: { desfecho: Desfecho }) {
  const { resultado, tipo, motivoDoEmpate } = desfecho

  if (tipo === 'mate' || tipo === 'afogamento') {
    // Estes o tabuleiro já explica sozinho, e a avaliação mostra `1-0`/`½-½`.
    return null
  }

  if (tipo === 'incompleta') {
    return (
      <p className="desfecho desfecho--incompleta">
        O PGN não registra um resultado — a partida continua a partir daqui.
      </p>
    )
  }

  if (tipo === 'empateNoTabuleiro') {
    return (
      <p className="desfecho">
        <strong>Empate</strong> por {MOTIVO_DO_EMPATE[motivoDoEmpate ?? ''] ?? 'regra de empate'}.
      </p>
    )
  }

  return (
    <p className="desfecho">
      <strong>{resultado}</strong> — a partida terminou aqui{' '}
      {resultado === '1/2-1/2' ? 'em empate acordado' : `com ${VENCEDOR[resultado]} vencendo`}, sem
      mate no tabuleiro. Abandono, tempo ou acordo: a avaliação ao lado é da posição, não do
      resultado.
    </p>
  )
}
