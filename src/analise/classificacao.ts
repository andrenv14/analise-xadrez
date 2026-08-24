// Importa dos módulos concretos, não do barrel `../engine`: o barrel arrasta
// o motor e o Worker junto, e esta camada é pura — precisa rodar também fora
// do navegador, no arranjo de calibração.
import { corQueJoga, temMateFavoravel, valorComparavel } from '../engine/avaliacao'
import type { Cor } from '../engine/avaliacao'
import type { AnaliseDePosicao, Avaliacao } from '../engine/tipos'
import { contarLancesLegais, materialEntregue } from './material'
import { PARAMETROS_DE_CLASSIFICACAO as P } from './parametros'

export type Classificacao =
  | 'brilhante'
  | 'excelente'
  | 'melhor'
  | 'bom'
  | 'imprecisao'
  | 'erro'
  | 'capivara'
  | 'perdeu'
  | 'livro'

export type LanceClassificado = {
  /** `null` quando o lance não deve ser julgado (lance forçado). */
  classificacao: Classificacao | null
  /** Uma frase explicando por que este lance recebeu esta classificação. */
  motivo: string
  /** Perda de centipeões, já com o teto de posição decidida aplicado. */
  perdaCp: number
  /** O que o motor preferia, quando não foi o lance jogado. */
  alternativa: { lanceUci: string; avaliacao: Avaliacao } | null
}

/** Aplica o teto de posição decidida antes de comparar duas avaliações. */
function limitar(valorCp: number): number {
  const teto = P.LIMITE_DE_POSICAO_DECIDIDA_CP
  return Math.max(-teto, Math.min(teto, valorCp))
}

function emPeoes(centipeoes: number): string {
  return (centipeoes / 100).toFixed(2)
}

function classificarPelaPerda(perdaCp: number): { classificacao: Classificacao; motivo: string } {
  if (perdaCp >= P.LIMIAR_CAPIVARA_CP) {
    return { classificacao: 'capivara', motivo: `Perda decisiva de ${emPeoes(perdaCp)} peões.` }
  }
  if (perdaCp >= P.LIMIAR_ERRO_CP) {
    return { classificacao: 'erro', motivo: `Perda grande de ${emPeoes(perdaCp)} peões.` }
  }
  if (perdaCp >= P.LIMIAR_IMPRECISAO_CP) {
    return { classificacao: 'imprecisao', motivo: `Perda moderada de ${emPeoes(perdaCp)} peões.` }
  }
  return { classificacao: 'bom', motivo: `Perda pequena de ${emPeoes(perdaCp)} peões.` }
}

/**
 * Classifica um meio-lance comparando a posição antes e depois.
 *
 * `antes` e `depois` precisam ser análises já prontas; enquanto o motor não
 * chegou nas duas, o lance fica sem classificação.
 */
