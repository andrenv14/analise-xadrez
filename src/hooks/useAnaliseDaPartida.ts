import { useCallback, useEffect, useRef, useState } from 'react'
import { AnaliseCancelada, criarMotor } from '../engine'
import type { AnaliseDePosicao, Motor } from '../engine'
import { fenNoIndice } from '../chess/pgn'
import type { ParsedGame } from '../chess/pgn'
import { LINHAS_NA_REANALISE, posicoesAReanalisar } from '../analise/consistencia'

export type EstadoDaAnalise =
  | 'ocioso'
  | 'carregandoMotor'
  | 'analisando'
  /** Segunda passada nas posições em que as buscas vizinhas se contradizem. */
  | 'reanalisando'
  | 'concluida'
  | 'erro'

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
 * Analisa a partida em segundo plano, e posições avulsas sob demanda.
 *
 * A ordem da partida **não** é do primeiro ao último lance: a posição que o
 * usuário está olhando fura a fila. Em máquina lenta, esperar o motor
 * atravessar a partida inteira para ver o lance 20 é a maior fonte de espera
 * percebida — e é espera por resultado que o usuário não pediu.
 *
 * `fenAvulsa` é a posição de uma variante, fora da partida. Ela entra na
 * frente da fila do motor: é o que o usuário está olhando agora, e a partida
 * pode esperar. Os resultados ficam num cache por FEN, para que navegar para
 * frente e para trás dentro da variante não pague de novo.
 */
export function useAnaliseDaPartida(
  jogo: ParsedGame | null,
  indiceSelecionado: number,
  fenAvulsa: string | null,
) {
  const [analises, setAnalises] = useState<(AnaliseDePosicao | null)[]>([])
  const [progresso, setProgresso] = useState<ProgressoDaAnalise>(PROGRESSO_OCIOSO)
  const [avulsas, setAvulsas] = useState<Record<string, AnaliseDePosicao>>({})

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

  const obterMotor = useCallback(() => {
    motorRef.current ??= criarMotor()
    return motorRef.current
  }, [])

  // Zerar o resultado quando a partida troca é ajuste de estado, não efeito
  // colateral: fazer isso durante a render evita o flash de uma render com a
  // análise da partida anterior ainda na tela.
  const [jogoAnterior, setJogoAnterior] = useState(jogo)
  if (jogo !== jogoAnterior) {
    setJogoAnterior(jogo)
    const total = jogo ? jogo.plies.length + 1 : 0
    setAnalises(new Array<AnaliseDePosicao | null>(total).fill(null))
    setAvulsas({})
    setProgresso(
      jogo ? { estado: 'carregandoMotor', concluidas: 0, total, erro: null } : PROGRESSO_OCIOSO,
    )
  }

  // --- Análise da partida --------------------------------------------------
  useEffect(() => {
    const geracao = ++geracaoRef.current

    if (!jogo) {
      motorRef.current?.cancelar()
      return
    }

    const total = jogo.plies.length + 1

    motorRef.current?.cancelar()
    const motor = obterMotor()

    const desatualizada = () => geracaoRef.current !== geracao

    void (async () => {
      try {
        await motor.pronto()
        if (desatualizada()) return
        setProgresso((p) => ({ ...p, estado: 'analisando' }))

        // Espelho local do que já foi analisado. O laço precisa do array
        // inteiro para achar as contradições, e ler estado do React aqui
        // daria uma versão atrasada.
        const locais: (AnaliseDePosicao | null)[] = new Array(total).fill(null)

        const registrar = (indice: number, analise: AnaliseDePosicao) => {
          locais[indice] = analise
          setAnalises((anteriores) => {
            const copia = [...anteriores]
            copia[indice] = analise
            return copia
          })
        }

        // Posições que faltam, em ordem. A selecionada sai daqui na frente.
        const pendentes = new Set<number>(Array.from({ length: total }, (_, i) => i))

        while (pendentes.size > 0) {
          const selecionada = selecaoRef.current
          const proxima = pendentes.has(selecionada) ? selecionada : Math.min(...pendentes)

          const analise = await motor.analisar(fenNoIndice(jogo, proxima))
          if (desatualizada()) return

          pendentes.delete(proxima)
          registrar(proxima, analise)
          setProgresso((p) => ({ ...p, concluidas: total - pendentes.size }))
        }

        // --- Segunda passada -------------------------------------------
        // Onde duas buscas vizinhas se contradizem sobre a mesma posição,
        // uma delas está errada. A checagem é sobre resultados que a fila
        // já produziu — custo zero. Só as posições que reprovam pagam
        // análise mais cara, e cada uma no máximo uma vez.
        const alvos = posicoesAReanalisar(jogo, locais)
        if (alvos.length > 0) {
          setProgresso((p) => ({
            ...p,
            estado: 'reanalisando',
            concluidas: 0,
            total: alvos.length,
          }))
          for (const [feitas, alvo] of alvos.entries()) {
            const analise = await motor.analisar(fenNoIndice(jogo, alvo), {
              linhas: LINHAS_NA_REANALISE,
            })
            if (desatualizada()) return
            registrar(alvo, analise)
            setProgresso((p) => ({ ...p, concluidas: feitas + 1 }))
          }
        }

        if (desatualizada()) return
        setProgresso((p) => ({ ...p, estado: 'concluida', concluidas: total, total }))
      } catch (erro) {
        if (desatualizada() || erro instanceof AnaliseCancelada) return
        setProgresso((p) => ({
          ...p,
          estado: 'erro',
          erro: erro instanceof Error ? erro.message : 'Falha inesperada no motor.',
        }))
      }
    })()
  }, [jogo, obterMotor])

  // --- Análise da posição avulsa (variante) --------------------------------
  // Efeito separado de propósito: a análise da partida é um laço longo que
  // termina, e a variante pode aparecer bem depois dele. Amarrar as duas no
  // mesmo laço exigiria mantê-lo vivo à toa.
  useEffect(() => {
    if (!fenAvulsa || avulsas[fenAvulsa]) return

    const geracao = geracaoRef.current
    const motor = obterMotor()
    let descartada = false

    void (async () => {
      try {
        await motor.pronto()
        if (descartada || geracaoRef.current !== geracao) return
        const analise = await motor.analisar(fenAvulsa, { prioritaria: true })
        if (descartada || geracaoRef.current !== geracao) return
        setAvulsas((anteriores) => ({ ...anteriores, [fenAvulsa]: analise }))
      } catch {
        // Falha aqui não derruba a partida: a variante simplesmente fica sem
        // avaliação, e o painel diz que está esperando.
      }
    })()

    return () => {
      descartada = true
    }
  }, [fenAvulsa, avulsas, obterMotor])

  /** Esquece as análises de variante. Chamado ao descartar uma variante. */
  const esquecerAvulsas = useCallback(() => setAvulsas({}), [])

  return {
    analises,
    progresso,
    analiseAvulsa: fenAvulsa ? (avulsas[fenAvulsa] ?? null) : null,
    esquecerAvulsas,
  }
}
