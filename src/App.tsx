import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chessboard } from 'react-chessboard'
import { EvalBar } from './components/EvalBar'
import { MoveList } from './components/MoveList'
import { PainelDaVariante } from './components/PainelDaVariante'
import { PainelDoLance } from './components/PainelDoLance'
import { ProgressoDoMotor } from './components/ProgressoDoMotor'
import { fenNoIndice, parsePartidas, PgnError, rotularPartida } from './chess/pgn'
import type { ParsedGame } from './chess/pgn'
import { ResumoDaPartida } from './components/ResumoDaPartida'
import { classificarPartida } from './analise/classificarPartida'
import { resumirPartida } from './analise/resumo'
import { PGN_EXEMPLO } from './chess/partidaDeExemplo'
import {
  criarVariante,
  fenDaVariante,
  fensDaVariante,
  irParaNaVariante,
  jogarNaVariante,
} from './chess/variante'
import type { Variante } from './chess/variante'
import { aberturaDaPartida } from './analise/aberturas'
import { useAnaliseDaPartida } from './hooks/useAnaliseDaPartida'


export default function App() {
  const [pgn, setPgn] = useState('')
  const [partidas, setPartidas] = useState<ParsedGame[]>([])
  const [indiceDaPartida, setIndiceDaPartida] = useState(0)
  const [erro, setErro] = useState<{ mensagem: string; detalhe?: string } | null>(null)
  const [indice, setIndice] = useState(0)
  const [orientacao, setOrientacao] = useState<'white' | 'black'>('white')

  const analisar = useCallback(() => {
    try {
      const analisadas = parsePartidas(pgn)
      setPartidas(analisadas)
      setIndiceDaPartida(0)
      setIndice(0)
      setErro(null)
    } catch (e) {
      setPartidas([])
      setIndiceDaPartida(0)
      setIndice(0)
      setErro(
        e instanceof PgnError
          ? { mensagem: e.message, detalhe: e.detalhe }
          : { mensagem: 'Erro inesperado ao ler o PGN.' },
      )
    }
  }, [pgn])

  const jogo = partidas[indiceDaPartida] ?? null

  // Uma variante por vez, por decisão de escopo: começar outra descarta a
  // anterior, em vez de acumular uma árvore.
  const [variante, setVariante] = useState<Variante | null>(null)
  const naVariante = variante !== null
  // O handler de teclado é registrado uma vez por partida; ler a variante por
  // ref evita reassinar o listener a cada lance do usuário.
  const varianteRef = useRef(variante)
  useEffect(() => {
    varianteRef.current = variante
  }, [variante])

  /** Origem escolhida no modo clicar-origem-depois-destino. */
  const [origemSelecionada, setOrigemSelecionada] = useState<string | null>(null)

  const trocarDePartida = useCallback((novoIndice: number) => {
    setIndiceDaPartida(novoIndice)
    setIndice(0)
    setVariante(null)
  }, [])

  // Clicar num lance da partida é uma das três formas de sair da variante.
  const irPara = useCallback(
    (destino: number) => {
      if (!jogo) return
      setVariante(null)
      setIndice(Math.max(0, Math.min(destino, jogo.plies.length)))
    },
    [jogo],
  )

  const sairDaVariante = useCallback(() => setVariante(null), [])

  const irParaNaVarianteAtual = useCallback((destino: number) => {
    setVariante((v) => (v ? irParaNaVariante(v, destino) : v))
  }, [])

  /**
   * Executa um lance do usuário. Lance ilegal simplesmente não acontece —
   * numa exploração livre, tentar o impossível é parte de explorar.
   *
   * Promove sempre a dama: pedir a peça de promoção exigiria um diálogo, e
   * subpromoção em exploração livre é raridade que não paga o custo.
   */
  const jogarLanceDoUsuario = useCallback(
    (de: string, para: string) => {
      if (!jogo) return false
      const base = variante ?? criarVariante(indice, fenNoIndice(jogo, indice))
      const proxima = jogarNaVariante(base, de, para)
      if (!proxima) return false
      setVariante(proxima)
      return true
    },
    [jogo, variante, indice],
  )

  // Navegação por teclado, sincronizada com a lista de lances.
  useEffect(() => {
    if (!jogo) return

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const alvo = e.target as HTMLElement | null
      const tag = alvo?.tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT' || alvo?.isContentEditable) return

      if (e.key === 'Escape') {
        // Esc só faz sentido dentro da variante; fora dela, não sequestra a
        // tecla de ninguém.
        if (!varianteRef.current) return
        setVariante(null)
        e.preventDefault()
        return
      }

      // Dentro da variante as setas percorrem a variante, não a partida.
      const atual = varianteRef.current
      if (atual) {
        switch (e.key) {
          case 'ArrowLeft':
            setVariante((v) => (v ? irParaNaVariante(v, v.indice - 1) : v))
            break
          case 'ArrowRight':
            setVariante((v) => (v ? irParaNaVariante(v, v.indice + 1) : v))
            break
          case 'Home':
            setVariante((v) => (v ? irParaNaVariante(v, 0) : v))
            break
          case 'End':
            setVariante((v) => (v ? irParaNaVariante(v, v.lances.length) : v))
            break
          default:
            return
        }
        e.preventDefault()
        return
      }

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

  const fenDaVarianteAtual = variante ? fenDaVariante(variante) : null

  const { analises, progresso, analiseAvulsa, esquecerAvulsas } = useAnaliseDaPartida(
    jogo,
    indice,
    fenDaVarianteAtual,
  )

  // Descartar a variante descarta as análises dela: uma por vez, sem acumular.
  useEffect(() => {
    if (!variante) esquecerAvulsas()
  }, [variante, esquecerAvulsas])

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

  /** O que está no tabuleiro: a variante manda enquanto existir. */
  const analiseExibida = naVariante ? analiseAvulsa : analiseAtual

  /**
   * Abertura da posição exibida.
   *
   * Na variante, a sequência é "os lances da partida até a raiz" mais "os
   * lances do usuário até aqui" — assim o nome atualiza se a variante
   * transpõe para outra teoria, e some se ela sai do livro. Deixar o nome da
   * partida principal preso na tela seria mentira.
   */
  const aberturaExibida = useMemo(() => {
    if (!jogo) return null
    if (!variante) return partida?.abertura ?? null
    const ateARaiz = jogo.plies.slice(0, variante.raiz).map((p) => p.fen)
    const naVariante = fensDaVariante(variante).slice(0, variante.indice)
    return aberturaDaPartida([...ateARaiz, ...naVariante])
  }, [jogo, variante, partida])
  const classificadoAtual = indice > 0 ? (classificacoes[indice - 1] ?? null) : null

  const lanceAtual = jogo && indice > 0 ? jogo.plies[indice - 1] : null
  const lanceExibido =
    variante && variante.indice > 0 ? variante.lances[variante.indice - 1] : lanceAtual

  const destaques: Record<string, React.CSSProperties> = {}
  if (lanceExibido) {
    // Amarelo para lance da partida, verde para lance do usuário: o tabuleiro
    // também precisa dizer que estamos numa variante.
    const cor = naVariante ? 'rgba(111, 158, 106, 0.5)' : 'rgba(255, 214, 102, 0.55)'
    destaques[lanceExibido.from] = { background: cor }
    destaques[lanceExibido.to] = { background: cor }
  }
  if (origemSelecionada) {
    destaques[origemSelecionada] = { background: 'rgba(53, 196, 196, 0.55)' }
  }

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

      {partidas.length > 1 && (
        <div className="seletor-de-partida">
          <label htmlFor="partida">
            {partidas.length} partidas neste PGN
          </label>
          <select
            id="partida"
            value={indiceDaPartida}
            onChange={(e) => trocarDePartida(Number(e.target.value))}
          >
            {partidas.map((p, i) => (
              <option key={i} value={i}>
                {rotularPartida(p, i)}
              </option>
            ))}
          </select>
        </div>
      )}

      {jogo && fen && <ProgressoDoMotor progresso={progresso} />}

      {jogo && fen && (
        <section className="partida">
          <div className="coluna-tabuleiro">
            <div className={naVariante ? 'tabuleiro-com-eval na-variante' : 'tabuleiro-com-eval'}>
              <EvalBar avaliacao={analiseExibida?.avaliacao ?? null} orientacao={orientacao} />
              <div className="tabuleiro">
                <Chessboard
                  options={{
                    id: 'tabuleiro-analise',
                    position: fenDaVarianteAtual ?? fen,
                    boardOrientation: orientacao,
                    allowDragging: true,
                    showNotation: true,
                    squareStyles: destaques,
                    onPieceDrop: ({ sourceSquare, targetSquare }) => {
                      setOrigemSelecionada(null)
                      if (!targetSquare) return false
                      return jogarLanceDoUsuario(sourceSquare, targetSquare)
                    },
                    onSquareClick: ({ square, piece }) => {
                      // Clicar origem e depois destino, para quem não arrasta.
                      if (origemSelecionada === null) {
                        if (piece) setOrigemSelecionada(square)
                        return
                      }
                      if (square === origemSelecionada) {
                        setOrigemSelecionada(null)
                        return
                      }
                      const jogou = jogarLanceDoUsuario(origemSelecionada, square)
                      // Lance ilegal em cima de peça própria vira nova origem,
                      // em vez de exigir um clique a mais para recomeçar.
                      setOrigemSelecionada(jogou ? null : piece ? square : null)
                    },
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
            {!naVariante && aberturaExibida && (
              <p className="abertura">
                <span className="abertura__eco">{aberturaExibida.eco}</span>
                {aberturaExibida.nome}
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
            {naVariante ? (
              <PainelDaVariante
                analise={analiseAvulsa}
                fen={fenDaVarianteAtual ?? fen}
                abertura={aberturaExibida}
                quantosLances={variante.lances.length}
                onVoltar={sairDaVariante}
              />
            ) : (
              <PainelDoLance
                analise={analiseAtual}
                fenAnterior={fenAnterior}
                classificado={classificadoAtual}
                desfecho={indice === jogo.plies.length ? jogo.desfecho : null}
                estadoDoMotor={progresso.estado}
              />
            )}

            <MoveList
              plies={jogo.plies}
              indiceAtual={indice}
              classificacoes={classificacoes}
              variante={variante}
              onSelecionar={irPara}
              onSelecionarNaVariante={irParaNaVarianteAtual}
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
