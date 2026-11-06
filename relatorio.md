# Extrair ou não extrair — Orion

Gabriel Lopes Pereira — Cenário, Parte 1 e Parte 2.

## Cenário

O Orion é o marketplace didático do professor, com 10 componentes e 17 dependências.
O candidato à extração é **Notificações**; os outros nove componentes permanecem juntos.
O motivador é investigar isolamento de falhas: permitir que problemas no envio dos avisos sejam tratados sem interromper a compra.
Assumimos que a notificação possa chegar depois, hipótese que precisaria ser validada com o negócio.
O Mini-Orion já trata algumas falhas de notificação com uma fila em memória, então a necessidade de extração ainda não está comprovada.

O grafo e os oito módulos vêm do [código do professor, em `07-remoto`](https://github.com/eduardo-da-silva/fundamentos-arquitetura-code/tree/e37835c32e2d6458d01121d1a2d708bda5b5f260/07-remoto), incluído em `base/`.
Seguimos a opção A do [enunciado](https://eduardo-da-silva.github.io/fundamentos-arquitetura/modulo3/projeto-extrair-ou-nao-extrair/): a Parte 1 usa Pagamentos para estudar repetição; a Parte 2 avalia a extração de Notificações.

| Parâmetro | Valor usado | Origem e justificativa |
|---|---|---|
| Mediana da rede | 40 ms | Suposição de comunicação rápida, mas com mais sobrecarga que os 20 ms da base |
| P99 da rede | 700 ms | Suposição de cauda longa por contenção, acima dos 400 ms da base |
| Falha sorteada | 1% | Suposição de menos perdas que os 2% da campanha original |
| Timeout; perda na volta | 1 s; 50% das falhas sorteadas | Padrões do professor mantidos |
| Amostra e sementes | 2.000 compras; 42 e varredura de 1 a 10 | Padrões do ensaio mantidos |
| Disponibilidade e mês | 99,9% por artefato; 30 dias | Hipóteses da Aula 17 mantidas |

São hipóteses didáticas, não medições do Orion. Na Parte 2, adotamos também falha de 1% por chamada, com independência entre falhas nas fórmulas.

## Parte 1 — Custo da rede

Na [Aula 16](https://eduardo-da-silva.github.io/fundamentos-arquitetura/modulo3/aula16-falacias-da-computacao-distribuida/), uma cobrança pode acontecer e a resposta se perder.
Repetir sem proteção pode cobrar novamente. A mesma chave de idempotência em todas as tentativas permite devolver o resultado anterior sem repetir a cobrança.

**Previsão**, preservada do [registro anterior à execução personalizada](https://github.com/lsprdev/orion-extrair-notificacoes/blob/5ccbfd6835234c738f18e97643560b62fc125de5/docs/antes_de_executar.md):
com três tentativas sem chave, esperamos mais duplicações, porque uma cobrança já feita pode ser repetida;
esperamos menos resultados incertos, porque a tentativa adicional pode recuperar uma resposta.

Linha de base: `python base/ensaio.py --varrer`, com 2.000 compras e semente 42.

| Política | Compras com cobrança duplicada | Resultados incertos | Cobrado sem pedido | Pior tempo |
|---|---:|---:|---:|---:|
| Uma tentativa | 0 | 41 | 24 | 1 s |
| Duas tentativas sem chave | 22 | 2 | 2 | 2 s |
| Duas tentativas com chave | 0 | 2 | 2 | 2 s |
| Três tentativas com chave | 0 | 1 | 1 | 3 s |

Resultado personalizado: `python meu_ensaio.py --varrer`, com a mesma amostra e semente.

| Política | Compras com cobrança duplicada | Resultados incertos | Cobrado sem pedido | Pior tempo |
|---|---:|---:|---:|---:|
| Uma tentativa | 0 | 31 | 22 | 1 s |
| Duas tentativas sem chave | 20 | 2 | 2 | 2 s |
| Três tentativas sem chave | 21 | 1 | 1 | 3 s |
| Duas tentativas com chave | 0 | 2 | 2 | 2 s |
| Três tentativas com chave | 0 | 1 | 1 | 3 s |

“Duplicada” conta compras com mais de uma cobrança. “Incerto” significa terminar sem saber se cobrou, após esgotar as tentativas; as colunas podem se sobrepor.
A previsão se confirmou nesta rodada: sem chave, passar de duas para três tentativas aumentou as duplicações de 20 para 21 e reduziu os incertos de 2 para 1.

Varredura de dez sementes, sempre com duas tentativas sem chave:

| Semente | P95 base (ms) | P95 novo (ms) | Timeout base | Timeout novo | Duplicadas base | Duplicadas novo |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 224 | 349 | 2,15% | 1,80% | 1,35% | 1,45% |
| 2 | 195 | 325 | 1,90% | 1,50% | 1,10% | 1,10% |
| 3 | 211 | 335 | 2,05% | 1,55% | 1,30% | 1,25% |
| 4 | 226 | 351 | 1,80% | 1,40% | 1,10% | 1,05% |
| 5 | 218 | 350 | 1,80% | 1,50% | 0,85% | 1,05% |
| 6 | 224 | 350 | 2,10% | 1,30% | 1,15% | 0,85% |
| 7 | 199 | 309 | 1,85% | 1,20% | 0,95% | 0,80% |
| 8 | 198 | 312 | 1,90% | 1,20% | 0,85% | 0,75% |
| 9 | 204 | 329 | 1,90% | 1,30% | 1,05% | 0,90% |
| 10 | 220 | 325 | 2,50% | 1,50% | 1,20% | 0,95% |

“Timeout” é a proporção de compras que esperaram pelo menos um timeout inteiro.
Na base, o P95 varia de 195 a 226 ms e as duplicações de 0,85% a 1,35%; no cenário novo, de 309 a 351 ms e de 0,75% a 1,45%.
Os sorteios mudam, mas nenhuma dessas rodadas elimina as duplicações sem chave.
Na semente 42, as duplicações com duas tentativas sem chave caíram de 22 para 20, enquanto os incertos continuaram em 2: mudar as hipóteses não eliminou o problema da repetição.

Para a cobrança simulada, adotaria **até três tentativas com a mesma chave**: zero duplicações, um incerto e pior tempo de três segundos.
Sem chave, as mesmas três tentativas deixaram 21 compras com cobrança duplicada.
A escolha custa mais espera e armazenamento das chaves; o caso incerto ainda precisa de consulta ou conciliação.
O ensaio não mede notificações, concorrência, persistência das chaves nem espera entre tentativas.
Para Notificações, a lição é que repetir um envio também pode repetir seu efeito.

## Parte 2 — Formas de dividir o Orion

O [meu_quantum.py](meu_quantum.py) compara quatro formas usando o grafo da [Aula 17](https://eduardo-da-silva.github.io/fundamentos-arquitetura/modulo3/aula17-service-based-e-microsservicos/).
Um quantum reúne componentes ligados por um mesmo artefato, por chamadas síncronas ou por banco compartilhado, conforme o modelo simplificado da aula.

Contagem manual preservada do registro anterior e conferida pelos testes:

| Forma | Artefatos de aplicação | Dependências remotas | Remotas diretas do Checkout | Quanta, tudo síncrono |
|---|---:|---:|---:|---:|
| Monólito | 1 | 0 | 0 | 1 |
| Só Notificações separado | 2 | 4 | 0 | 1 |
| Por domínio | 8 | 15 | 4 | 1 |
| Microsserviços | 10 | 17 | 5 | 1 |

No monólito, nenhuma dependência cruza artefatos. Na extração, as quatro remotas são as entradas de **Pedidos, Pagamentos, Logística e Integrações** em Notificações.
Por domínio, apenas `Checkout>Pedidos` e `Promocoes>Catalogo` ficam internas: 17 − 2 = 15 remotas.
Nos microsserviços, todas as 17 são remotas. Com tudo síncrono, o grafo segue conectado e há um quantum em qualquer forma.

A opção `--assincronas` recebe pares `Origem>Destino` separados por vírgula:

```bash
python meu_quantum.py --banco-por-servico --assincronas "Pedidos>Notificacoes,Pagamentos>Notificacoes,Logistica>Notificacoes,Integracoes>Notificacoes"
```

Para isolar Notificações, as quatro entradas precisam passar por fila e o banco precisa ser separado; deixar uma entrada síncrona mantém um quantum.
Nos microsserviços, o menor conjunto que separa **algum** componente tem duas arestas: `Portal>Clientes,Checkout>Clientes` isola Clientes.
Os testes conferem que nenhuma aresta sozinha basta. Isso é uma possibilidade do grafo, não uma recomendação de enfileirar consultas a Clientes.
Com banco compartilhado, nem tornar todas as dependências assíncronas separa os quanta.

Na adaptação, foi necessário permitir `--banco-por-servico` também na extração: o original só variava os bancos dos microsserviços.
As contagens manuais conferiram. A expressão “reduzir quanta” do enunciado foi interpretada como reduzir acoplamento: a separação aumenta o número de grupos de um para dois.

Estimativas de custo do recorte direto do Checkout:

| Forma | Artefatos tocados | Chance de falha | Disponibilidade | Minutos fora/mês |
|---|---:|---:|---:|---:|
| Monólito | 1 | 0,00% | 99,90% | 43,20 |
| Só Notificações separado | 1 | 0,00% | 99,90% | 43,20 |
| Por domínio | 4 | 3,94% | 99,60% | 172,54 |
| Microsserviços | 6 | 4,90% | 99,40% | 258,55 |

As fórmulas são `P(falha) = 1 − 0,99^n`, `A = 0,999^k` e `minutos = (1 − A) × 43.200`.
`n` conta chamadas remotas diretas; `k` conta artefatos distintos tocados, incluindo o Checkout.
Por domínio, Catálogo e Promoções compartilham um artefato, e Pedidos fica junto de Checkout: quatro chamadas remotas tocam quatro artefatos contando o próprio.

Quanta nas quatro situações, usando as quatro filas de Notificações:

| Forma | Síncrono / banco único | Filas / banco único | Síncrono / bancos separados | Filas / bancos separados |
|---|---:|---:|---:|---:|
| Monólito | 1 | 1 | 1 | 1 |
| Só Notificações separado | 1 | 1 | 1 | 2 |
| Por domínio | 1 | 1 | 1 | 2 |
| Microsserviços | 1 | 1 | 1 | 2 |

Artefatos, dependências, chamadas e quanta vêm da estrutura; falha, disponibilidade e minutos dependem das hipóteses.
As filas alteram apenas o cálculo dos quanta. Os custos mantêm o recorte direto síncrono do Checkout, sem percorrer dependências indiretas nem incluir banco e fila como fatores separados.
Por isso, zero chamadas remotas diretas na extração não significa risco zero no sistema.
**Separar o deploy não garante independência em execução**: para Notificações, o modelo só chega a dois quanta com as quatro filas e bancos separados.

Validação: `python -m pytest -q`, com Python 3.12.16 e pytest 9.0.3.

```text
........................................................................ [ 85%]
............                                                             [100%]
84 passed in 0.31s
```

São 47 testes da base e 37 casos das adaptações, incluindo contagem manual, idempotência, filas, bancos e a execução de `--assincronas`.
