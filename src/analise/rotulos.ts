import type { Classificacao } from './classificacao'

/**
 * Nome e marcador de cada classificação.
 *
 * Os símbolos são a anotação clássica de xadrez (!!, !, ?!, ?, ??), que é
 * domínio público do jogo há mais de um século. Nada aqui imita ícone, paleta
 * ou layout do chess.com — só o vocabulário, que é palavra de domínio.
 *
 * "Livro" usa `≡` e não um emoji: emoji é desenhado pelo sistema operacional,
 * então destoa do resto em peso, cor e alinhamento, e denuncia um sistema de
 * símbolos improvisado. Aqui os nove marcadores vivem na mesma tipografia.
 */
export const ROTULOS: Record<Classificacao, { nome: string; simbolo: string }> = {
  brilhante: { nome: 'Brilhante', simbolo: '!!' },
  excelente: { nome: 'Excelente', simbolo: '!' },
  melhor: { nome: 'Melhor', simbolo: '★' },
  livro: { nome: 'Livro', simbolo: '≡' },
  bom: { nome: 'Bom', simbolo: '·' },
  imprecisao: { nome: 'Imprecisão', simbolo: '?!' },
  erro: { nome: 'Erro', simbolo: '?' },
  mancada: { nome: 'Mancada', simbolo: '??' },
  perdeu: { nome: 'Perdeu', simbolo: '✕' },
}
