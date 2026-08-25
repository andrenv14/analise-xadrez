# Avaliador de partidas de xadrez

Cole um PGN e receba a partida analisada: tabuleiro navegável, avaliação do
motor a cada lance, classificação de cada lance, a alternativa que o motor
preferia, e a possibilidade de mover as peças para explorar "e se eu tivesse
jogado isso".

Tudo roda no navegador. Não há servidor, banco, login ou chamada de rede
depois que a página carrega.

## Como rodar

```
npm install
npm run dev        # http://localhost:5173
```

Outros comandos:

```
npm run build      # type-check e build de produção
npm test           # suíte de testes (não roda o motor; ver "Testes")
npm run lint
npm run calibrar   # grade de calibração: profundidade × MultiPV
```

O `npm install` baixa o pacote `stockfish`, que ocupa cerca de 350 MB em
`node_modules` porque traz quatro builds diferentes. Só uma delas vai para o
site — 7 MB — e é copiada para `public/engine/` por um script que roda
automaticamente antes de `dev` e de `build`.

---

## As decisões e seus trade-offs

Esta seção é o motivo de o README existir. O código faz o que está descrito
abaixo; o que interessa é por quê.

### Por que Stockfish em WASM no cliente, e não num servidor

Um servidor de análise seria mais rápido e daria controle sobre o hardware.
Foi descartado por três razões, em ordem de peso:

**Custo que cresce com o uso.** Análise de xadrez é CPU pura. Um site de
portfólio que analise partidas no servidor tem custo proporcional ao número de
visitantes, e o pico de visitas é justamente quando alguém compartilha o link.
No cliente, o custo de mil visitantes é o mesmo de um.

**O projeto deixa de ser estático.** Sem back-end, o deploy é um diretório de
arquivos no Netlify e não há nada para manter no ar, atualizar por segurança,
ou pagar. Com back-end, há.

**Privacidade sem precisar prometer nada.** O PGN nunca sai da máquina de quem
colou. Isso não é uma política — é uma consequência da arquitetura, e não
depende de ninguém acreditar em mim.

O preço é real: o visitante baixa 7 MB de WebAssembly antes da primeira
análise, e a velocidade depende da máquina dele.

A build escolhida é a **single-thread**. A multi-thread é mais rápida, mas
exige `SharedArrayBuffer`, que por sua vez exige os cabeçalhos COOP/COEP na
resposta HTTP — configuração de servidor num projeto que evita ter servidor. A
single-thread não precisa de nada.

### Por que profundidade fixa, e não tempo por lance

A primeira versão usava `go movetime 1000`: um segundo por posição. Parecia
razoável até eu medir a reprodutibilidade.

**Reanalisar a mesma partida com a mesma configuração trocava de 4 a 10
rótulos em 33** (três réplicas, média 6,7). A busca por tempo não é
determinística: a mesma posição alcança profundidades diferentes conforme a
carga da máquina naquele instante, e muitas classificações ficam em cima de um
limiar. Para um site cuja função é dizer se um lance foi bom, resultado que
muda sozinho é defeito visível — o usuário recarrega a página e o "erro" virou
"imprecisão".

A troca por `go depth 16` levou esse número a **0 de 33**.

Só que a profundidade fixa sozinha não bastava. A tabela de hash do motor é
compartilhada entre as posições, e a fila de análise prioriza a posição que o
usuário está olhando — ou seja, a ordem de análise muda conforme ele navega.
Medido: **com o hash reusado, a divergência volta a 9 de 33.** Por isso o motor
recebe `ucinewgame` antes de cada posição. Sem as duas metades, a troca seria
"irreprodutível pelo relógio" por "irreprodutível pela navegação".

O preço é o inverso do `movetime`: agora o **tempo** é que varia. Na máquina em
que foi desenvolvido, a partida de exemplo (33 lances) leva cerca de 21
segundos, com a pior posição em 1,7 s; uma partida de 67 lances levou 43
segundos. Numa máquina mais lenta, proporcionalmente mais — e não há teto por
posição, apenas uma rede de segurança de dois minutos que existe para evitar
travamento, não para limitar a busca.

