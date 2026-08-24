/**
 * Parâmetros da classificação de lance, todos nomeados e num lugar só.
 *
 * As faixas são ponto de partida para calibrar olhando na tela, não verdade
 * medida. O algoritmo é nosso; os nomes é que vêm do chess.com, cujo critério
 * é fechado e usa mais coisa do que perda de centipeão.
 */
export const PARAMETROS_DE_CLASSIFICACAO = {
  /**
   * Teto para a avaliação antes de calcular a perda.
   *
   * Trata o caso "posição já perdida": cair de -900 para -1200 não é o mesmo
   * erro que cair de 0 para -300. Com o teto, as duas pontas saturam e a perda
   * medida entre posições já decididas tende a zero — que é o comportamento
   * desejado, e não uma imprecisão escondida.
   */
  LIMITE_DE_POSICAO_DECIDIDA_CP: 1000,

  /** Perda a partir da qual o lance deixa de ser "Bom". */
  LIMIAR_IMPRECISAO_CP: 50,
  /** Perda a partir da qual vira "Erro". */
  LIMIAR_ERRO_CP: 120,
  /** Perda a partir da qual vira "Capivara". */
  LIMIAR_CAPIVARA_CP: 300,

  /**
   * "Excelente": o quanto a segunda linha do motor precisa ser pior para que
   * o lance jogado conte como o único que segurava a posição.
   */
  LIMIAR_DE_LANCE_UNICO_CP: 150,

  /**
   * "Perdeu", fonte 2 — ganho de material claro desperdiçado.
   *
   * LIMIAR_DE_GANHO_CLARO_CP é a vantagem que caracteriza "havia ganho claro
   * disponível"; o lance precisa derrubá-la para baixo desse patamar.
   * LIMIAR_DE_DESPERDICIO_CP existe para que atravessar a fronteira de raspão
   * (205 para 195) não dispare "Perdeu": sem ele o rótulo vira ruído, que é
   * exatamente o risco apontado na spec.
   */
  LIMIAR_DE_GANHO_CLARO_CP: 200,
  LIMIAR_DE_DESPERDICIO_CP: 150,

  /**
   * "Brilhante" — quanto material precisa ser entregue para caracterizar
   * sacrifício. 150cp fica entre o peão e a peça menor: entrega de peão em
   * gambito de abertura não passa, entrega de peça passa.
   */
  LIMIAR_DE_SACRIFICIO_CP: 150,
  /**
   * Folga tolerada na avaliação de um sacrifício. O lance já é o principal do
   * motor, então a perda é próxima de zero por construção; a folga cobre
   * apenas oscilação entre duas buscas.
   */
  MARGEM_DE_SACRIFICIO_CP: 30,

  /**
   * "Brilhante" — o quanto quem sacrificou pode estar atrás e a posição ainda
   * contar como jogável.
   *
   * Sem esse piso, "a avaliação se mantém" vira uma frase sem conteúdo: em
   * posição já decidida não há o que manter, e o material está indo embora de
   * qualquer forma. O motor apenas escolhe a forma menos ruim de perder, e o
   * detector lê isso como entrega voluntária de material.
   *
   * 300cp é a peça inteira de desvantagem: até aí o jogo existe, e um
   * sacrifício que segura a posição é achado de verdade; além disso, não é
   * sacrifício, é a derrota seguindo seu curso.
   */
  LIMIAR_DE_POSICAO_JOGAVEL_CP: 300,
} as const
