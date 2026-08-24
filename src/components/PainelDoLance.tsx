import { descreverAvaliacao, formatarAvaliacao } from '../engine'
import type { AnaliseDePosicao } from '../engine'
import { uciParaSan } from '../chess/notacao'
import type { LanceClassificado } from '../analise/classificacao'
import { ROTULOS } from '../analise/rotulos'
import type { EstadoDaAnalise } from '../hooks/useAnaliseDaPartida'

type Props = {
  /** Análise da posição selecionada. */
  analise: AnaliseDePosicao | null
  /**
   * FEN da posição imediatamente anterior — é nela que a alternativa do motor
   * seria jogada, e é lá que ela precisa ser traduzida para SAN.
   */
  fenAnterior: string | null
  /** Classificação do lance que levou até aqui. */
  classificado: LanceClassificado | null
  estadoDoMotor: EstadoDaAnalise
}

export function PainelDoLance({ analise, fenAnterior, classificado, estadoDoMotor }: Props) {
  if (!analise) {
    return (
      <div className="painel-motor">
        <p className="avaliacao avaliacao--pendente">
          {estadoDoMotor === 'erro'
            ? 'Motor indisponível.'
            : 'Aguardando o motor chegar nesta posição…'}
        </p>
      </div>
    )
  }

  const melhorSan = analise.melhorLance ? uciParaSan(analise.fen, analise.melhorLance) : null
  const rotulo = classificado?.classificacao ? ROTULOS[classificado.classificacao] : null

  const alternativa = classificado?.alternativa ?? null
  const alternativaSan =
    alternativa && fenAnterior ? uciParaSan(fenAnterior, alternativa.lanceUci) : null

  return (
    <div className="painel-motor">
      <p className="avaliacao">
        <span className="avaliacao__numero">{formatarAvaliacao(analise.avaliacao)}</span>
        <span className="avaliacao__texto">{descreverAvaliacao(analise.avaliacao)}</span>
      </p>

      <p className="melhor-lance">
        {analise.melhorLance ? (
          <>
            Melhor lance: <strong>{melhorSan ?? analise.melhorLance}</strong>
            {/* Em mate forçado o Stockfish reporta profundidades absurdas
                (245 e afins) porque segue iterando sobre uma linha já
                resolvida: o número é real, mas não informa nada. */}
            {analise.avaliacao.tipo === 'centipeoes' && (
              <span className="profundidade"> · profundidade {analise.profundidade}</span>
            )}
          </>
        ) : (
          'A partida termina aqui.'
        )}
      </p>

      {classificado && (
        <div className="classificacao">
          {rotulo ? (
            <p className={`classificacao__titulo classificacao__titulo--${classificado.classificacao}`}>
              <span className="classificacao__simbolo">{rotulo.simbolo}</span>
              {rotulo.nome}
            </p>
          ) : (
            <p className="classificacao__titulo classificacao__titulo--neutro">Sem classificação</p>
          )}
          <p className="classificacao__motivo">{classificado.motivo}</p>

          {alternativa && (
            <p className="alternativa">
              O motor preferia <strong>{alternativaSan ?? alternativa.lanceUci}</strong>
              <span className="alternativa__avaliacao">
                {' '}
                ({formatarAvaliacao(alternativa.avaliacao)})
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
