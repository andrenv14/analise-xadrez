/**
 * Ponto de entrada do bundle usado pelo arranjo de calibração.
 *
 * Existe para que a calibração rode **o código de verdade** — o mesmo parser
 * de UCI e a mesma classificação que a página usa. Medir uma reimplementação
 * paralela mediria a reimplementação, não o produto.
 *
 * Exporta também as primitivas (`materialEntregue`, `valorComparavel`) para
 * diagnóstico pontual de um lance específico fora do navegador.
 */
export { lerInfo, lerMelhorLance, montarAnalise } from '../../src/engine/protocolo'
export { classificarPartida } from '../../src/analise/classificarPartida'
export { classificarLance } from '../../src/analise/classificacao'
export { parsePgn, fenNoIndice } from '../../src/chess/pgn'
export { PARAMETROS_DE_CLASSIFICACAO } from '../../src/analise/parametros'
export { PGN_EXEMPLO } from '../../src/chess/partidaDeExemplo'
export { materialEntregue } from '../../src/analise/material'
export { valorComparavel, corQueJoga } from '../../src/engine/avaliacao'
export { aplicarLanceUci, saldoDeMaterial, contarLancesLegais } from '../../src/analise/material'
export { limiteDaTeoria, aberturaDaPartida } from '../../src/analise/aberturas'
export { resumirPartida } from '../../src/analise/resumo'
export { uciParaSan } from '../../src/chess/notacao'
export { PgnError } from '../../src/chess/pgn'
export { posicoesAReanalisar, discordancias, LINHAS_NA_REANALISE } from '../../src/analise/consistencia'
