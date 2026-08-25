import { describe, expect, it } from 'vitest'
import avaliacoes from './__fixtures__/avaliacoes.json'
import { parsePgn } from '../chess/pgn'
import type { AnaliseDePosicao } from '../engine/tipos'
import { classificarPartida } from './classificarPartida'
import { discordancias, posicoesAReanalisar, plysContestados } from './consistencia'

/**
 * O caso que motivou a checagem de consistência.
 *
 * Na Ópera de Morphy, a busca da posição após `14... Qe6` estimava `Bxd7+` em
 * +6.65, e a busca da posição seguinte media +2.75 — duas leituras da mesma
 * posição, 3,90 peões de distância. A consequência visível era pior que o
 * número: o motor apontava `15... Nxd7` como melhor lance das pretas quando
 * ele perde por mate em 2, e o app repetia isso na tela.
 */

type Fixture = {
  pgn: string
  analises: (AnaliseDePosicao | null)[]
  reanalises?: Record<string, AnaliseDePosicao>
}
const morphy = avaliacoes.partidas.morphy as unknown as Fixture

const jogo = parsePgn(morphy.pgn)
const primeiraPassada = morphy.analises

/** Aplica a segunda passada, como o app faz depois de detectar a contradição. */
function comReanalise(): (AnaliseDePosicao | null)[] {
  const copia = primeiraPassada.slice()
  for (const [indice, analise] of Object.entries(morphy.reanalises ?? {})) {
    copia[Number(indice)] = analise
  }
  return copia
}

describe('a contradição é detectada', () => {
  it('acusa os dois meios-lances em volta de 15.Bxd7+', () => {
    const achados = discordancias(jogo, primeiraPassada)
    expect(achados.map((d) => d.ply)).toEqual([29, 30])
  })

  it('classifica cada motivo pelo que ele é', () => {
    const [bxd7, nxd7] = discordancias(jogo, primeiraPassada)
    // +6.65 estimado contra +2.75 medido: mesma categoria, distância grande.
    expect(bxd7.motivo).toBe('magnitude')
    expect(bxd7.diferencaCp).toBe(390)
    // +2.75 estimado contra mate medido: as duas não podem ser a mesma posição.
    expect(nxd7.motivo).toBe('categoria')
  })

  it('manda reanalisar o par inteiro, unificado', () => {
    // Plies 29 e 30 disparam; os pares {28,29} e {29,30} viram três posições.
    expect(posicoesAReanalisar(jogo, primeiraPassada)).toEqual([28, 29, 30])
  })

  it('não reanalisa duas vezes a mesma posição', () => {
    // Depois da segunda passada, nada mais a fazer: é o que garante que o
    // processo termina por construção, e não por convenção.
    expect(posicoesAReanalisar(jogo, comReanalise())).toEqual([])
  })

  it('ignora pares analisados com ajustes diferentes', () => {
    // Com as duas pontas no mesmo ajuste, o par 29 dispara.
    expect(discordancias(jogo, primeiraPassada).map((d) => d.ply)).toContain(29)

    // As MESMAS avaliações, mudando só a etiqueta de ajuste de uma ponta,
    // deixam de ser comparáveis — porque confrontar uma estimativa de
    // MultiPV 5 com uma medida de MultiPV 3 mede a diferença entre as duas
    // buscas, não a contradição. Sem esta regra a reanálise fabrica os
    // sintomas que veio curar, nas fronteiras que ela mesma cria.
    const misturado = primeiraPassada.slice()
    misturado[29] = {
      ...primeiraPassada[29]!,
      configuracao: { profundidade: 16, linhas: 5 },
    }
    expect(discordancias(jogo, misturado).map((d) => d.ply)).not.toContain(29)
    expect(discordancias(jogo, misturado).map((d) => d.ply)).not.toContain(30)
  })
})

describe('a reanálise corrige o que a contradição estragava', () => {
  const antes = classificarPartida(jogo, primeiraPassada).lances
  const depois = classificarPartida(jogo, comReanalise()).lances

  it('15...Nxd7 deixa de ser "Melhor"', () => {
    // Entrar num mate em 2 não pode ser o melhor lance da posição. Antes da
    // correção era, porque o motor colocava Nxd7 em primeiro.
    expect(jogo.plies[29].san).toBe('Nxd7')
    expect(antes[29]?.classificacao).toBe('melhor')
    expect(depois[29]?.classificacao).not.toBe('melhor')
    expect(depois[29]?.classificacao).toBe('mancada')
  })

  it('o motor passa a apontar Qxd7 como melhor defesa', () => {
    expect(primeiraPassada[29]!.melhorLance).toBe('f6d7')
    expect(morphy.reanalises![29].melhorLance).toBe('e6d7')
  })

  it('15.Bxd7+ segue sendo Melhor — ele é o lance principal do motor', () => {
    // A queda de +6.65 para +2.75 era erro do motor, não do jogador. Sem a
    // precedência do lance principal, os 390cp de "perda" fariam o app
    // chamar de mancada a jogada da combinação mais famosa do xadrez.
    expect(antes[28]?.classificacao).toBe('melhor')
    expect(depois[28]?.classificacao).toBe('melhor')
  })

  it('não sobra nenhum lance contestado nesta partida', () => {
    expect([...plysContestados(jogo, comReanalise())]).toEqual([])
  })
})

describe('a correção não mexe no resto da partida', () => {
  const depois = classificarPartida(jogo, comReanalise())

  it('os dois Brilhantes continuam de pé', () => {
    expect(depois.lances[24]?.classificacao).toBe('brilhante')
    expect(depois.lances[30]?.classificacao).toBe('brilhante')
    expect(depois.lances.filter((l) => l?.classificacao === 'brilhante')).toHaveLength(2)
  })

  it('só os lances em volta da contradição mudam de rótulo', () => {
    const antes = classificarPartida(jogo, primeiraPassada).lances
    const mudaram = jogo.plies
      .map((_, j) => j)
      .filter((j) => antes[j]?.classificacao !== depois.lances[j]?.classificacao)
    expect(mudaram).toEqual([29])
  })
})
