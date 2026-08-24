# Spec — Avaliador de partidas de xadrez

_Projeto de portfólio. Não é sistema em produção: não há cliente, não há dado
pessoal, não há blast radius. O rigor aqui é o de um projeto pessoal bem-feito,
não o do `sofia-bot`._

## O que é

Página única onde a pessoa cola um PGN e recebe a partida analisada: tabuleiro
navegável, avaliação do motor a cada lance, classificação de cada lance e a
alternativa que o motor preferia.

## O que NÃO é (escopo fechado)

- Não importa partida por API do Chess.com ou Lichess. **PGN colado, só.**
- Não tem login, banco, back-end ou qualquer estado no servidor.
- Não tem "aulas", professor, chat ou explicação gerada por IA.
- Não usa o pool de Stockfish da VPS — a VPS atende cliente pagante.
- Não reaproveita o `chess-validator-cpp`: ele é auditoria offline em C++
  nativo, com array 8x8 escolhido por legibilidade e não por performance, e
  expõe um CLI de validação, não navegação de posição.

## Stack

- **TypeScript** + Vite + React.
- **`chess.js`** — parse de PGN, regras, geração de lances legais, FEN.
- **Biblioteca de tabuleiro pronta** (`react-chessboard` ou equivalente) —
  não desenhar tabuleiro do zero.
- **Stockfish compilado em WASM**, rodando em **Web Worker** (a página não pode
  travar enquanto o motor pensa).
- Hospedagem: **Netlify**, deploy a partir do repo. Repo **público**.

> Confirmar as versões atuais de cada biblioteca antes de instalar — as
> indicadas aqui são a escolha de arquitetura, não uma versão fixada.

## Fluxo

1. Textarea + botão "Analisar". PGN inválido → mensagem clara, sem quebrar.
2. `chess.js` carrega a partida e produz a lista de posições (FEN) lance a
   lance.
3. O Worker analisa as posições em sequência, do primeiro lance ao último.
4. A interface fica **navegável desde o começo** — o tabuleiro e a lista de
   lances aparecem antes da análise terminar, e cada lance ganha classificação
   conforme o resultado chega. Nada de tela branca com spinner.

## Interface

- **Tabuleiro** ao centro, orientado para as brancas por padrão (botão de
  girar).
- **Navegação**: setas do teclado (← →, e Home/End para início e fim) **e**
  lista de lances clicável ao lado. As duas coisas, sincronizadas.
- **Eval bar** vertical, acompanhando o lance atual.
- **No lance selecionado**: a avaliação da posição, a classificação do lance
  e **a alternativa que o motor preferia** (lance + avaliação dela).
- **Resumo no fim**: contagem de cada classificação, por cor.

## Classificação de lance

Nomenclatura do chess.com — são palavras de domínio, não marca. **Não copiar
ícones, paleta ou layout deles**: isso é obra visual.

**O critério é nosso, os nomes é que são emprestados.** O algoritmo do
chess.com é fechado, mudou ao longo dos anos e usa mais coisa do que perda de
centipawn. O README precisa dizer isso explicitamente — afirmar que reproduz o
algoritmo deles seria falso.

O critério base é **perda de centipawn** (avaliação da posição antes menos
avaliação depois, do ponto de vista de quem jogou). Faixas iniciais a calibrar:

| Classificação | Critério                                                                                              |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| Melhor        | é o lance principal do motor                                                                          |
| Excelente     | é o **único** lance que segura a posição — o segundo melhor do motor é muito pior (**exige MultiPV**) |
| Bom           | perda pequena                                                                                         |
| Imprecisão    | perda moderada                                                                                        |
| Erro          | perda grande                                                                                          |
| Capivara      | perda decisiva                                                                                        |
| Livro         | posição ainda dentro de teoria de abertura conhecida                                                  |
| Perdeu        | havia mate forçado ou ganho de material claro disponível, e o lance jogado desperdiçou                |
| Brilhante     | **sacrifício de material** que o motor confirma como bom, e fora de teoria                            |

### Brilhante exige sacrifício

Bater com o primeiro lance do motor sem sacrificar nada é apenas **Melhor**.
Brilhante é entregar material e a avaliação se manter ou melhorar. Sem essa
condição, "Brilhante" dispara em lance trivial.

**E não pode disparar dentro de teoria de abertura** — armadilha já vivida no
`sofia-bot`: `1. e4` batia com o motor e virava brilhante, o que é
pedagogicamente errado. Teoria não é achado do jogador. "Erro" continua valendo
normalmente lá dentro.

### Excelente exige MultiPV

Para saber se um lance era o _único_ bom, o motor precisa devolver as duas ou
três melhores linhas (`MultiPV`), não só a melhor. Isso custa tempo de análise
por posição — quanto exatamente, a calibração mede. Sem MultiPV, "Excelente"
não existe.

### Perdeu — duas fontes

1. **Mate desperdiçado**: havia mate forçado antes e não há mais depois. É
   inequívoco, sem limiar.
2. **Ganho de material claro desperdiçado**: exige um limiar, que é **parâmetro
   nomeado e calibrável**, não número mágico no meio do código. Limiar mal
   escolhido faz "Perdeu" disparar em tudo e virar ruído.

**Precedência**: quando um lance se qualifica como "Perdeu" e também como
"Erro"/"Capivara" (o que é comum — desperdiçar mate também derruba a
avaliação), **"Perdeu" vence**.

### Casos que quebram a conta de centipawn

- **Mate**: a avaliação vira "mate em N", não centipawn. Precisa tratamento
  próprio.
- **Posição já perdida**: perder 300cp quando já se está -900 não é o mesmo
  erro que perder 300cp em posição igual.
- **Lance forçado**: quando só existe um lance legal, não há mérito nem culpa —
  não classificar.
- **Fim de jogo**: mate consumado devolve `mate 0` (sem sinal) e afogamento
  devolve `cp 0`, ambos com `bestmove (none)`. Já tratado pela variante
  `fimDeJogo`.

### "Livro" precisa de base de aberturas

O `sofia-bot` já tem 3.810 aberturas importadas de `lichess-org/chess-openings`
(**domínio público**). Exportar um subconjunto como JSON estático e embutir no
site — sem banco, sem chamada de rede. Enquanto isso não existir, "Livro" e
"Brilhante" ficam desligados (o gancho pronto, sem heurística substituta).

## Calibração — medir, não estimar

O recurso escasso é tempo por posição. Medido em máquina rápida: ~900 ms por
posição, 30 s para 33 lances. Em máquina de escritório, bem mais.

A calibração é uma **grade**: tempo por lance (1000 / 600 / 300 ms) × MultiPV
(1 e 3). O que decide não é quanto tempo levou, e sim **em quantos lances a
classificação divergiu** entre as combinações. Se 300 ms classificar igual a
1000 ms, os 700 ms de diferença são espera pura.

`MultiPV 3` não triplica o tempo — o motor já explora alternativas durante a
busca; o custo extra é mantê-las separadas. Quanto custa de fato, a grade diz.

## README do repo (é parte da entrega)

Problema → o que faz → como rodar → **as decisões e seus trade-offs**: por que
WASM no cliente em vez de servidor, como a classificação foi definida, por que
"brilhante" é suprimido na teoria, e o que a ferramenta assume ou simplifica.
O README é o que um recrutador lê antes do código.
