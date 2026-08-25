import { Fragment, useEffect, useRef } from 'react'
import type { Ply } from '../chess/pgn'
import type { Variante } from '../chess/variante'
import type { LanceClassificado } from '../analise/classificacao'
import { ROTULOS } from '../analise/rotulos'

type Props = {
  plies: Ply[]
  /** 0 = posição inicial; n = depois do n-ésimo meio-lance. */
  indiceAtual: number
  /** Uma entrada por meio-lance; `null` onde o motor ainda não classificou. */
  classificacoes: (LanceClassificado | null)[]
  /** Variante em exploração, ou `null`. */
  variante: Variante | null
  onSelecionar: (indice: number) => void
  onSelecionarNaVariante: (indice: number) => void
}

export function MoveList({
  plies,
  indiceAtual,
  classificacoes,
  variante,
  onSelecionar,
  onSelecionarNaVariante,
}: Props) {
  const atualRef = useRef<HTMLButtonElement>(null)

  // Dentro da variante, o foco de rolagem é o lance da variante, não o da
  // partida — que fica destacado só como ponto de partida.
  useEffect(() => {
    atualRef.current?.scrollIntoView({ block: 'nearest' })
  }, [indiceAtual, variante?.indice, variante?.lances.length])

  const naVariante = variante !== null

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

  const marcador = (ply: Ply) => {
    const classificado = classificacoes[ply.ply - 1]
    if (!classificado?.classificacao) return null
    const rotulo = ROTULOS[classificado.classificacao]
    return (
      <span
        className={`marcador marcador--${classificado.classificacao}`}
        title={`${rotulo.nome}: ${classificado.motivo}`}
      >
        {rotulo.simbolo}
      </span>
    )
  }

  const botao = (ply: Ply | undefined) => {
    // Casa vazia da lista: mantém o tom das pretas, para a alternância não
    // abrir um buraco branco na última linha de uma partida ímpar.
    if (!ply) return <span className="move move--vazio" />
    // Na variante, o lance de onde ela partiu fica marcado como raiz — não
    // como selecionado, porque o que está no tabuleiro é a variante.
    const ehRaizDaVariante = naVariante && ply.ply === variante.raiz
    const selecionado = !naVariante && ply.ply === indiceAtual
    // A assinatura: o fundo diz de quem é o lance.
    const classes = ['move', ply.color === 'w' ? 'move--brancas' : 'move--pretas']
    if (selecionado) classes.push('move--selecionado')
    if (ehRaizDaVariante) classes.push('move--raiz-da-variante')
    return (
      <button
        type="button"
        ref={selecionado ? atualRef : undefined}
        className={classes.join(' ')}
        aria-current={selecionado ? 'true' : undefined}
        onClick={() => onSelecionar(ply.ply)}
      >
        {ply.san}
        {marcador(ply)}
      </button>
    )
  }

  /** A ramificação, desenhada logo abaixo do lance de onde ela parte. */
  const ramo = (
    <li className="ramo-da-variante">
      <span className="ramo-da-variante__rotulo">variante</span>
      <span className="ramo-da-variante__lances">
        <button
          type="button"
          ref={variante?.indice === 0 ? atualRef : undefined}
          className={
            variante?.indice === 0 ? 'move move--na-variante move--selecionado' : 'move move--na-variante'
          }
          onClick={() => onSelecionarNaVariante(0)}
          title="Posição de onde a variante parte"
        >
          ⤷
        </button>
        {variante?.lances.map((lance, i) => {
          const selecionado = variante.indice === i + 1
          return (
            <button
              key={i}
              type="button"
              ref={selecionado ? atualRef : undefined}
              className={
                selecionado ? 'move move--na-variante move--selecionado' : 'move move--na-variante'
              }
              aria-current={selecionado ? 'true' : undefined}
              onClick={() => onSelecionarNaVariante(i + 1)}
            >
              {lance.color === 'w' ? `${lance.moveNumber}.` : i === 0 ? `${lance.moveNumber}…` : ''}
              {lance.san}
            </button>
          )
        })}
      </span>
    </li>
  )

  /** Depois de qual linha da lista o ramo deve aparecer. */
  const linhaDoRamo = variante
    ? linhas.findIndex((l) => l.brancas?.ply === variante.raiz || l.pretas?.ply === variante.raiz)
    : -1

  return (
    <ol className={naVariante ? 'lista-lances lista-lances--com-variante' : 'lista-lances'}>
      <li className="linha-lances linha-lances--inicio">
        <button
          type="button"
          ref={!naVariante && indiceAtual === 0 ? atualRef : undefined}
          className={
            !naVariante && indiceAtual === 0 ? 'move move--selecionado' : 'move'
          }
          onClick={() => onSelecionar(0)}
        >
          Posição inicial
        </button>
      </li>
      {/* Variante que parte da posição inicial não tem linha de lance acima. */}
      {variante?.raiz === 0 && ramo}
      {linhas.map((linha, i) => (
        <Fragment key={`${linha.numero}-${linha.brancas?.ply ?? linha.pretas?.ply}`}>
          <li className="linha-lances">
            <span className="numero-lance">{linha.numero}.</span>
            {botao(linha.brancas)}
            {botao(linha.pretas)}
          </li>
          {i === linhaDoRamo && ramo}
        </Fragment>
      ))}
    </ol>
  )
}
