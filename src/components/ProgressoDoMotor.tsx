import type { ProgressoDaAnalise } from '../hooks/useAnaliseDaPartida'

export function ProgressoDoMotor({ progresso }: { progresso: ProgressoDaAnalise }) {
  const { estado, concluidas, total, erro } = progresso
  if (estado === 'ocioso') return null

  if (estado === 'erro') {
    return (
      <p className="progresso progresso--erro" role="alert">
        {erro ?? 'Falha no motor.'} A navegação da partida continua funcionando.
      </p>
    )
  }

  const percentual = total > 0 ? (concluidas / total) * 100 : 0
  const texto =
    estado === 'carregandoMotor'
      ? 'Carregando o motor…'
      : estado === 'concluida'
        ? `Análise concluída — ${total} posições`
        : `Analisando ${concluidas + 1} de ${total}`

  return (
    <div className={estado === 'concluida' ? 'progresso progresso--pronto' : 'progresso'}>
      <div
        className="progresso__trilho"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={concluidas}
        aria-label="progresso da análise"
      >
        <div className="progresso__preenchimento" style={{ width: `${percentual.toFixed(1)}%` }} />
      </div>
      <span className="progresso__texto">{texto}</span>
    </div>
  )
}
