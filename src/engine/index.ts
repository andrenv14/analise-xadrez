export { criarMotor } from './motor'
export { LINHAS_DO_MOTOR, PROFUNDIDADE_DE_ANALISE } from './configuracao'
export {
  corQueJoga,
  descreverAvaliacao,
  formatarAvaliacao,
  fracaoDasBrancas,
  temMateFavoravel,
  valorComparavel,
  VALOR_DE_MATE_CP,
} from './avaliacao'
export type { Cor } from './avaliacao'
export { AnaliseCancelada, ErroDoMotor } from './tipos'
export type {
  AnaliseDePosicao,
  Avaliacao,
  ConfiguracaoDaBusca,
  LinhaDoMotor,
  Motor,
  OpcoesDeAnalise,
} from './tipos'
