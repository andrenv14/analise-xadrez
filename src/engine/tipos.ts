/**
 * Tipos públicos da camada de motor.
 *
 * Toda avaliação que sai daqui já está do **ponto de vista das brancas**:
 * positivo = brancas melhor. O UCI devolve do ponto de vista de quem está
 * para jogar; a conversão acontece dentro desta camada e não vaza.
 */

export type Avaliacao =
  /** Vantagem material/posicional em centipeões, ponto de vista das brancas. */
  | { tipo: 'centipeoes'; centipeoes: number }
  /** Mate forçado. `lances` é assinado: +3 = brancas dão mate em 3, -3 = pretas. */
  | { tipo: 'mateEm'; lances: number }
  /** A posição já acabou no tabuleiro — não há lance a jogar. */
  | { tipo: 'fimDeJogo'; resultado: 'brancasVencem' | 'pretasVencem' | 'empate' }

/** Uma das linhas candidatas devolvidas pelo motor (MultiPV). */
export type LinhaDoMotor = {
  /** Primeiro lance da linha, em notação UCI (`e2e4`, `e7e8q`). */
  lance: string
  avaliacao: Avaliacao
  /** Variante principal completa, em UCI. Útil para inspecionar sacrifícios. */
  variante: string[]
  profundidade: number
}

export type AnaliseDePosicao = {
  /** FEN analisada, para conferência. */
  fen: string
  /**
   * Linhas candidatas em ordem de preferência **do lado que está para jogar**
   * — a melhor primeiro. Não reordenar pelo ponto de vista das brancas: a
   * ordem é o que diz se um lance era o único bom.
   */
  linhas: LinhaDoMotor[]
  /** Avaliação da posição: a da melhor linha. */
  avaliacao: Avaliacao
  /** Melhor lance em UCI. `null` quando a posição já acabou. */
  melhorLance: string | null
  /** Profundidade atingida na busca. */
  profundidade: number
}

export type OpcoesDeAnalise = {
  /** Profundidade de busca por posição. */
  profundidade: number
  /** Quantas linhas candidatas pedir ao motor (`MultiPV`). */
  linhas: number
}

export interface Motor {
  /** Resolve quando o WASM carregou e o motor respondeu ao handshake UCI. */
  pronto(): Promise<void>
  /** Analisa uma posição. Chamadas são enfileiradas e executadas em sequência. */
  analisar(fen: string, opcoes?: Partial<OpcoesDeAnalise>): Promise<AnaliseDePosicao>
  /** Interrompe a busca em andamento e descarta a fila. */
  cancelar(): void
  /** Encerra o Worker. O motor não pode ser reusado depois disso. */
  encerrar(): void
}

/** Lançado nas análises descartadas por `cancelar()`. */
export class AnaliseCancelada extends Error {
  constructor() {
    super('Análise cancelada.')
    this.name = 'AnaliseCancelada'
  }
}

export class ErroDoMotor extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDoMotor'
  }
}
