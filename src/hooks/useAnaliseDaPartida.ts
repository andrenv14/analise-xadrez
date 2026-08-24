import { useEffect, useRef, useState } from 'react'
import { AnaliseCancelada, criarMotor } from '../engine'
import type { AnaliseDePosicao, Motor } from '../engine'
import { fenNoIndice } from '../chess/pgn'
import type { ParsedGame } from '../chess/pgn'

export type EstadoDaAnalise = 'ocioso' | 'carregandoMotor' | 'analisando' | 'concluida' | 'erro'

export type ProgressoDaAnalise = {
  estado: EstadoDaAnalise
  /** Quantas posições já têm resultado. */
  concluidas: number
  /** Total de posições da partida (a inicial mais uma por meio-lance). */
  total: number
  erro: string | null
}

const PROGRESSO_OCIOSO: ProgressoDaAnalise = {
  estado: 'ocioso',
  concluidas: 0,
  total: 0,
  erro: null,
}

/**
 * Analisa a partida em segundo plano.
 *
 * A ordem **não** é do primeiro ao último lance: a posição que o usuário está
 * olhando fura a fila. Em máquina lenta, esperar o motor atravessar a partida
 * inteira para ver o lance 20 é a maior fonte de espera percebida — e é espera
 * por resultado que o usuário não pediu.
 *
 * O array devolvido tem uma entrada por posição, `null` onde o motor ainda não
 * chegou. Nada aqui bloqueia a renderização.
 */
export function useAnaliseDaPartida(jogo: ParsedGame | null, indiceSelecionado: number) {
  const [analises, setAnalises] = useState<(AnaliseDePosicao | null)[]>([])
  const [progresso, setProgresso] = useState<ProgressoDaAnalise>(PROGRESSO_OCIOSO)

  const motorRef = useRef<Motor | null>(null)
  // Cada partida analisada ganha uma geração; resultados de gerações antigas
  // que ainda estejam no ar são descartados em vez de sujar a tela.
  const geracaoRef = useRef(0)

  // O laço de análise lê a seleção atual a cada volta. Passar por ref em vez
  // de dependência evita reiniciar a análise a cada tecla de navegação.
  const selecaoRef = useRef(indiceSelecionado)
  useEffect(() => {
    selecaoRef.current = indiceSelecionado
  }, [indiceSelecionado])

  useEffect(() => {
    return () => {
      motorRef.current?.encerrar()
      motorRef.current = null
    }
  }, [])

  // Zerar o resultado quando a partida troca é ajuste de estado, não efeito
  // colateral: fazer isso durante a render evita o flash de uma render com a
  // análise da partida anterior ainda na tela.
  const [jogoAnterior, setJogoAnterior] = useState(jogo)
  if (jogo !== jogoAnterior) {
    setJogoAnterior(jogo)
    const total = jogo ? jogo.plies.length + 1 : 0
    setAnalises(new Array<AnaliseDePosicao | null>(total).fill(null))
    setProgresso(
      jogo ? { estado: 'carregandoMotor', concluidas: 0, total, erro: null } : PROGRESSO_OCIOSO,
    )
  }

  useEffect(() => {
    const geracao = ++geracaoRef.current

    if (!jogo) {
      motorRef.current?.cancelar()
      return
    }

    const total = jogo.plies.length + 1

    motorRef.current?.cancelar()
    motorRef.current ??= criarMotor()
    const motor = motorRef.current

    const desatualizada = () => geracaoRef.current !== geracao

    void (async () => {
      try {
        await motor.pronto()
        if (desatualizada()) return
        setProgresso((p) => ({ ...p, estado: 'analisando' }))

        // Posições que faltam, em ordem. A selecionada sai daqui na frente.
        const pendentes = new Set<number>(Array.from({ length: total }, (_, i) => i))

        while (pendentes.size > 0) {
          const selecionada = selecaoRef.current
          const proxima = pendentes.has(selecionada)
            ? selecionada
            : Math.min(...pendentes)

          const analise = await motor.analisar(fenNoIndice(jogo, proxima))
          if (desatualizada()) return

          pendentes.delete(proxima)
          setAnalises((anteriores) => {
            const copia = [...anteriores]
            copia[proxima] = analise
            return copia
          })
          setProgresso((p) => ({ ...p, concluidas: total - pendentes.size }))
        }

        if (desatualizada()) return
        setProgresso((p) => ({ ...p, estado: 'concluida' }))
      } catch (erro) {
        if (desatualizada() || erro instanceof AnaliseCancelada) return
        setProgresso((p) => ({
          ...p,
          estado: 'erro',
          erro: erro instanceof Error ? erro.message : 'Falha inesperada no motor.',
        }))
      }
    })()
  }, [jogo])

  return { analises, progresso }
}
