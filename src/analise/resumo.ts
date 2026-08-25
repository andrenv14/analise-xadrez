import type { Ply } from '../chess/pgn'
import type { Classificacao, LanceClassificado } from './classificacao'

export type ContagemPorClassificacao = Partial<Record<Classificacao, number>>

export type ResumoDaPartida = {
  brancas: ContagemPorClassificacao
  pretas: ContagemPorClassificacao
  /** Quantos meios-lances já foram classificados, de cada cor. */
  totalBrancas: number
  totalPretas: number
  /** Lances deliberadamente não julgados (forçados), de cada cor. */
  forcadosBrancas: number
  forcadosPretas: number
}

/**
 * Ordem de exibição: do melhor para o pior, com "Livro" à parte no fim.
 *
 * "Livro" não é um degrau da escala de qualidade — é a informação de que ali
 * não havia julgamento a fazer, então fica fora da sequência.
 */
export const ORDEM_DAS_CLASSIFICACOES: Classificacao[] = [
  'brilhante',
  'excelente',
  'melhor',
  'bom',
  'imprecisao',
  'erro',
  'mancada',
  'perdeu',
  'livro',
]

/** Conta as classificações de cada cor. Ignora lances ainda não analisados. */
export function resumirPartida(
  plies: Ply[],
  classificacoes: (LanceClassificado | null)[],
): ResumoDaPartida {
  const resumo: ResumoDaPartida = {
    brancas: {},
    pretas: {},
    totalBrancas: 0,
    totalPretas: 0,
    forcadosBrancas: 0,
    forcadosPretas: 0,
  }

  plies.forEach((ply, j) => {
    const classificado = classificacoes[j]
    if (!classificado) return

    const daBranca = ply.color === 'w'
    if (classificado.classificacao === null) {
      if (daBranca) resumo.forcadosBrancas++
      else resumo.forcadosPretas++
      return
    }

    const contagem = daBranca ? resumo.brancas : resumo.pretas
    contagem[classificado.classificacao] = (contagem[classificado.classificacao] ?? 0) + 1
    if (daBranca) resumo.totalBrancas++
    else resumo.totalPretas++
  })

  return resumo
}
