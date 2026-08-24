import { corQueJoga, paraPontoDeVistaDasBrancas } from './avaliacao'
import { CAMINHO_DO_WORKER, TEMPO_DE_ANALISE_POR_LANCE_MS } from './configuracao'
import { ConexaoUci } from './uci'
import { AnaliseCancelada, ErroDoMotor } from './tipos'
import type { AnaliseDePosicao, Motor, OpcoesDeAnalise } from './tipos'

type Tarefa = {
  fen: string
  tempoMs: number
  resolver: (analise: AnaliseDePosicao) => void
  rejeitar: (erro: unknown) => void
}

type ScoreCru = { tipo: 'cp' | 'mate'; valor: number; profundidade: number }

/**
 * Lê o score de uma linha `info` do UCI.
 *
 * Linhas marcadas como `lowerbound`/`upperbound` são descartadas: o valor
 * nelas é um limite da janela de busca, não uma avaliação.
 */
function lerScore(linha: string): ScoreCru | null {
  if (linha.includes(' lowerbound') || linha.includes(' upperbound')) return null
  const score = linha.match(/\bscore (cp|mate) (-?\d+)/)
  if (!score) return null
  const profundidade = linha.match(/\bdepth (\d+)/)
  return {
    tipo: score[1] as 'cp' | 'mate',
    valor: Number(score[2]),
    profundidade: profundidade ? Number(profundidade[1]) : 0,
  }
}

/** Extrai o lance de uma linha `bestmove`. `null` quando a posição acabou. */
function lerMelhorLance(linha: string): string | null {
  const lance = linha.split(/\s+/)[1]
  return !lance || lance === '(none)' ? null : lance
}

class MotorStockfish implements Motor {
  private conexao: ConexaoUci
  private fila: Tarefa[] = []
  private tarefaAtual: Tarefa | null = null
  private ocupado = false

  constructor(caminhoDoWorker: string) {
    this.conexao = new ConexaoUci(caminhoDoWorker)
  }

  async pronto(): Promise<void> {
    await this.conexao.pronto()
  }

  analisar(fen: string, opcoes: Partial<OpcoesDeAnalise> = {}): Promise<AnaliseDePosicao> {
    const tempoMs = opcoes.tempoMs ?? TEMPO_DE_ANALISE_POR_LANCE_MS
    return new Promise<AnaliseDePosicao>((resolver, rejeitar) => {
      this.fila.push({ fen, tempoMs, resolver, rejeitar })
      void this.girarFila()
    })
  }

  private async girarFila(): Promise<void> {
    if (this.ocupado) return
    this.ocupado = true
    try {
      await this.conexao.pronto()
      while (this.fila.length > 0) {
        const tarefa = this.fila.shift()!
        this.tarefaAtual = tarefa
        try {
          tarefa.resolver(await this.buscar(tarefa))
        } catch (erro) {
          tarefa.rejeitar(erro)
        } finally {
          this.tarefaAtual = null
        }
      }
    } catch (erro) {
      // Falha no handshake derruba tudo que estava esperando.
      const pendentes = [this.tarefaAtual, ...this.fila].filter((t): t is Tarefa => t !== null)
      this.fila = []
      this.tarefaAtual = null
      for (const tarefa of pendentes) tarefa.rejeitar(erro)
    } finally {
      this.ocupado = false
    }
  }

  private buscar(tarefa: Tarefa): Promise<AnaliseDePosicao> {
    return new Promise<AnaliseDePosicao>((resolver, rejeitar) => {
      let melhorScore: ScoreCru | null = null

      const parar = this.conexao.ouvir((linha) => {
        if (linha.startsWith('info')) {
          const score = lerScore(linha)
          if (score) melhorScore = score
          return
        }
        if (!linha.startsWith('bestmove')) return

        parar()
        clearTimeout(cronometro)

        const melhorLance = lerMelhorLance(linha)
        if (!melhorScore) {
          rejeitar(new ErroDoMotor('O motor terminou a busca sem informar avaliação.'))
          return
        }
        const score: ScoreCru = melhorScore
        resolver({
          fen: tarefa.fen,
          avaliacao: paraPontoDeVistaDasBrancas(
            { tipo: score.tipo, valor: score.valor },
            corQueJoga(tarefa.fen),
            melhorLance !== null,
          ),
          melhorLance,
          profundidade: score.profundidade,
        })
      })

      // Margem generosa sobre o movetime: o motor às vezes estoura o orçamento
      // para terminar a iteração corrente.
      const cronometro = setTimeout(() => {
        parar()
        rejeitar(new ErroDoMotor('O motor não devolveu um lance a tempo.'))
      }, tarefa.tempoMs + 30_000)

      this.conexao.enviar(`position fen ${tarefa.fen}`)
      this.conexao.enviar(`go movetime ${tarefa.tempoMs}`)
    })
  }

  cancelar(): void {
    const descartadas = this.fila
    this.fila = []
    for (const tarefa of descartadas) tarefa.rejeitar(new AnaliseCancelada())
    // A busca em andamento termina sozinha com um `bestmove`; quem pediu essa
    // análise é que decide ignorar o resultado.
    this.conexao.enviar('stop')
  }

  encerrar(): void {
    this.cancelar()
    this.conexao.encerrar()
  }
}

/** Cria um motor pronto para uso. O WASM carrega em segundo plano. */
export function criarMotor(caminhoDoWorker: string = CAMINHO_DO_WORKER): Motor {
  return new MotorStockfish(caminhoDoWorker)
}
