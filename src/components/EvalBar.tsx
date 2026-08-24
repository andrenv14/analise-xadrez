import { descreverAvaliacao, formatarAvaliacao, fracaoDasBrancas } from '../engine'
import type { Avaliacao } from '../engine'

type Props = {
  /** `null` enquanto o motor ainda não chegou nesta posição. */
  avaliacao: Avaliacao | null
  /** Acompanha a orientação do tabuleiro: as brancas ficam do lado delas. */
  orientacao: 'white' | 'black'
}

export function EvalBar({ avaliacao, orientacao }: Props) {
  const fracao = avaliacao ? fracaoDasBrancas(avaliacao) : 0.5
  const brancasEmBaixo = orientacao === 'white'

  return (
    <div
      className={avaliacao ? 'eval-bar' : 'eval-bar eval-bar--pendente'}
      role="img"
      aria-label={avaliacao ? descreverAvaliacao(avaliacao) : 'posição ainda não analisada'}
    >
      <div
        className="eval-bar__brancas"
        style={{
          height: `${(fracao * 100).toFixed(1)}%`,
          [brancasEmBaixo ? 'bottom' : 'top']: 0,
        }}
      />
      <span className="eval-bar__rotulo">{avaliacao ? formatarAvaliacao(avaliacao) : '…'}</span>
    </div>
  )
}
