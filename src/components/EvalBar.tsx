import type { CSSProperties } from 'react'
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
        className={
          brancasEmBaixo
            ? 'eval-bar__brancas eval-bar__brancas--baixo'
            : 'eval-bar__brancas eval-bar__brancas--cima'
        }
        style={
          {
            height: `${(fracao * 100).toFixed(1)}%`,
            [brancasEmBaixo ? 'bottom' : 'top']: 0,
            // No celular a barra deita e o preenchimento passa a ser
            // horizontal; o CSS lê esta variável em vez da altura.
            '--fracao-brancas': `${(fracao * 100).toFixed(1)}%`,
          } as CSSProperties
        }
      />
      <span className="eval-bar__rotulo">{avaliacao ? formatarAvaliacao(avaliacao) : '…'}</span>
    </div>
  )
}
