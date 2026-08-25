import { descreverAvaliacao, formatarAvaliacao } from '../engine'
import type { AnaliseDePosicao } from '../engine'
import { uciParaSan } from '../chess/notacao'
import type { Abertura } from '../analise/aberturas'

type Props = {
  analise: AnaliseDePosicao | null
  /** FEN da posição atual da variante, para traduzir a resposta do motor. */
  fen: string
  /** Abertura reconhecida na variante, ou `null` se ela saiu da teoria. */
  abertura: Abertura | null
  quantosLances: number
  onVoltar: () => void
}

/**
 * Painel da exploração de variantes.
 *
 * Deliberadamente mais pobre que o painel da partida: aqui há avaliação e
 * melhor resposta, e **não** há classificação. Classificar um lance exige
 * compará-lo com o que era possível na posição anterior, e numa exploração
 * livre o "lance anterior" também é do usuário — chamar de "erro" um lance
 * que ele está testando de propósito seria julgar a pergunta, não a resposta.
 */
export function PainelDaVariante({ analise, fen, abertura, quantosLances, onVoltar }: Props) {
  const melhorSan = analise?.melhorLance ? uciParaSan(fen, analise.melhorLance) : null

  return (
    <div className="painel-motor painel-motor--variante">
      <div className="aviso-variante">
        <p className="aviso-variante__titulo">
          Variante — {quantosLances === 1 ? '1 lance seu' : `${quantosLances} lances seus`}
        </p>
        <p className="aviso-variante__texto">
          Você saiu da partida. Mova as peças para continuar explorando.
        </p>
        <button type="button" className="primario" onClick={onVoltar}>
          Voltar à partida <kbd>Esc</kbd>
        </button>
      </div>

      {abertura && (
        <p className="abertura abertura--variante">
          <span className="abertura__eco">{abertura.eco}</span>
          {abertura.nome}
        </p>
      )}

      {analise ? (
        <>
          <p className="avaliacao">
            <span className="avaliacao__numero">{formatarAvaliacao(analise.avaliacao)}</span>
            <span className="avaliacao__texto">{descreverAvaliacao(analise.avaliacao)}</span>
          </p>
          <p className="melhor-lance">
            {analise.melhorLance ? (
              <>
                Melhor resposta: <strong>{melhorSan ?? analise.melhorLance}</strong>
                {analise.avaliacao.tipo === 'centipeoes' && (
                  <span className="profundidade"> · profundidade {analise.profundidade}</span>
                )}
              </>
            ) : (
              'A partida termina aqui.'
            )}
          </p>
        </>
      ) : (
        <p className="avaliacao avaliacao--pendente">Analisando esta posição…</p>
      )}
    </div>
  )
}
