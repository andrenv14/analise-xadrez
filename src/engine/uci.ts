import { ErroDoMotor } from './tipos'

type Ouvinte = (linha: string) => void

/** Quanto esperamos pelo carregamento do WASM antes de desistir. */
const TIMEOUT_HANDSHAKE_MS = 60_000

/**
 * Conexão bruta com o Worker do Stockfish: comandos e linhas de texto UCI.
 * Nada acima desta classe deveria conhecer o protocolo.
 */
export class ConexaoUci {
  private worker: Worker
  private ouvintes = new Set<Ouvinte>()
  private handshake: Promise<void>
  private encerrada = false

  constructor(urlDoWorker: string) {
    this.worker = new Worker(urlDoWorker)
    this.worker.onmessage = (evento: MessageEvent) => {
      const linha = typeof evento.data === 'string' ? evento.data : String(evento.data)
      for (const ouvinte of [...this.ouvintes]) ouvinte(linha)
    }
    this.handshake = this.negociar()
  }

  private async negociar(): Promise<void> {
    const falhaDoWorker = new Promise<never>((_, rejeitar) => {
      this.worker.onerror = (evento: ErrorEvent) => {
        rejeitar(
          new ErroDoMotor(
            `Não consegui carregar o motor: ${evento.message || 'erro no Web Worker'}.`,
          ),
        )
      }
    })

    await Promise.race([
      (async () => {
        this.enviar('uci')
        await this.esperarLinha((l) => l === 'uciok')
        this.enviar('setoption name Threads value 1')
        this.enviar('isready')
        await this.esperarLinha((l) => l === 'readyok')
      })(),
      falhaDoWorker,
    ])
  }

  pronto(): Promise<void> {
    return this.handshake
  }

  enviar(comando: string): void {
    if (this.encerrada) return
    this.worker.postMessage(comando)
  }

  /** Registra um ouvinte de linhas. Devolve a função que o remove. */
  ouvir(ouvinte: Ouvinte): () => void {
    this.ouvintes.add(ouvinte)
    return () => this.ouvintes.delete(ouvinte)
  }

  /** Resolve na primeira linha que satisfizer o predicado. */
  esperarLinha(predicado: (linha: string) => boolean, timeoutMs = TIMEOUT_HANDSHAKE_MS) {
    return new Promise<string>((resolver, rejeitar) => {
      const cronometro = setTimeout(() => {
        parar()
        rejeitar(new ErroDoMotor('O motor não respondeu a tempo.'))
      }, timeoutMs)

      const parar = this.ouvir((linha) => {
        if (!predicado(linha)) return
        clearTimeout(cronometro)
        parar()
        resolver(linha)
      })
    })
  }

  encerrar(): void {
    if (this.encerrada) return
    this.encerrada = true
    this.ouvintes.clear()
    try {
      this.worker.postMessage('quit')
    } catch {
      // O Worker já pode ter morrido; encerrar é best-effort.
    }
    this.worker.terminate()
  }
}