**Por que 16 e não outro número.** Medindo profundidades 12, 14, 16 e 18, todas
reprodutíveis: 12 e 14 perdem `13.Rxd7` como Brilhante e inventam um "Perdeu"
falso em `15.Bxd7+`. A 18 custa 2,4× o tempo (49,9 s contra 21,2 s) e muda 6
rótulos, sem que exista verdade de referência dizendo que os dela são mais
certos. A 16 é a menor que preserva os dois sacrifícios da partida de exemplo
sem produzir falso positivo.

### Por que MultiPV 3, apesar do custo

O motor devolve as três melhores linhas de cada posição em vez de só a melhor.
Isso é o que permite a classificação "Excelente" existir: sem a segunda linha,
não há como saber se o lance jogado era o único que segurava a posição.

Sob profundidade fixa, **MultiPV 3 custa 3,7×** o tempo — 21,2 s contra 5,8 s
na partida inteira. É um número que contraria a intuição comum de que "MultiPV
mal custa nada", e vale entender por quê: essa intuição vem de medir sob busca
por tempo, onde o tempo é fixo por definição e o custo do MultiPV aparece como
*menos profundidade alcançada*, não como mais segundos.

Medi se dava para pagar menos. **Não dá, e o motivo é interessante:** MultiPV
não é "a mesma busca reportando mais linhas", é uma busca diferente. Subir o
MultiPV desliga podas que assumem que só a melhor linha importa. Comparando
MultiPV 2 com MultiPV 3 nas mesmas 34 posições, a **avaliação da primeira linha
difere em 27 delas**, e o próprio lance principal difere em 9. Baixar o MultiPV
não entrega a mesma análise mais barata: entrega outra análise.

---

## Como a classificação foi definida

### Aviso necessário

Os nomes — Brilhante, Excelente, Melhor, Bom, Imprecisão, Erro, Capivara,
Livro, Perdeu — vêm do vocabulário que o chess.com popularizou. **O critério é
inteiramente meu.**

O algoritmo do chess.com é fechado, mudou ao longo dos anos e usa mais coisa do
que perda de centipeão. Afirmar que esta ferramenta reproduz o comportamento
deles seria falso, e nenhum número aqui foi calibrado contra a saída deles.
Também não copiei ícones, paleta ou layout: isso é obra visual, e as palavras
não são.

### O critério base

Perda de centipeões: a avaliação da posição antes do lance menos a avaliação
depois, do ponto de vista de quem jogou. As faixas de partida estão todas em
`src/analise/parametros.ts`, nomeadas e comentadas — não há número solto no
meio da lógica.

A ordem de decisão importa tanto quanto os limiares:

1. **Lance forçado** (só existe um lance legal) não é classificado. Sem
   escolha, não há mérito nem culpa.
2. **Perdeu** tem precedência sobre Erro e Capivara. Duas fontes: mate forçado
   que existia e sumiu (inequívoco, sem limiar), e ganho de material claro
   desperdiçado. A segunda exige *dois* parâmetros, não um: `GANHO_CLARO`
   (200cp) define o que conta como vantagem clara, e `DESPERDICIO` (150cp)
   exige que a perda em si seja substancial. Só com o primeiro, atravessar a
   fronteira de raspão — de 205 para 195 — dispararia "Perdeu" e o rótulo
   viraria ruído.
3. **Livro**, se a posição ainda está em teoria conhecida *e* a perda é
   pequena *e* a partida não acaba ali.
4. **Brilhante**, **Excelente**, **Melhor**, se o lance foi o principal do
   motor.
5. **Bom / Imprecisão / Erro / Capivara** pela perda.

Um lance que foi o principal do motor nunca alcança a escala de perda. Isso
parece óbvio e não era: numa versão intermediária a checagem de perda rodava
antes, e o próprio lance recomendado pelo motor chegou a ser chamado de
"capivara".

### Brilhante exige sacrifício de verdade

Bater com o primeiro lance do motor sem sacrificar nada é apenas **Melhor**.
Brilhante é entregar material e a avaliação se manter.

Duas condições precisaram ser acrescentadas depois de ver o rótulo aparecer
onde não devia.

**O lance precisa ter oferecido o material ele mesmo.** Não basta que o
material caia depois: a melhor resposta do adversário tem que capturar *na casa
de destino do lance jogado*. É a assinatura das duas formas do sacrifício —
peça que vai para casa atacada (`Qb8+`, e vem `Nxb8`) e captura com peça mais
valiosa (`Rxd7` tomando um cavalo com a torre, e vem a recaptura em d7). Sem
isso, numa partida com uma torre pendurada durante vários lances, três lances
viraram Brilhante — entre eles um lance de rei anunciado como "sacrifício de
3,30 peões". A torre ia cair de qualquer forma.

