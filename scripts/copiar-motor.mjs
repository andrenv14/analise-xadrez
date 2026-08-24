/**
 * Copia a build single-thread do Stockfish de node_modules para public/engine/.
 *
 * Por que copiar em vez de versionar: o pacote `stockfish` traz várias builds
 * (a completa tem 108MB de rede NNUE embutida) e só a lite-single vai para o
 * site. Copiar no predev/prebuild mantém 7MB de binário fora do histórico do
 * repositório — o Netlify roda `npm install` antes do build, então os arquivos
 * existem lá do mesmo jeito.
 */
import { copyFile, mkdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const ORIGEM = join(RAIZ, 'node_modules', 'stockfish', 'bin')
const DESTINO = join(RAIZ, 'public', 'engine')

/** Build single-thread: dispensa SharedArrayBuffer e, portanto, COOP/COEP. */
const ARQUIVOS = ['stockfish-18-lite-single.js', 'stockfish-18-lite-single.wasm']

await mkdir(DESTINO, { recursive: true })

for (const arquivo of ARQUIVOS) {
  const origem = join(ORIGEM, arquivo)
  try {
    await stat(origem)
  } catch {
    console.error(
      `[motor] não encontrei ${arquivo} em node_modules/stockfish/bin.\n` +
        '        Rode `npm install` antes.',
    )
    process.exit(1)
  }
  const destino = join(DESTINO, arquivo)
  await copyFile(origem, destino)
  const { size } = await stat(destino)
  console.log(`[motor] ${arquivo} -> public/engine/ (${(size / 1024 / 1024).toFixed(1)} MB)`)
}
