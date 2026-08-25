/**
 * Copia as fontes de node_modules para public/fonts/.
 *
 * Auto-hospedar não é preferência: o README afirma que não há chamada de rede
 * depois que a página carrega, e puxar do Google Fonts tornaria isso falso —
 * além de contar a cada visitante para um terceiro.
 *
 * Mesmo padrão do motor: os arquivos ficam fora do histórico e são copiados
 * antes de `dev` e de `build`, então o Netlify os produz sozinho.
 *
 * Só o subconjunto **latin** é copiado. Português cabe nele inteiro — as
 * acentuadas vivem em U+00C0–U+00FF — e latin-ext e vietnamese somariam
 * mais de 100 KB que nenhum visitante baixaria.
 */
import { copyFile, mkdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const DESTINO = join(RAIZ, 'public', 'fonts')

const FONTES = [
  // Display: uma variável com eixo de largura, para o título e os rótulos de
  // seção em versalete expandido. É a única peça de personalidade tipográfica
  // do projeto, e aparece em dois lugares.
  ['@fontsource-variable/archivo', 'archivo-latin-wdth-normal.woff2'],
  // Texto.
  ['@fontsource/ibm-plex-sans', 'ibm-plex-sans-latin-400-normal.woff2'],
  ['@fontsource/ibm-plex-sans', 'ibm-plex-sans-latin-600-normal.woff2'],
  // Dados: avaliação, lances, ECO, contadores.
  ['@fontsource/ibm-plex-mono', 'ibm-plex-mono-latin-400-normal.woff2'],
  ['@fontsource/ibm-plex-mono', 'ibm-plex-mono-latin-600-normal.woff2'],
]

await mkdir(DESTINO, { recursive: true })

let total = 0
for (const [pacote, arquivo] of FONTES) {
  const origem = join(RAIZ, 'node_modules', ...pacote.split('/'), 'files', arquivo)
  try {
    await stat(origem)
  } catch {
    console.error(`[fontes] não encontrei ${arquivo} em ${pacote}. Rode \`npm install\`.`)
    process.exit(1)
  }
  const destino = join(DESTINO, arquivo)
  await copyFile(origem, destino)
  const { size } = await stat(destino)
  total += size
  console.log(`[fontes] ${arquivo} (${(size / 1024).toFixed(1)} KB)`)
}
console.log(`[fontes] total: ${(total / 1024).toFixed(1)} KB em public/fonts/`)