**A posição precisa continuar jogável.** Se a avaliação depois do lance está
abaixo de −300cp para quem entregou, não é sacrifício: o material sai de
qualquer jeito e o motor só escolhe a forma menos ruim de perder. Foi relatado
um lance com a avaliação em −7,40 saindo como "sacrifício de 3,30 peões".

### Excelente exige posição defensável, com piso mais alto

"Excelente" é o lance que era o único a segurar a posição — a segunda linha do
motor é pelo menos 150cp pior.

O mesmo problema aparecia aqui: em posição já decidida a distância entre a
primeira e a segunda linha fica enorme por natureza. `15...Nxd7` da Ópera de
Morphy escolhia entre perder devagar e levar mate na hora, e isso virava "o
único lance que segurava a posição". Não segurou nada.

O piso existe, mas é **600cp — o dobro do piso do Brilhante, deliberadamente.**
Os dois rótulos descrevem coisas diferentes: entregar material estando pior é
quase sempre desespero, mas achar o único lance que evita o desastre estando
pior é exatamente a defesa que merece elogio. Defesa prática ganha partida;
sacrifício desesperado, não.

### Por que Brilhante é suprimido dentro de teoria de abertura

Porque teoria não é achado do jogador.

Isso é uma armadilha vivida antes, num projeto anterior: "brilhante" disparava
em `1. e4` porque o lance batia com a primeira linha do motor. É
pedagogicamente errado — quem joga `1. e4` está repetindo o que aprendeu, não
descobrindo nada. Um lance dentro do livro é classificado como **Livro**, e o
ramo do Livro retorna antes do ramo do Brilhante.

**"Erro" continua valendo normalmente lá dentro.** A base de aberturas nomeia
até a linha do mate do bobo; `2. g4` está numa posição com nome e nem por isso
deixa de ser capivara. Por isso "Livro" só se aplica quando a perda está abaixo
do limiar de imprecisão.

### Livro: a base de aberturas

3.810 aberturas de [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings)
(CC0-1.0, domínio público), baixadas do repositório original e convertidas em
JSON estático — 432 KB crus, 60 KB comprimidos, embutidos no bundle. Sem banco,
sem chamada de rede.

A base **nomeia posições**, não linhas, e tem buracos no meio de sequências
conhecidas: na Najdorf, a posição após `4.Nxd4` não tem nome, mas a de
`4...Nf6` tem. Por isso a teoria vai até o **ply mais fundo** que está na base,
não até o primeiro buraco — cortar no primeiro buraco encerraria o livro no
lance 3 de uma partida que segue em teoria até o lance 8.

---

## Exploração de variantes

A partir de qualquer posição, mover uma peça no tabuleiro entra numa variante:
o motor avalia a posição nova e diz qual seria a melhor resposta. Dá para
encadear quantos lances quiser, dos dois lados. Sair tem três caminhos — o
botão, clicar num lance da partida, e `Esc`.

**A variante não classifica lances.** Ali há avaliação e melhor resposta, e não
há brilhante/erro/imprecisão. Classificar exige comparar o lance com o que era
possível na posição anterior — e numa exploração livre a posição anterior
*também* é escolha do usuário. Chamar de "erro" um lance que ele está testando
de propósito seria julgar a pergunta, não a resposta.

**Uma variante por vez foi decisão de escopo, não limitação técnica.** Explorar
a partir de outro lance descarta a anterior. Guardar várias exigiria uma árvore
de variantes com navegação própria, promoção de linha e alguma forma de
serialização — é outro produto, com outra interface, e não é o que esta
ferramenta se propõe a ser.

A variante tem prioridade sobre a fila de análise da partida, porque é o que a
pessoa está olhando agora. Medido: avaliada em 1,3 s com a análise da partida
ainda na posição 3 de 34.

---

## O que a ferramenta assume e simplifica

Nada aqui é bug desconhecido: são limites escolhidos, e cada um tem um motivo.

