/**
 * Botões de ajuste do motor. Calibragem é olhando na tela: se a partida
 * inteira demorar demais, baixe o tempo; se a avaliação ficar obviamente
 * errada, suba.
 */

/** Tempo de busca por posição, em milissegundos. */
export const TEMPO_DE_ANALISE_POR_LANCE_MS = 1000

/**
 * Build single-thread do Stockfish 18, copiada para `public/engine/` pelo
 * script `scripts/copiar-motor.mjs`. Single-thread é deliberado: dispensa
 * SharedArrayBuffer e, com isso, os cabeçalhos COOP/COEP no Netlify.
 *
 * O arquivo `.wasm` fica ao lado do `.js` — a glue do Stockfish o encontra
 * sozinha trocando a extensão do próprio caminho.
 */
export const CAMINHO_DO_WORKER = `${import.meta.env.BASE_URL}engine/stockfish-18-lite-single.js`
