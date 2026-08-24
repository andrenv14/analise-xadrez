import { useCallback, useEffect, useMemo, useState } from 'react'
import { Chessboard } from 'react-chessboard'
import { EvalBar } from './components/EvalBar'
import { MoveList } from './components/MoveList'
import { PainelDoLance } from './components/PainelDoLance'
import { ProgressoDoMotor } from './components/ProgressoDoMotor'
import { fenNoIndice, parsePgn, PgnError } from './chess/pgn'
import type { ParsedGame } from './chess/pgn'
import { ResumoDaPartida } from './components/ResumoDaPartida'
import { classificarPartida } from './analise/classificarPartida'
import { resumirPartida } from './analise/resumo'
import { PGN_EXEMPLO } from './chess/partidaDeExemplo'
import { useAnaliseDaPartida } from './hooks/useAnaliseDaPartida'


export default function App() {
  const [pgn, setPgn] = useState('')
  const [jogo, setJogo] = useState<ParsedGame | null>(null)
  const [erro, setErro] = useState<{ mensagem: string; detalhe?: string } | null>(null)
  const [indice, setIndice] = useState(0)
  const [orientacao, setOrientacao] = useState<'white' | 'black'>('white')

  const analisar = useCallback(() => {
    try {
      const analisado = parsePgn(pgn)
      setJogo(analisado)
      setIndice(0)
      setErro(null)
    } catch (e) {
      setJogo(null)
      setIndice(0)
      setErro(
        e instanceof PgnError
          ? { mensagem: e.message, detalhe: e.detalhe }
          : { mensagem: 'Erro inesperado ao ler o PGN.' },
      )
    }
  }, [pgn])

  const irPara = useCallback(
    (destino: number) => {
      if (!jogo) return
      setIndice(Math.max(0, Math.min(destino, jogo.plies.length)))
    },
    [jogo],
  )

  // Navegação por teclado, sincronizada com a lista de lances.
  useEffect(() => {
    if (!jogo) return

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const alvo = e.target as HTMLElement | null
      const tag = alvo?.tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT' || alvo?.isContentEditable) return

      switch (e.key) {
        case 'ArrowLeft':
          setIndice((i) => Math.max(0, i - 1))
          break
        case 'ArrowRight':
          setIndice((i) => Math.min(jogo.plies.length, i + 1))
          break
        case 'Home':
          setIndice(0)
          break
        case 'End':
          setIndice(jogo.plies.length)
          break
        default:
          return
      }
      e.preventDefault()
    }

    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [jogo])

  const { analises, progresso } = useAnaliseDaPartida(jogo, indice)

  const partida = useMemo(
    () => (jogo ? classificarPartida(jogo, analises) : null),
    [jogo, analises],
  )
  const classificacoes = partida?.lances ?? []
  // Depende de `partida`, que é memoizado — e não de `classificacoes`, que é
  // um array novo a cada render quando não há partida.
  const resumo = useMemo(
    () => (jogo && partida ? resumirPartida(jogo.plies, partida.lances) : null),
    [jogo, partida],
  )

  const fen = useMemo(() => (jogo ? fenNoIndice(jogo, indice) : null), [jogo, indice])
  const fenAnterior = useMemo(
    () => (jogo && indice > 0 ? fenNoIndice(jogo, indice - 1) : null),
    [jogo, indice],
  )
  const analiseAtual = analises[indice] ?? null
  const classificadoAtual = indice > 0 ? (classificacoes[indice - 1] ?? null) : null

  const lanceAtual = jogo && indice > 0 ? jogo.plies[indice - 1] : null
  const destaques = lanceAtual
    ? {
        [lanceAtual.from]: { background: 'rgba(255, 214, 102, 0.55)' },
        [lanceAtual.to]: { background: 'rgba(255, 214, 102, 0.55)' },
      }
    : {}

  return (
    <div className="app">
      <header className="cabecalho">
        <h1>Avaliador de partidas de xadrez</h1>
        <p className="subtitulo">
          Cole um PGN e navegue a partida. A análise do motor entra em uma etapa seguinte.
        </p>
      </header>

      <section className="entrada">
        <label htmlFor="pgn">PGN da partida</label>
        <textarea
          id="pgn"
          value={pgn}
          spellCheck={false}
          placeholder="[Event ...]&#10;1. e4 e5 2. Nf3 ..."
          onChange={(e) => setPgn(e.target.value)}
        />
        <div className="acoes">
          <button type="button" className="primario" onClick={analisar}>
            Analisar
          </button>
          <button type="button" onClick={() => setPgn(PGN_EXEMPLO)}>
            Usar PGN de exemplo
          </button>
        </div>
        {erro && (
          <div className="erro" role="alert">
            <p>{erro.mensagem}</p>
            {erro.detalhe && <p className="erro-detalhe">{erro.detalhe}</p>}
          </div>
        )}
      </section>

      {jogo && fen && <ProgressoDoMotor progresso={progresso} />}

      {jogo && fen && (
        <section className="partida">
          <div className="coluna-tabuleiro">
            <div className="tabuleiro-com-eval">
              <EvalBar avaliacao={analiseAtual?.avaliacao ?? null} orientacao={orientacao} />
              <div className="tabuleiro">
                <Chessboard
                  options={{
                    id: 'tabuleiro-analise',
                    position: fen,
                    boardOrientation: orientacao,
                    allowDragging: false,
                    showNotation: true,
                    squareStyles: destaques,
                  }}
                />
              </div>
            </div>
            <div className="controles">
              <button type="button" onClick={() => irPara(0)} disabled={indice === 0}>
                ⏮ Início
              </button>
              <button type="button" onClick={() => irPara(indice - 1)} disabled={indice === 0}>
                ← Anterior
              </button>
              <button
                type="button"
                onClick={() => irPara(indice + 1)}
                disabled={indice === jogo.plies.length}
              >
                Próximo →
              </button>
              <button
                type="button"
                onClick={() => irPara(jogo.plies.length)}
                disabled={indice === jogo.plies.length}
              >
                Fim ⏭
              </button>
              <button
                type="button"
                onClick={() => setOrientacao((o) => (o === 'white' ? 'black' : 'white'))}
              >
                ⇅ Girar
              </button>
            </div>
            <p className="dica">
              Setas ← → percorrem os lances; Home e End vão para o começo e o fim.
            </p>
          </div>

          <aside className="coluna-lances">
            <h2>
              {jogo.headers.White ?? 'Brancas'} × {jogo.headers.Black ?? 'Pretas'}
              {jogo.headers.Result ? ` — ${jogo.headers.Result}` : ''}
            </h2>
            {partida?.abertura && (
              <p className="abertura">
                <span className="abertura__eco">{partida.abertura.eco}</span>
                {partida.abertura.nome}
              </p>
            )}
            <p className="posicao-atual">
              {lanceAtual
                ? `Lance ${lanceAtual.moveNumber}${lanceAtual.color === 'w' ? '.' : '...'} ${lanceAtual.san}`
                : 'Posição inicial'}
              <span className="contador">
                {indice} / {jogo.plies.length}
              </span>
            </p>
            <PainelDoLance
              analise={analiseAtual}
              fenAnterior={fenAnterior}
              classificado={classificadoAtual}
              estadoDoMotor={progresso.estado}
            />

            <MoveList
              plies={jogo.plies}
              indiceAtual={indice}
              classificacoes={classificacoes}
              onSelecionar={irPara}
            />
          </aside>
        </section>
      )}

      {jogo && resumo && (
        <ResumoDaPartida
          resumo={resumo}
          totalDePlies={jogo.plies.length}
          completo={progresso.estado === 'concluida'}
        />
      )}
    </div>
  )
}