**O detector de sacrifício tem três pontos cegos.** A janela é de dois
meios-lances, então sacrifício que só se paga três ou quatro lances adiante não
é detectado — ampliá-la exigiria confiar na variante inteira do motor, que em
profundidade 16 é a parte menos confiável dela. Sacrifício que o adversário faz
bem em recusar também não conta: em `10. Nxb5` da partida de exemplo a melhor
resposta do motor é `Qb4+`, não `cxb5`, e contra a melhor defesa não há
entrega. E sacrifício de deflexão em que a peça oferecida não é a que se moveu
fica de fora — é a contrapartida deliberada da regra da casa de destino, porque
pela informação disponível esse caso é indistinguível de "havia peça pendurada
e o lance não teve nada a ver com ela".

**Posição já perdida é tratada por saturação, não por escala de
probabilidade.** As avaliações são limitadas a ±1000cp antes de calcular a
perda, então cair de −900 para −1200 conta como perda zero. É deliberado:
perder três peões quando já se está perdido não é o mesmo erro que perder três
peões em posição igual. A alternativa — converter tudo para probabilidade de
vitória — daria uma curva mais suave, ao custo de abandonar o centipeão como
unidade visível.

**A SAN exibida pode diferir da colada.** Se o PGN anotar `Qxe4#` num lance que
só dá xeque, o `chess.js` corrige silenciosamente para `Qxe4+` e é a versão
corrigida que aparece na tela.

**Lances que desfazem desenvolvimento podem cair em "Livro".** Como a teoria é
reconhecida por posição, `1.Nf3 Nf6 2.Ng1 Ng8 3.Nf3 Nf6` volta a uma posição
nomeada e os seis meios-lances aparecem como livro.

**O bundle passa do limite que o Vite avisa** — 771 KB crus, 165 KB
comprimidos, quase inteiramente a base de aberturas. Resolver exigiria carregar
a base por `import()` dinâmico e tornar a consulta de teoria assíncrona, o que
espalharia `async` pela classificação inteira. Ao lado dos 7 MB de WebAssembly
que já são baixados, não pareceu troca que valha a complexidade.

**O custo por posição varia com a máquina do visitante.** É a contrapartida
direta da profundidade fixa, e é a decisão que eu revisitaria primeiro se este
projeto tivesse usuários de verdade em hardware fraco.

**Escopo fechado, por decisão e não por falta de tempo:** não importa partidas
por API do Chess.com ou do Lichess (PGN colado, só), não tem login nem banco,
não gera explicação por IA, não salva nem exporta a variante.

---

## Testes

```
npm test
```

A suíte não roda o Stockfish. As avaliações do motor foram **gravadas uma vez**
por `npm run gravar-avaliacoes` e entram nos testes como dado fixo — o que se
testa é a regra de classificação, que é uma função pura sobre essas
avaliações. A suíte inteira leva menos de meio segundo e não pisca.

Os casos cobertos são os que já estiveram errados em alguma versão, não
exemplos triviais: os dois sacrifícios da Ópera de Morphy, o lance forçado que
não deve ser julgado, o mate que não pode ser rebaixado, o `2. g4` que está na
base de aberturas e mesmo assim é capivara, o buraco da base no meio da
Najdorf, os três falsos Brilhantes da partida caótica, os dois pisos de posição
decidida, e a contagem de material em roque, en passant e promoção.

Conferi que a suíte pega regressão de verdade, e não só passa: removendo a
condição da casa de destino do sacrifício, três testes falham; fazendo "Livro"
ignorar a perda, dois falham; fazendo a teoria terminar no primeiro buraco da
base, quatro falham.

Regravar as avaliações só é necessário se a profundidade, o MultiPV ou a versão
do Stockfish mudarem — e nesse caso as expectativas precisam ser reconferidas à
mão, não ajustadas no automático.

---

## Estrutura

- `src/engine/` — o motor e o protocolo UCI. Nada acima desta camada sabe que
  UCI existe, e toda avaliação que sai daqui já está do ponto de vista das
  brancas. A conversão de sinal acontece num lugar só, porque é fonte clássica
  de erro.
- `src/analise/` — classificação, base de aberturas, contagem de material,
  resumo. Camada pura: roda também fora do navegador, que é o que permite a
  calibração medir o código de verdade em vez de uma reimplementação.
- `src/chess/` — PGN, notação e o modelo de variante, tudo sobre `chess.js`.
- `src/components/`, `src/hooks/` — interface.
- `scripts/` — cópia da build do motor, geração da base de aberturas, gravação
  das avaliações de teste, e a grade de calibração.
- `docs/spec-avaliador-xadrez.md` — a especificação que guiou o projeto.
