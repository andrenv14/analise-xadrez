import { corQueJoga, paraPontoDeVistaDasBrancas } from './avaliacao'
import type { AnaliseDePosicao, ConfiguracaoDaBusca, LinhaDoMotor } from './tipos'

/** Score cru do UCI, ainda do ponto de vista de quem está para jogar. */
export type ScoreCru = { tipo: 'cp' | 'mate'; valor: number }

export type InfoDeLinha = {
  /** Índice da linha no MultiPV, começando em 1. */
  multipv: number
  score: ScoreCru
  profundidade: number
  variante: string[]
}

/**
 * Lê uma linha `info` do UCI.
 *
 * Linhas marcadas como `lowerbound`/`upperbound` são descartadas: o valor
 * nelas é um limite da janela de busca, não uma avaliação. Linhas sem score
 * (`info currmove ...`) também não interessam.
 */
export function lerInfo(linha: string): InfoDeLinha | null {
  if (linha.includes(' lowerbound') || linha.includes(' upperbound')) return null

  const score = linha.match(/\bscore (cp|mate) (-?\d+)/)
  if (!score) return null

  const variante = linha.match(/\bpv (.+)$/)
  const multipv = linha.match(/\bmultipv (\d+)/)
  const profundidade = linha.match(/\bdepth (\d+)/)

  return {
    // Sem MultiPV o motor omite o campo: a única linha é a de índice 1.
    multipv: multipv ? Number(multipv[1]) : 1,
    score: { tipo: score[1] as 'cp' | 'mate', valor: Number(score[2]) },
    profundidade: profundidade ? Number(profundidade[1]) : 0,
    variante: variante ? variante[1].trim().split(/\s+/) : [],
  }
}

/** Extrai o lance de uma linha `bestmove`. `null` quando a posição já acabou. */
export function lerMelhorLance(linha: string): string | null {
  const lance = linha.split(/\s+/)[1]
  return !lance || lance === '(none)' ? null : lance
}

/**
 * Junta as linhas coletadas durante a busca em uma análise.
 *
 * `infos` guarda a última info vista por índice de MultiPV — o motor reemite
 * cada linha a cada iteração de profundidade, então a última é a mais funda.
 */
export function montarAnalise(
  fen: string,
  infos: Map<number, InfoDeLinha>,
  melhorLanceDoBestmove: string | null,
  configuracao: ConfiguracaoDaBusca,
): AnaliseDePosicao | null {
  if (infos.size === 0) return null

  const quemJoga = corQueJoga(fen)
  const temLanceLegal = melhorLanceDoBestmove !== null

  const linhas: LinhaDoMotor[] = [...infos.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, info]) => ({
      // Em posição terminal o motor ainda emite um score, mas sem variante.
      lance: info.variante[0] ?? '',
      avaliacao: paraPontoDeVistaDasBrancas(info.score, quemJoga, temLanceLegal),
      variante: info.variante,
      profundidade: info.profundidade,
    }))
    .filter((linha) => !temLanceLegal || linha.lance !== '')

  const principal = linhas[0]
  if (!principal) {
    // Posição terminal: sem lance a jogar, mas com avaliação.
    const info = infos.get(1) ?? [...infos.values()][0]
    return {
      fen,
      linhas: [],
      avaliacao: paraPontoDeVistaDasBrancas(info.score, quemJoga, false),
      melhorLance: null,
      profundidade: info.profundidade,
      configuracao,
    }
  }

  return {
    fen,
    linhas,
    avaliacao: principal.avaliacao,
    melhorLance: melhorLanceDoBestmove ?? principal.lance,
    profundidade: principal.profundidade,
    configuracao,
  }
}
