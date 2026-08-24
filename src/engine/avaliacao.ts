import type { Avaliacao } from './tipos'

export type Cor = 'w' | 'b'

/** Lê de quem é a vez a partir da FEN. */
export function corQueJoga(fen: string): Cor {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w'
}

/**
 * Converte um score do UCI para o ponto de vista das brancas.
 *
 * O UCI sempre reporta do ponto de vista de **quem está para jogar**: com as
 * pretas na vez, `cp 672` significa que as *pretas* estão 6,72 peões melhor,
 * o que na nossa convenção é -672. Esta inversão é a fonte clássica de erro
 * de sinal, e é a única responsável por ela em todo o app.
 */
export function paraPontoDeVistaDasBrancas(
  score: { tipo: 'cp' | 'mate'; valor: number },
  quemJoga: Cor,
  temLanceLegal: boolean,
): Avaliacao {
  const sinal = quemJoga === 'w' ? 1 : -1

  // Sem lance legal: a partida acabou no tabuleiro. `mate 0` é xeque-mate
  // sofrido por quem estaria para jogar; qualquer outra coisa é afogamento.
  if (!temLanceLegal) {
    if (score.tipo === 'mate' && score.valor === 0) {
      return { tipo: 'fimDeJogo', resultado: quemJoga === 'w' ? 'pretasVencem' : 'brancasVencem' }
    }
    return { tipo: 'fimDeJogo', resultado: 'empate' }
  }

  if (score.tipo === 'mate') {
    return { tipo: 'mateEm', lances: sinal * score.valor }
  }
  return { tipo: 'centipeoes', centipeoes: sinal * score.valor }
}

/** Texto curto da avaliação: `+1.35`, `-0.60`, `M3`, `-M3`. */
export function formatarAvaliacao(avaliacao: Avaliacao): string {
  switch (avaliacao.tipo) {
    case 'centipeoes': {
      const peoes = avaliacao.centipeoes / 100
      const arredondado = peoes.toFixed(2)
      // Evita exibir "-0.00" quando o arredondamento zera um valor negativo.
      return Number(arredondado) > 0 ? `+${arredondado}` : arredondado.replace(/^-0\.00$/, '0.00')
    }
    case 'mateEm':
      return avaliacao.lances > 0 ? `M${avaliacao.lances}` : `-M${Math.abs(avaliacao.lances)}`
    case 'fimDeJogo':
      if (avaliacao.resultado === 'brancasVencem') return '1-0'
      if (avaliacao.resultado === 'pretasVencem') return '0-1'
      return '½-½'
  }
}

/** Frase legível para leitor de tela e para o painel lateral. */
export function descreverAvaliacao(avaliacao: Avaliacao): string {
  switch (avaliacao.tipo) {
    case 'centipeoes': {
      const peoes = Math.abs(avaliacao.centipeoes) / 100
      if (Math.abs(avaliacao.centipeoes) < 20) return 'posição equilibrada'
      const lado = avaliacao.centipeoes > 0 ? 'brancas' : 'pretas'
      return `${lado} melhor por ${peoes.toFixed(2)} peões`
    }
    case 'mateEm': {
      const lado = avaliacao.lances > 0 ? 'brancas' : 'pretas'
      return `${lado} dão mate em ${Math.abs(avaliacao.lances)}`
    }
    case 'fimDeJogo':
      if (avaliacao.resultado === 'brancasVencem') return 'xeque-mate: brancas vencem'
      if (avaliacao.resultado === 'pretasVencem') return 'xeque-mate: pretas vencem'
      return 'empate por afogamento'
  }
}

/**
 * Fração da eval bar ocupada pelas brancas, de 0 a 1.
 *
 * A curva é uma tangente hiperbólica: mantém boa resolução perto do zero, onde
 * a diferença importa, e satura sem estourar quando a vantagem é decisiva.
 */
export function fracaoDasBrancas(avaliacao: Avaliacao): number {
  switch (avaliacao.tipo) {
    case 'centipeoes':
      return 0.5 + 0.5 * Math.tanh(avaliacao.centipeoes / 400)
    case 'mateEm':
      return avaliacao.lances > 0 ? 1 : 0
    case 'fimDeJogo':
      if (avaliacao.resultado === 'brancasVencem') return 1
      if (avaliacao.resultado === 'pretasVencem') return 0
      return 0.5
  }
}

/**
 * Valor de um mate na escala de centipeões, para permitir comparação.
 * Bem acima de qualquer vantagem material plausível.
 */
export const VALOR_DE_MATE_CP = 30_000

/**
 * Reduz uma avaliação a um número comparável em centipeões, do ponto de vista
 * da cor dada. Mate vira um valor grande — mate mais curto vale mais, para
 * que trocar mate em 2 por mate em 6 ainda conte como piora.
 */
export function valorComparavel(avaliacao: Avaliacao, cor: Cor): number {
  const sinal = cor === 'w' ? 1 : -1
  switch (avaliacao.tipo) {
    case 'centipeoes':
      return sinal * avaliacao.centipeoes
    case 'mateEm':
      return (
        sinal *
        Math.sign(avaliacao.lances) *
        (VALOR_DE_MATE_CP - Math.abs(avaliacao.lances) * 100)
      )
    case 'fimDeJogo':
      if (avaliacao.resultado === 'empate') return 0
      return sinal * (avaliacao.resultado === 'brancasVencem' ? VALOR_DE_MATE_CP : -VALOR_DE_MATE_CP)
  }
}

/** Há mate forçado a favor da cor dada nesta avaliação? */
export function temMateFavoravel(avaliacao: Avaliacao, cor: Cor): boolean {
  if (avaliacao.tipo === 'mateEm') return cor === 'w' ? avaliacao.lances > 0 : avaliacao.lances < 0
  if (avaliacao.tipo === 'fimDeJogo') {
    return avaliacao.resultado === (cor === 'w' ? 'brancasVencem' : 'pretasVencem')
  }
  return false
}
