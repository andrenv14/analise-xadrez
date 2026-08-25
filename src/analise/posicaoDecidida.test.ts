import { describe, expect, it } from 'vitest'
import type { AnaliseDePosicao, Avaliacao } from '../engine/tipos'
import { classificarLance } from './classificacao'
import { PARAMETROS_DE_CLASSIFICACAO as P } from './parametros'

/**
 * Pisos de posição decidida.
 *
 * Aqui as avaliações são montadas à mão de propósito: o que se testa é a
 * fronteira do parâmetro, e amarrá-la a uma partida real tornaria o teste
 * refém de qual posição o Stockfish escolheu naquele dia.
 *
 * A assimetria entre os dois pisos é deliberada e está na spec: entregar
 * material estando pior é quase sempre desespero, mas achar o único lance que
 * evita o desastre estando pior é a defesa que merece elogio.
 */

// Posição real antes de 16.Qb8+ na Ópera de Morphy: sacrifício de dama.
const FEN_ANTES = '4kb1r/p2n1ppp/4q3/4p1B1/4P3/1Q6/PPP2PPP/2KR4 w k - 0 16'
const FEN_DEPOIS = '1Q2kb1r/p2n1ppp/4q3/4p1B1/4P3/8/PPP2PPP/2KR4 b k - 1 16'
const SACRIFICIO_UCI = 'b3b8'

function analise(
  fen: string,
  lances: string[],
  avaliacoes: Avaliacao[],
): AnaliseDePosicao {
  return {
    fen,
    linhas: lances.map((lance, i) => ({
      lance,
      avaliacao: avaliacoes[i],
      variante: [lance],
      profundidade: 16,
    })),
    avaliacao: avaliacoes[0],
    melhorLance: lances[0],
    profundidade: 16,
  }
}

const cp = (centipeoes: number): Avaliacao => ({ tipo: 'centipeoes', centipeoes })

/** Mesmo sacrifício, perda zero; só muda o patamar da avaliação. */
function classificarSacrificio(patamarCp: number) {
  const antes = analise(FEN_ANTES, [SACRIFICIO_UCI, 'b3b7', 'g5f6'], [
    cp(patamarCp),
    cp(patamarCp - 20),
    cp(patamarCp - 40),
  ])
  const depois = analise(FEN_DEPOIS, ['d7b8', 'e8e7'], [cp(patamarCp), cp(patamarCp - 20)])
  return classificarLance(antes, depois, SACRIFICIO_UCI, false)
}

describe('Brilhante exige posição jogável', () => {
  it(`vale enquanto a desvantagem não passa de ${P.LIMIAR_DE_POSICAO_JOGAVEL_CP}cp`, () => {
    expect(classificarSacrificio(150).classificacao).toBe('brilhante')
    expect(classificarSacrificio(-100).classificacao).toBe('brilhante')
    expect(classificarSacrificio(-P.LIMIAR_DE_POSICAO_JOGAVEL_CP + 10).classificacao).toBe(
      'brilhante',
    )
  })

  it('deixa de valer em posição já perdida', () => {
    // O caso relatado: `37. f3` com a avaliação em -7.40 saindo como
    // "sacrifício de 3,30 peões". Em posição perdida o material sai de
    // qualquer forma; o motor só escolhe a maneira menos ruim de perder.
    expect(classificarSacrificio(-P.LIMIAR_DE_POSICAO_JOGAVEL_CP - 10).classificacao).toBe('melhor')
    expect(classificarSacrificio(-740).classificacao).toBe('melhor')
  })
})

/** Lance principal com a segunda linha muito pior; só muda o patamar. */
function classificarLanceUnico(patamarCp: number) {
  const distante = patamarCp - P.LIMIAR_DE_LANCE_UNICO_CP - 100
  const antes = analise(FEN_ANTES, ['d1d7', 'b3b7', 'g5f6'], [
    cp(patamarCp),
    cp(distante),
    cp(distante - 50),
  ])
  const depois = analise(FEN_DEPOIS, ['e8e7', 'e6e7'], [cp(patamarCp), cp(patamarCp - 20)])
  return classificarLance(antes, depois, 'd1d7', false)
}

describe('Excelente exige posição defensável', () => {
  it(`vale enquanto a desvantagem não passa de ${P.LIMIAR_DE_POSICAO_DEFENSAVEL_CP}cp`, () => {
    expect(classificarLanceUnico(0).classificacao).toBe('excelente')
    expect(classificarLanceUnico(-P.LIMIAR_DE_POSICAO_DEFENSAVEL_CP + 10).classificacao).toBe(
      'excelente',
    )
  })

  it('deixa de valer quando a posição já está decidida', () => {
    // `15... Nxd7` da Ópera escolhia entre perder devagar e levar mate na
    // hora, e isso virava "o único lance que segurava a posição".
    expect(classificarLanceUnico(-P.LIMIAR_DE_POSICAO_DEFENSAVEL_CP - 10).classificacao).toBe(
      'melhor',
    )
  })

  it('é mais permissivo que o piso do Brilhante, de propósito', () => {
    expect(P.LIMIAR_DE_POSICAO_DEFENSAVEL_CP).toBeGreaterThan(P.LIMIAR_DE_POSICAO_JOGAVEL_CP)
    // Uma desvantagem entre os dois pisos: defesa ainda conta, sacrifício não.
    const entre = -(P.LIMIAR_DE_POSICAO_JOGAVEL_CP + P.LIMIAR_DE_POSICAO_DEFENSAVEL_CP) / 2
    expect(classificarLanceUnico(entre).classificacao).toBe('excelente')
    expect(classificarSacrificio(entre).classificacao).toBe('melhor')
  })
})
