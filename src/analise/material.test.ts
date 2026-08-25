import { describe, expect, it } from 'vitest'
import { aplicarLanceUci, materialEntregue, saldoDeMaterial } from './material'
import { uciParaSan } from '../chess/notacao'

/**
 * Lances especiais na contagem de material.
 *
 * Roque move duas peças, en passant captura numa casa vazia e promoção muda o
 * saldo em oito peões de um lance para o outro. Nenhum deles passa por
 * contagem ingênua — o saldo é lido da FEN resultante, que o `chess.js`
 * produz. Estes testes travam essa garantia.
 */

describe('lances especiais', () => {
  const AMBOS_OS_ROQUES = 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1'
  const EN_PASSANT = 'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3'
  const PROMOCAO = '8/4P3/8/8/8/8/k6K/8 w - - 0 1'

  it.each([
    ['roque curto', AMBOS_OS_ROQUES, 'e1g1', 'O-O'],
    ['roque longo', AMBOS_OS_ROQUES, 'e1c1', 'O-O-O'],
    ['en passant', EN_PASSANT, 'e5f6', 'exf6'],
    ['promoção a dama', PROMOCAO, 'e7e8q', 'e8=Q'],
    ['promoção a cavalo', PROMOCAO, 'e7e8n', 'e8=N'],
  ])('%s: o lance é aplicado e traduzido', (_nome, fen, uci, san) => {
    expect(aplicarLanceUci(fen, uci)).not.toBeNull()
    expect(uciParaSan(fen, uci)).toBe(san)
  })

  it.each([
    ['roque não mexe no material', AMBOS_OS_ROQUES, 'e1g1', 0],
    ['en passant ganha um peão', EN_PASSANT, 'e5f6', 100],
    ['promoção a dama troca peão por dama', PROMOCAO, 'e7e8q', 800],
    ['promoção a cavalo troca peão por cavalo', PROMOCAO, 'e7e8n', 220],
  ])('%s', (_nome, fen, uci, delta) => {
    const antes = saldoDeMaterial(fen, 'w')
    const depois = saldoDeMaterial(aplicarLanceUci(fen, uci)!, 'w')
    expect(depois - antes).toBe(delta)
  })
})

describe('materialEntregue distingue oferta de peça pendurada', () => {
  // Deflexão clássica: Rb8 entrega a torre para liberar o peão de a7.
  const DEFLEXAO = 'r6k/P6p/8/8/8/8/7P/1R5K w - - 0 1'

  it('reconhece a entrega quando a resposta captura na casa do lance', () => {
    const entrega = materialEntregue(DEFLEXAO, 'b1b8', 'a8b8', 'w')
    expect(entrega?.entregue).toBe(500)
    expect(entrega?.respostaCapturaNoDestino).toBe(true)
  })

  it('não reconhece entrega quando a captura é em outra casa', () => {
    // O material cai, mas por causa de uma peça que já estava pendurada — o
    // lance jogado não teve nada a ver com isso. É o que produzia
    // "sacrifício de 3,30 peões" num lance de rei.
    const entrega = materialEntregue(DEFLEXAO, 'h1g1', 'a8a7', 'w')
    expect(entrega?.respostaCapturaNoDestino).toBe(false)
  })

  it('devolve null para lance ilegal', () => {
    expect(materialEntregue(DEFLEXAO, 'b1b5', 'a8a7', 'w')).not.toBeNull()
    expect(materialEntregue(DEFLEXAO, 'h8h1', null, 'w')).toBeNull()
  })
})