export function classificarLance(
  antes: AnaliseDePosicao,
  depois: AnaliseDePosicao,
  lanceJogadoUci: string,
  dentroDaTeoria: boolean,
): LanceClassificado {
  const cor: Cor = corQueJoga(antes.fen)

  // Lance forçado: sem escolha, não há mérito nem culpa.
  if (contarLancesLegais(antes.fen) <= 1) {
    return {
      classificacao: null,
      motivo: 'Único lance legal na posição — sem mérito nem culpa.',
      perdaCp: 0,
      alternativa: null,
    }
  }

  const valorAntes = valorComparavel(antes.avaliacao, cor)
  const valorDepois = valorComparavel(depois.avaliacao, cor)
  const perdaCp = Math.max(0, limitar(valorAntes) - limitar(valorDepois))

  const principal = antes.linhas[0] ?? null
  const foiOMelhor = principal !== null && principal.lance === lanceJogadoUci
  const alternativa =
    !foiOMelhor && principal ? { lanceUci: principal.lance, avaliacao: principal.avaliacao } : null

  // --- "Perdeu" tem precedência sobre "Erro"/"Capivara" -------------------
  // Só se aplica a lance que não era o principal: quando o motor escolheu o
  // mesmo lance, um mate que "sumiu" é oscilação entre duas buscas de
  // profundidades diferentes, não desperdício do jogador.
  if (!foiOMelhor) {
    const mateDesperdicado =
      temMateFavoravel(antes.avaliacao, cor) && !temMateFavoravel(depois.avaliacao, cor)
    const ganhoDesperdicado =
      valorAntes >= P.LIMIAR_DE_GANHO_CLARO_CP &&
      valorDepois < P.LIMIAR_DE_GANHO_CLARO_CP &&
      perdaCp >= P.LIMIAR_DE_DESPERDICIO_CP

    if (mateDesperdicado) {
      return {
        classificacao: 'perdeu',
        motivo: 'Havia mate forçado na posição e o lance jogado deixou escapar.',
        perdaCp,
        alternativa,
      }
    }
    if (ganhoDesperdicado) {
      return {
        classificacao: 'perdeu',
        motivo: `Havia ganho de material claro disponível e o lance jogado desperdiçou ${emPeoes(perdaCp)} peões.`,
        perdaCp,
        alternativa,
      }
    }
  }

  // --- "Livro" ------------------------------------------------------------
  // Duas condições recortam o rótulo, e cada uma corrige um erro observado:
  //
  // - Perda pequena. A spec é explícita que "Erro continua valendo normalmente
  //   lá dentro": `2. g4` no mate do bobo está numa posição nomeada (Barnes
  //   Opening: Fool's Mate) e nem por isso deixa de ser capivara.
  // - A partida não acaba aqui. A base nomeia até a posição de mate do mate do
  //   bobo, e chamar `2... Qh4#` de "lance de livro" é absurdo.
  //
  // Vem antes de Brilhante/Excelente/Melhor porque é aqui que a supressão de
  // "Brilhante" dentro da teoria acontece: teoria não é achado do jogador — a
  // armadilha do `sofia-bot`, em que `1. e4` virava brilhante por bater com o
  // motor.
  const acabaAqui = depois.avaliacao.tipo === 'fimDeJogo'
  if (dentroDaTeoria && perdaCp < P.LIMIAR_IMPRECISAO_CP && !acabaAqui) {
    return {
      classificacao: 'livro',
      motivo: 'Lance ainda dentro de teoria de abertura conhecida.',
      perdaCp,
      alternativa: null,
    }
  }

  if (foiOMelhor && principal) {
    // --- "Brilhante": o principal do motor E sacrifício de material -------
    const entrega = materialEntregue(antes.fen, lanceJogadoUci, depois.linhas[0]?.lance ?? null, cor)
    const sacrificou =
      entrega !== null &&
      entrega.entregue >= P.LIMIAR_DE_SACRIFICIO_CP &&
      perdaCp <= P.MARGEM_DE_SACRIFICIO_CP

    // Fora de teoria por construção: o ramo de "Livro" acima já retornou.
    if (sacrificou) {
      return {
        classificacao: 'brilhante',
        motivo: `Sacrifício de ${emPeoes(entrega.entregue)} peões que o motor confirma como o melhor lance.`,
        perdaCp,
        alternativa: null,
      }
    }

    // --- "Excelente": era o único lance que segurava a posição ------------
    const segunda = antes.linhas[1] ?? null
    if (segunda) {
      // Mesmo teto usado na perda: sem ele, comparar um mate com uma linha
      // qualquer produz "a segunda opção perde 303.88 peões" na tela.
      const distancia =
        limitar(valorComparavel(principal.avaliacao, cor)) -
        limitar(valorComparavel(segunda.avaliacao, cor))
      if (distancia >= P.LIMIAR_DE_LANCE_UNICO_CP) {
        return {
          classificacao: 'excelente',
          motivo: `Era o único lance que segurava a posição — a segunda opção do motor é ${emPeoes(distancia)} peões pior.`,
          perdaCp,
          alternativa: null,
        }
      }
    }

    return {
      classificacao: 'melhor',
      motivo: 'É o lance principal do motor.',
      perdaCp,
      alternativa: null,
    }
  }

  // Lance que não era o principal do motor: julgado pela perda. Isso inclui
  // lance dentro da teoria cuja perda passou do limiar — que é justamente o
  // "Erro continua valendo lá dentro" da spec.
  const { classificacao, motivo } = classificarPelaPerda(perdaCp)
  return { classificacao, motivo, perdaCp, alternativa }
}
