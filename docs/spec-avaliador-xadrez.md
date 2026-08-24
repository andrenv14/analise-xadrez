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

O critério base é **perda de centipawn** (avaliação da posição antes menos
avaliação depois, do ponto de vista de quem jogou). Faixas iniciais a calibrar
olhando na tela, não em planilha:

| Classificação | Critério inicial                                     |
| ------------- | ---------------------------------------------------- |
| Melhor        | é o lance principal do motor                         |
| Excelente     | perda desprezível                                    |
| Bom           | perda pequena                                        |
| Imprecisão    | perda moderada                                       |
| Erro          | perda grande                                         |
| Capivara      | perda decisiva                                       |
| Livro         | posição ainda dentro de teoria de abertura conhecida |
| Brilhante     | bate com o melhor lance do motor **e** não é teoria  |

### Armadilha já conhecida — não repetir

No módulo de xadrez do `sofia-bot`, "brilhante" disparava em `1. e4` porque o
lance batia com o motor. É pedagogicamente errado: teoria de abertura não é
achado do jogador. **"Brilhante" é suprimido dentro de teoria; "erro" continua
valendo normalmente lá dentro.**

### "Livro" precisa de base de aberturas

O `sofia-bot` já tem 3.810 aberturas importadas de `lichess-org/chess-openings`
(**domínio público**). Exportar um subconjunto como JSON estático e embutir no
site — sem banco, sem chamada de rede.

### Casos que quebram a conta de centipawn

- **Mate**: a avaliação vira "mate em N", não centipawn. Precisa tratamento
  próprio (perder um mate forçado é erro grave mesmo com centipawn parecido).
- **Posição já perdida**: perder 300cp quando já se está -900 não é o mesmo
  erro que perder 300cp em posição igual. Tratar ou aceitar conscientemente a
  imprecisão — decisão de projeto, documentada no README.
- **Lance forçado**: quando só existe um lance legal, não há mérito nem culpa.

## Profundidade e tempo

Ajustar olhando na tela. Se a partida inteira demorar demais, baixar o tempo
por lance; se a classificação ficar obviamente errada, subir. É portfólio —
não precisa de medição formal antes de escrever a interface.

## README do repo (é parte da entrega)

Problema → o que faz → como rodar → **as decisões e seus trade-offs**: por que
WASM no cliente em vez de servidor, como a classificação foi definida, por que
"brilhante" é suprimido na teoria, e o que a ferramenta assume ou simplifica.
O README é o que um recrutador lê antes do código.
