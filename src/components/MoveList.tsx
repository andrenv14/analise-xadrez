import { useEffect, useRef } from 'react'
import type { Ply } from '../chess/pgn'

type Props = {
  plies: Ply[]
  /** 0 = posição inicial; n = depois do n-ésimo meio-lance. */
  indiceAtual: number
  onSelecionar: (indice: number) => void
}

export function MoveList({ plies, indiceAtual, onSelecionar }: Props) {
  const atualRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    atualRef.current?.scrollIntoView({ block: 'nearest' })
  }, [indiceAtual])

  // Agrupa em linhas "N. brancas pretas".
  const linhas: { numero: number; brancas?: Ply; pretas?: Ply }[] = []
  for (const ply of plies) {
    const ultima = linhas[linhas.length - 1]
    if (ultima && ultima.numero === ply.moveNumber && ply.color === 'b' && !ultima.pretas) {
      ultima.pretas = ply
    } else {
      linhas.push(
        ply.color === 'w'
          ? { numero: ply.moveNumber, brancas: ply }
          : { numero: ply.moveNumber, pretas: ply },
      )
    }
  }

  const botao = (ply: Ply | undefined) => {
    if (!ply) return <span className="move move--vazio">…</span>
    const selecionado = ply.ply === indiceAtual
    return (
      <button
        type="button"
        ref={selecionado ? atualRef : undefined}
        className={selecionado ? 'move move--selecionado' : 'move'}
        aria-current={selecionado ? 'true' : undefined}
        onClick={() => onSelecionar(ply.ply)}
      >
        {ply.san}
      </button>
    )
  }

  return (
    <ol className="lista-lances">
      <li className="linha-lances linha-lances--inicio">
        <button
          type="button"
          ref={indiceAtual === 0 ? atualRef : undefined}
          className={indiceAtual === 0 ? 'move move--selecionado' : 'move'}
          onClick={() => onSelecionar(0)}
        >
          Posição inicial
        </button>
      </li>
      {linhas.map((linha) => (
        <li key={`${linha.numero}-${linha.brancas?.ply ?? linha.pretas?.ply}`} className="linha-lances">
          <span className="numero-lance">{linha.numero}.</span>
          {botao(linha.brancas)}
          {botao(linha.pretas)}
        </li>
      ))}
    </ol>
  )
}
