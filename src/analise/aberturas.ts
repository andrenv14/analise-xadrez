/**
 * Gancho da base de aberturas — **desligado**.
 *
 * A base (subconjunto de `lichess-org/chess-openings`, domínio público) ainda
 * não foi importada para este projeto. Enquanto ela não existir:
 *
 * - "Livro" **não é atribuído** a lance nenhum;
 * - "Brilhante" **não é suprimido** por teoria.
 *
 * Deliberadamente não há heurística substituta. Chutar teoria por número de
 * lances ("os 10 primeiros são abertura") produziria exatamente o erro que a
 * spec manda evitar: `1. e4` virando achado do jogador.
 *
 * Para ligar: preencher `BASE_DE_ABERTURAS` com uma implementação que consulte
 * o JSON estático. Nada mais no código precisa mudar.
 */

export type BaseDeAberturas = {
  /** A posição está dentro de teoria de abertura conhecida? */
  estaNaTeoria(fen: string): boolean
  /** Nome da abertura, quando conhecido. */
  nome(fen: string): string | null
}

export const BASE_DE_ABERTURAS: BaseDeAberturas | null = null

/** Enquanto não houver base, nenhuma posição é considerada teoria. */
export function estaNaTeoria(fen: string): boolean {
  return BASE_DE_ABERTURAS?.estaNaTeoria(fen) ?? false
}

/** `true` quando a classificação "Livro" pode ser atribuída. */
export const BASE_DE_ABERTURAS_DISPONIVEL = BASE_DE_ABERTURAS !== null
