import { CAMINHO_DO_WORKER, LINHAS_DO_MOTOR, PROFUNDIDADE_DE_ANALISE } from './configuracao'
import { lerInfo, lerMelhorLance, montarAnalise } from './protocolo'
import type { InfoDeLinha } from './protocolo'
import { ConexaoUci } from './uci'
import { AnaliseCancelada, ErroDoMotor } from './tipos'
import type { AnaliseDePosicao, Motor, OpcoesDeAnalise } from './tipos'

/** Rede de segurança por posição. Não participa da busca: só evita travar. */
const TETO_POR_POSICAO_MS = 120_000

type Tarefa = {
  fen: string
  opcoes: OpcoesDeAnalise
  resolver: (analise: AnaliseDePosicao) => void
  rejeitar: (erro: unknown) => void
}

class MotorStockfish implements Motor {
  private conexao: ConexaoUci
  private fila: Tarefa[] = []
  private tarefaAtual: Tarefa | null = null
  private ocupado = false
  /** Última quantidade de linhas configurada, para não reenviar à toa. */
  private linhasConfiguradas: number | null = null

  constructor(caminhoDoWorker: string) {
    this.conexao = new ConexaoUci(caminhoDoWorker)
  }

  async pronto(): Promise<void> {
    await this.conexao.pronto()
  }

  analisar(fen: string, opcoes: Partial<OpcoesDeAnalise> = {}): Promise<AnaliseDePosicao> {
    const completas: OpcoesDeAnalise = {
      profundidade: opcoes.profundidade ?? PROFUNDIDADE_DE_ANALISE,
      linhas: opcoes.linhas ?? LINHAS_DO_MOTOR,
      prioritaria: opcoes.prioritaria ?? false,
    }
    return new Promise<AnaliseDePosicao>((resolver, rejeitar) => {
      const tarefa: Tarefa = { fen, opcoes: completas, resolver, rejeitar }
      if (completas.prioritaria) this.fila.unshift(tarefa)
      else this.fila.push(tarefa)
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
          await this.limparTabelaDeHash()
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

  /**
   * Zera a tabela de hash antes de cada posição.
   *
   * Sem isso o resultado de uma posição depende de quais posições foram
   * analisadas antes dela — e a fila prioriza a posição que o usuário está
   * olhando, então essa ordem muda conforme ele navega. Profundidade fixa sem
   * hash limpo seria trocar "irreprodutível pelo relógio" por
   * "irreprodutível pela navegação".
   */
  private async limparTabelaDeHash(): Promise<void> {
    this.conexao.enviar('ucinewgame')
    this.conexao.enviar('isready')
    await this.conexao.esperarLinha((l) => l === 'readyok')
  }

  private buscar(tarefa: Tarefa): Promise<AnaliseDePosicao> {
    return new Promise<AnaliseDePosicao>((resolver, rejeitar) => {
      // O motor reemite cada linha do MultiPV a cada iteração de profundidade;
      // guardar a última por índice deixa o resultado mais fundo de cada uma.
      const infos = new Map<number, InfoDeLinha>()

      const parar = this.conexao.ouvir((linha) => {
        if (linha.startsWith('info')) {
          const info = lerInfo(linha)
          if (info) infos.set(info.multipv, info)
          return
        }
        if (!linha.startsWith('bestmove')) return

        parar()
        clearTimeout(cronometro)

        const analise = montarAnalise(tarefa.fen, infos, lerMelhorLance(linha))
        if (!analise) {
          rejeitar(new ErroDoMotor('O motor terminou a busca sem informar avaliação.'))
          return
        }
        resolver(analise)
      })

      // Com profundidade fixa não há orçamento de tempo, só uma rede de
      // segurança: se uma posição passar disso, algo está errado.
      const cronometro = setTimeout(() => {
        parar()
        rejeitar(new ErroDoMotor('O motor não devolveu um lance a tempo.'))
      }, TETO_POR_POSICAO_MS)

      if (this.linhasConfiguradas !== tarefa.opcoes.linhas) {
        this.conexao.enviar(`setoption name MultiPV value ${tarefa.opcoes.linhas}`)
        this.linhasConfiguradas = tarefa.opcoes.linhas
      }
      this.conexao.enviar(`position fen ${tarefa.fen}`)
      this.conexao.enviar(`go depth ${tarefa.opcoes.profundidade}`)
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
