/**
 * Botões de ajuste do motor. Calibragem é medindo, não estimando: a grade em
 * `scripts/calibrar.mjs` compara classificação contra classificação.
 */

/**
 * Profundidade de busca por posição (`go depth N`).
 *
 * Não usamos `go movetime`: a busca por tempo não é determinística — a mesma
 * posição alcança profundidades diferentes conforme a carga da máquina, e a
 * calibração mediu 4 a 10 rótulos trocados em 33 ao reanalisar a mesma
 * partida. Para um site cuja função é classificar lance, resultado que muda
 * sozinho é defeito visível.
 *
 * O preço é o inverso: com profundidade fixa, o tempo por posição é que varia,
 * e varia com a máquina do visitante.
 */
export const PROFUNDIDADE_DE_ANALISE = 16

/**
 * Quantas linhas candidatas pedir ao motor (`MultiPV`).
 *
 * Precisa ser ≥ 2 para a classificação "Excelente" existir: sem a segunda
 * linha não há como saber se o lance jogado era o único que segurava a
 * posição.
 */
export const LINHAS_DO_MOTOR = 3

/**
 * Build single-thread do Stockfish 18, copiada para `public/engine/` pelo
 * script `scripts/copiar-motor.mjs`. Single-thread é deliberado: dispensa
 * SharedArrayBuffer e, com isso, os cabeçalhos COOP/COEP no Netlify.
 *
 * O arquivo `.wasm` fica ao lado do `.js` — a glue do Stockfish o encontra
 * sozinha trocando a extensão do próprio caminho.
 */
export const CAMINHO_DO_WORKER = `${import.meta.env.BASE_URL}engine/stockfish-18-lite-single.js`
