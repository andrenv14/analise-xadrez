import { describe, expect, it } from 'vitest'
import avaliacoes from './__fixtures__/avaliacoes.json'
import { parsePgn } from '../chess/pgn'
import type { AnaliseDePosicao } from '../engine/tipos'
import { classificarLance } from './classificacao'
import { classificarPartida } from './classificarPartida'
import { resumirPartida } from './resumo'

/**
 * Os testes exercitam a **regra**, não o motor: as avaliações do Stockfish
 * foram gravadas uma vez por `scripts/gravar-avaliacoes.mjs` e entram aqui
 * como dado fixo. Cada caso abaixo travou um comportamento que já esteve
 * errado em alguma versão — não há teste trivial nesta lista.
 */

type Fixture = { pgn: string; analises: (AnaliseDePosicao | null)[] }
const fixtures = avaliacoes.partidas as unknown as Record<string, Fixture>

function carregar(nome: string) {
  const { pgn, analises } = fixtures[nome]
  const jogo = parsePgn(pgn)
  const partida = classificarPartida(jogo, analises)
  const rotulo = (ply: number) => partida.lances[ply - 1]?.classificacao ?? null
  return { jogo, partida, rotulo }
}

describe('Morphy — Ópera de 1858', () => {
  const { jogo, partida, rotulo } = carregar('morphy')

  it('reconhece os dois sacrifícios reais como Brilhante', () => {
    // 13.Rxd7 entrega torre por cavalo; 16.Qb8+ entrega a dama inteira. Nos
    // dois, a resposta do motor captura na casa de destino do lance.
    expect(rotulo(25)).toBe('brilhante')
    expect(rotulo(31)).toBe('brilhante')
    expect(partida.lances.filter((l) => l?.classificacao === 'brilhante')).toHaveLength(2)
  })

  it('não classifica lance forçado', () => {
    // 17...Nxb8 é a única resposta legal ao sacrifício de dama.
    expect(jogo.plies[31].san).toBe('Nxb8')
    expect(rotulo(32)).toBeNull()
    expect(partida.lances[31]?.motivo).toMatch(/único lance legal/i)
  })

  it('trata o mate como Melhor, não como Excelente', () => {
    // Dar mate não é "segurar a posição": é ganhar.
    expect(jogo.plies[32].san).toBe('Rd8#')
    expect(rotulo(33)).toBe('melhor')
  })

  it('marca a teoria da Philidor e para onde ela acaba', () => {
    expect(partida.abertura?.eco).toBe('C41')
    expect(partida.abertura?.nome).toBe('Philidor Defense')
    expect(partida.limiteDaTeoria).toBe(5)
    for (const ply of [1, 2, 3, 4, 5]) expect(rotulo(ply)).toBe('livro')
    expect(rotulo(6)).not.toBe('livro')
  })

  it('conta 17 lances de brancas e 16 de pretas no resumo', () => {
    const resumo = resumirPartida(jogo.plies, partida.lances)
    const somar = (c: Record<string, number | undefined>) =>
      Object.values(c).reduce<number>((s, n) => s + (n ?? 0), 0)
    expect(somar(resumo.brancas) + resumo.forcadosBrancas).toBe(17)
    expect(somar(resumo.pretas) + resumo.forcadosPretas).toBe(16)
    expect(resumo.forcadosPretas).toBe(1)
  })
})

describe('Mate do bobo — teoria não perdoa lance ruim', () => {
  const { jogo, partida, rotulo } = carregar('bobo')

  it('reconhece a posição como teoria conhecida', () => {
    // A base nomeia a linha inteira, mate incluído.
    expect(partida.abertura?.nome).toContain("Fool's Mate")
  })

  it('não chama de Livro um lance com perda grande', () => {
    // 1.f3 e 2.g4 estão em posições nomeadas, e nem por isso deixam de ser
    // lances ruins. É o "Erro continua valendo lá dentro" da spec.
    expect(jogo.plies[0].san).toBe('f3')
    expect(rotulo(1)).toBe('imprecisao')
    expect(jogo.plies[2].san).toBe('g4')
    expect(rotulo(3)).toBe('mancada')
  })

  it('classifica como Livro o lance de teoria que não perde nada', () => {
    expect(jogo.plies[1].san).toBe('e5')
    expect(rotulo(2)).toBe('livro')
  })

  it('não deixa o mate cair na escala de perda nem virar Livro', () => {
    // A base nomeia até a posição de mate; chamar `2... Qh4#` de lance de
    // livro seria absurdo, e rebaixá-lo por perda também.
    expect(jogo.plies[3].san).toBe('Qh4#')
    expect(rotulo(4)).not.toBe('livro')
    expect(['melhor', 'excelente', 'brilhante']).toContain(rotulo(4))
  })
})

describe('Najdorf — a base tem buracos no meio de linhas conhecidas', () => {
  const { partida, rotulo } = carregar('najdorf')

  it('atravessa o buraco em vez de encerrar a teoria nele', () => {
    // A posição após 4.Nxd4 (ply 7) não tem nome na base, mas a de 4...Nf6
    // tem. Cortar no primeiro buraco encerraria o livro no lance 3.
    expect(partida.limiteDaTeoria).toBe(15)
    for (let ply = 1; ply <= 15; ply++) expect(rotulo(ply)).toBe('livro')
    expect(rotulo(16)).not.toBe('livro')
  })

  it('nomeia a linha mais específica, não a primeira', () => {
    expect(partida.abertura?.eco).toBe('B90')
    expect(partida.abertura?.nome).toContain('Najdorf')
  })
})

describe('Partida caótica — Brilhante não pode ser fácil de ganhar', () => {
  const { pgn, analises } = fixtures.longaFalsosBrilhantes
  const jogo = parsePgn(pgn)

  // Os três lances abaixo viraram "Brilhante" numa versão anterior, com uma
  // torre pendurada em a8 durante vários lances: qualquer lance jogado era
  // lido como entrega de material. `18... Kc7` chegou a ser anunciado como
  // "sacrifício de 3,30 peões" — um lance de rei.
  const casos = [
    { ply: 36, san: 'Kc7' },
    { ply: 48, san: 'Kxd5' },
    { ply: 50, san: 'Nxh5' },
  ]

  for (const { ply, san } of casos) {
    it(`não chama de Brilhante o lance ${san}, que só permite captura em outra casa`, () => {
      const jogado = jogo.plies[ply - 1]
      expect(jogado.san).toBe(san)
      const antes = analises[ply - 1]!
      const depois = analises[ply]!
      const resultado = classificarLance(antes, depois, jogado.uci, false)
      expect(resultado.classificacao).not.toBe('brilhante')
    })
  }
})

describe('Mate alternativo', () => {
  const { jogo, rotulo } = carregar('promocaoComMate')

  it('não pune um mate por não ser o mate que o motor escolheu', () => {
    // O motor prefere `a8=R#`; jogar `a8=Q#` dá o mesmo mate. Numa versão
    // anterior isso caía em "Bom" por não bater com a primeira linha.
    expect(jogo.plies[0].san).toBe('a8=Q#')
    expect(rotulo(1)).toBe('melhor')
  })
})
