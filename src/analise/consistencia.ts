import { valorComparavel } from '../engine/avaliacao'
import type { AnaliseDePosicao, Avaliacao } from '../engine/tipos'
import type { ParsedGame } from '../chess/pgn'

/**
 * Detecção de inconsistência do motor entre posições vizinhas.
 *
 * A comparação **não** é entre a avaliação da posição N e a da N+1 — essa
 * mistura duas coisas que não se separam: o lance mudou a posição (xadrez) e
 * o motor mudou de ideia (erro).
 *
 * O MultiPV dá a comparação limpa. A linha da posição N correspondente ao
 * lance jogado **é** a avaliação da posição N+1, feita pela busca de N.
 * Confrontá-la com a avaliação que a própria busca de N+1 devolveu compara
 * duas estimativas da **mesma** posição. Qualquer diferença aí é
 * inconsistência do motor, por definição.
 *
 * O caso que motivou isto: na Ópera de Morphy, a posição após `14... Qe6`
 * estimava `Bxd7+` em +6.65, e a busca da posição seguinte media +2.75 —
 * 3,90 peões de diferença sobre a mesma posição. Consequência visível: o
 * motor colocava `15... Nxd7` como melhor lance das pretas quando ele perde
 * por mate em 2, e o app repetia isso na tela.
 */

/** Diferença a partir da qual duas estimativas em centipeões não podem ambas estar certas. */
export const LIMIAR_DE_DISCORDANCIA_CP = 300

/**
 * Magnitude mínima dos dois lados para que uma inversão de sinal conte.
 * Sem ela, oscilar entre -10 e +10 em torno do equilíbrio dispararia.
 */
const LIMIAR_DE_INVERSAO_CP = 100

/**
 * Quantas linhas a reanálise pede.
 *
 * A **profundidade não muda** de propósito. Aprofundar só algumas posições
 * tornaria as avaliações incomparáveis ao longo da partida: a perda de
 * centipeões calculada atravessando a fronteira entre uma posição funda e
 * uma rasa mede a diferença de força da busca, não o lance. Alargar o
 * MultiPV ataca a falha onde ela acontece — que é de ordenação de linhas —
 * sem mexer na escala.
 */
export const LINHAS_NA_REANALISE = 5

export type Discordancia = {
  /** Meio-lance cujo par de posições discorda. */
  ply: number
  motivo: 'categoria' | 'sinal' | 'magnitude'
  /** Diferença em centipeões, quando os dois lados são centipeões. */
  diferencaCp: number | null
}

const ehDecisiva = (a: Avaliacao) => a.tipo === 'mateEm' || a.tipo === 'fimDeJogo'

function comparar(estimativa: Avaliacao, medida: Avaliacao): Discordancia['motivo'] | null {
  const a = valorComparavel(estimativa, 'w')
  const b = valorComparavel(medida, 'w')

  // Um lado vê mate e o outro não, ou os dois veem mate para lados opostos.
  if (ehDecisiva(estimativa) !== ehDecisiva(medida)) return 'categoria'
  if (ehDecisiva(estimativa) && ehDecisiva(medida) && Math.sign(a) !== Math.sign(b)) {
    return 'categoria'
  }

  if (
    Math.sign(a) === -Math.sign(b) &&
    Math.abs(a) >= LIMIAR_DE_INVERSAO_CP &&
    Math.abs(b) >= LIMIAR_DE_INVERSAO_CP
  ) {
    return 'sinal'
  }

  if (
    !ehDecisiva(estimativa) &&
    !ehDecisiva(medida) &&
    Math.abs(a - b) >= LIMIAR_DE_DISCORDANCIA_CP
  ) {
    return 'magnitude'
  }

  return null
}

/**
 * Lista os meios-lances cujo par de posições se contradiz.
 *
 * Dois pares são deliberadamente ignorados:
 *
 * - **Configurações diferentes.** Comparar uma estimativa de MultiPV 5 com
 *   uma medida de MultiPV 3 é injusto e produz discordância onde não há. Sem
 *   esta regra a reanálise fabrica os sintomas que veio curar: medido numa
 *   partida de 134 lances, 2 dos 5 casos que "sobreviviam" à escalada eram
 *   pares de fronteira, não inconsistências.
 * - **Lance fora do MultiPV.** Se o lance jogado não está entre as linhas
 *   devolvidas, não há estimativa para confrontar. Acontece em 6 dos 33
 *   meios-lances da partida de exemplo: é limite do método, não falha.
 */
export function discordancias(
  jogo: ParsedGame,
  analises: (AnaliseDePosicao | null)[],
): Discordancia[] {
  const achados: Discordancia[] = []

  jogo.plies.forEach((ply, j) => {
    const antes = analises[j]
    const depois = analises[j + 1]
    if (!antes || !depois) return
    if (
      antes.configuracao.profundidade !== depois.configuracao.profundidade ||
      antes.configuracao.linhas !== depois.configuracao.linhas
    ) {
      return
    }

    const linha = antes.linhas.find((l) => l.lance === ply.uci)
    if (!linha) return

    const motivo = comparar(linha.avaliacao, depois.avaliacao)
    if (!motivo) return

    const a = valorComparavel(linha.avaliacao, 'w')
    const b = valorComparavel(depois.avaliacao, 'w')
    achados.push({
      ply: ply.ply,
      motivo,
      diferencaCp: motivo === 'magnitude' ? Math.abs(a - b) : null,
    })
  })

  return achados
}

/** Uma posição já passou pela reanálise? */
export function jaReanalisada(analise: AnaliseDePosicao | null): boolean {
  return analise !== null && analise.configuracao.linhas >= LINHAS_NA_REANALISE
}

/**
 * Posições a reanalisar: o **par inteiro** de cada discordância.
 *
 * O par, e não só uma das pontas, porque não se sabe qual das duas buscas
 * errou. Pares que se sobrepõem viram um conjunto só — na partida de exemplo
 * os meios-lances 29 e 30 disparam e resultam em três posições, não quatro.
 *
 * Posições já reanalisadas ficam de fora: cada uma é aprofundada no máximo
 * uma vez, o que faz o processo terminar por construção e não por convenção.
 */
export function posicoesAReanalisar(
  jogo: ParsedGame,
  analises: (AnaliseDePosicao | null)[],
): number[] {
  const alvos = new Set<number>()
  for (const { ply } of discordancias(jogo, analises)) {
    for (const posicao of [ply - 1, ply]) {
      if (!jaReanalisada(analises[posicao])) alvos.add(posicao)
    }
  }
  return [...alvos].sort((a, b) => a - b)
}

/**
 * Meios-lances que continuam se contradizendo **depois** de a reanálise ter
 * sido feita nas duas pontas. São os que a tela marca como contestados.
 */
export function plysContestados(
  jogo: ParsedGame,
  analises: (AnaliseDePosicao | null)[],
): Set<number> {
  const contestados = new Set<number>()
  for (const { ply } of discordancias(jogo, analises)) {
    if (jaReanalisada(analises[ply - 1]) && jaReanalisada(analises[ply])) {
      contestados.add(ply)
    }
  }
  return contestados
}
