import { ORDEM_DAS_CLASSIFICACOES } from '../analise/resumo'
import type { ResumoDaPartida as Resumo } from '../analise/resumo'
import { ROTULOS } from '../analise/rotulos'

type Props = {
  resumo: Resumo
  /** Quantos meios-lances a partida tem, para mostrar o quanto já foi contado. */
  totalDePlies: number
  /** `false` enquanto o motor ainda está trabalhando. */
  completo: boolean
}

export function ResumoDaPartida({ resumo, totalDePlies, completo }: Props) {
  const contados = resumo.totalBrancas + resumo.totalPretas + resumo.forcadosBrancas + resumo.forcadosPretas
  if (contados === 0) return null

  const linhas = ORDEM_DAS_CLASSIFICACOES.map((classificacao) => ({
    classificacao,
    rotulo: ROTULOS[classificacao],
    brancas: resumo.brancas[classificacao] ?? 0,
    pretas: resumo.pretas[classificacao] ?? 0,
  })).filter((linha) => linha.brancas > 0 || linha.pretas > 0)

  const forcados = resumo.forcadosBrancas + resumo.forcadosPretas

  return (
    <section className="resumo">
      <h2>
        Resumo
        {!completo && (
          <span className="resumo__parcial">
            {' '}
            parcial — {contados} de {totalDePlies} lances
          </span>
        )}
      </h2>

      <table className="resumo__tabela">
        <thead>
          <tr>
            <th scope="col">Classificação</th>
            <th scope="col">Brancas</th>
            <th scope="col">Pretas</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => (
            <tr key={linha.classificacao}>
              <th scope="row">
                <span className={`marcador marcador--${linha.classificacao}`}>
                  {linha.rotulo.simbolo}
                </span>
                {linha.rotulo.nome}
              </th>
              <td>{linha.brancas}</td>
              <td>{linha.pretas}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {forcados > 0 && (
        <p className="resumo__nota">
          {forcados === 1 ? '1 lance forçado não foi' : `${forcados} lances forçados não foram`}{' '}
          classificado{forcados === 1 ? '' : 's'}: sem escolha, não há mérito nem culpa.
        </p>
      )}
    </section>
  )
}
