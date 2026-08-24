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

**Feito.** A base vem de `lichess-org/chess-openings` (CC0-1.0, domínio
público), baixada do repositório original — não do banco da VPS. São as 3.810
aberturas inteiras, sem subconjunto: 432 KB crus, 60 KB comprimidos, embutidos
no bundle. Sem banco, sem chamada de rede.

O repositório publica os TSV (`eco`, `name`, `pgn`); o `dist/` com as colunas
`uci` e `epd` é artefato de build e não está versionado, então a chave de
posição é calculada por `scripts/gerar-aberturas.mjs` com o mesmo `chess.js`
que o app usa para consultar.

A base **nomeia posições e tem buracos** no meio de linhas conhecidas — na
Najdorf, a posição após `4.Nxd4` não tem nome, mas a de `4...Nf6` tem. Por isso
a teoria vai até o **ply mais fundo** que está na base, não até o primeiro
buraco: cortar no primeiro buraco encerraria o livro no lance 3 de uma partida
que segue em teoria até o lance 8.

Dois recortes no rótulo, cada um corrigindo um caso observado:

- **Perda pequena.** `2. g4` do mate do bobo está numa posição nomeada (Barnes
  Opening: Fool's Mate) e nem por isso deixa de ser capivara. É o "Erro
  continua valendo lá dentro" acima.
- **A partida não acaba ali.** A base nomeia até a posição de mate; chamar
  `2... Qh4#` de "lance de livro" é absurdo.

## Calibração — medir, não estimar

O recurso escasso é tempo por posição. Medido em máquina rápida: ~600 ms por
posição, 21 s para 33 lances. Em máquina de escritório, bem mais.

A calibração é uma **grade**. O que decide não é quanto tempo levou, e sim **em
quantos lances a classificação divergiu** entre as combinações.

### A busca é por profundidade fixa, não por tempo

`go depth 16`, com **limpeza de hash (`ucinewgame`) antes de cada posição**.

A primeira grade usou `go movetime` e o resultado foi inutilizável: repetir a
mesma configuração contra ela mesma trocava **4 a 10 rótulos em 33**. A busca
por tempo não é determinística — a mesma posição alcança profundidades
diferentes conforme a carga da máquina, e muitas classificações ficam em cima
de um limiar. Ruído maior que o efeito de qualquer parâmetro que a grade
quisesse medir. Para um site cuja função é classificar lance, resultado que
muda sozinho é defeito visível.

Com profundidade fixa e hash limpo, duas execuções divergem em **0 de 33**.

**As duas partes são necessárias.** Com o hash reusado entre posições, a
divergência volta a **9 de 33**: o resultado passa a depender de quais posições
foram analisadas antes, e a fila prioriza a posição selecionada — ou seja, a
ordem muda conforme o usuário navega. Profundidade fixa sem hash limpo troca
"irreprodutível pelo relógio" por "irreprodutível pela navegação".

O preço é o inverso do `movetime`: com profundidade fixa, o **tempo** por
posição é que varia, e varia com a máquina do visitante.

A profundidade 16 saiu da grade: é a menor que preserva os dois sacrifícios da
partida de exemplo (12 e 14 perdem `13.Rxd7`) e não produz "Perdeu" falso em
`15.Bxd7+`. A 18 custa 2,4× o tempo e muda 6 rótulos, sem verdade de
referência que diga que os dela são melhores.

### Quanto custa o MultiPV

Sob **profundidade fixa**, `MultiPV 3` custa **3,7×** o tempo: 21,2 s contra
5,8 s da partida inteira a `go depth 16`.

Cuidado com a intuição de que "MultiPV mal custa nada" — ela vem de medição
sob busca por **tempo**, onde o tempo é fixo por definição e o custo do MultiPV
aparece como *menos profundidade alcançada*, não como mais segundos. Sob
profundidade fixa, o mesmo custo aparece no relógio.

Mantido mesmo assim: sem MultiPV, "Excelente" não existe, e a diferença medida
é de **16 rótulos em 33**. MultiPV 1 também perde `13.Rxd7` (de "Brilhante"
para "Melhor") e transforma `15...Nxd7` de "Excelente" em "Capivara".

## README do repo (é parte da entrega)

Problema → o que faz → como rodar → **as decisões e seus trade-offs**: por que
WASM no cliente em vez de servidor, como a classificação foi definida, por que
"brilhante" é suprimido na teoria, e o que a ferramenta assume ou simplifica.
O README é o que um recrutador lê antes do código.
