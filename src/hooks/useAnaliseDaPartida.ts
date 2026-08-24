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
 * Analisa a partida em segundo plano, da posição inicial até a última.
 *
 * O array devolvido tem uma entrada por posição — `null` enquanto o motor não
 * chegou nela. A interface continua navegável o tempo todo: nada aqui bloqueia
 * a renderização.
 */
export function useAnaliseDaPartida(jogo: ParsedGame | null) {
  const [analises, setAnalises] = useState<(AnaliseDePosicao | null)[]>([])
  const [progresso, setProgresso] = useState<ProgressoDaAnalise>(PROGRESSO_OCIOSO)

  const motorRef = useRef<Motor | null>(null)
  // Cada partida analisada ganha uma geração; resultados de gerações antigas
  // que ainda estejam no ar são descartados em vez de sujar a tela.
  const geracaoRef = useRef(0)

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

        for (let i = 0; i < total; i++) {
          const analise = await motor.analisar(fenNoIndice(jogo, i))
          if (desatualizada()) return
          setAnalises((anteriores) => {
            const copia = [...anteriores]
            copia[i] = analise
            return copia
          })
          setProgresso((p) => ({ ...p, concluidas: i + 1 }))
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
