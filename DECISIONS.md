# DECISIONS.md — registro de decisões com motivo

Este arquivo guarda o **porquê** de cada decisão arquitetural não-óbvia. Não é
documentação de uso; é defesa contra alguém (humano ou IA futura) "consertar"
um invariante achando que é arbitrário.

Cada entrada aqui deve responder a *por que* esta decisão foi tomada, não só
*qual* foi. A versão completa será populada no Passo 7 com uma linha por
invariante (I-1 a I-15) e por decisão arquitetural (A–I do Passo 3, D1–D7 do
Passo 3, fix de R1 etc.).

---

## Dívidas técnicas com gatilho nomeado

> Dívida sem gatilho é dívida esquecida. As entradas aqui têm condição de
> revisão explícita — o próprio momento futuro dispara a releitura.

### wa-sqlite npm 1.0.0 (SQLite 3.44.0) × GitHub v1.1.1

**Estado atual (2026-05-22):** projeto usa `wa-sqlite@1.0.0` instalado via npm
(SQLite 3.44.0, publicado em jan/2024). Engine de **TESTE** — bem como
`better-sqlite3`. **Não selado** como engine de produção.

**Dívida:** o tag `v1.1.1` no GitHub (abr/2024) traz bugfixes de WAL que tocam
especificamente o caminho OPFS — o runtime de produção alvo no celular. Esse
tag não está no npm; está disponível via:

```
npm install --save-dev github:rhashimoto/wa-sqlite#v1.1.1
```

**🚨 GATILHO DE REVISÃO OBRIGATÓRIA:** **antes** de empacotar a primeira versão
do app que persiste dados em OPFS no celular, reavaliar entre:

- **(A) manter** `wa-sqlite@1.0.0` / SQLite 3.44.0
- **(B) trocar** para `github:rhashimoto/wa-sqlite#v1.1.1` / SQLite ~3.45
  (recomendado pelos bugfixes específicos de WAL/OPFS)

**Não empacotar** produção sobre 1.0.0 sem essa reavaliação. Se você está lendo
isto e está prestes a fazer build de produção que ativa persistência em OPFS:
pare aqui e decida.

**Por que não decidir agora:** otimização prematura. A escolha do engine de
produção não tem custo nenhum até existir UI rodando em OPFS no celular. O que
importa hoje é a parametrização dos testes nos dois engines para fechar a
fresta de drift de versão; o engine de produção fica para o momento que o
problema é real.

**Por que (C) "build do master" está fora:** Emscripten build para single-user
app é over-engineering da mesma família que rejeitamos em CRDT/HLC. Ver
[`feedback-anti-overengineering` na memória do agente].

### Stubs de engine de deload — baseline circular + constantes sem fundamento

**Estado atual (Passo 5, leva 2):** três stubs provisórios em
`src/engine/decision/` (`deload.ts`, `trend.ts`) encapsulam regras de deload
reativo, classificação de tendência e gate de queda objetiva. Eles **funcionam**
para os invariantes I-4, I-5, I-14 (provam discriminação), mas dependem de
quatro constantes e de uma fórmula de baseline que **não foram calibradas
empiricamente** e **não têm fundamento científico decidido neste projeto**.

**Por que é dívida (problema 1 — baseline circular):** o
`shouldSuggestDeload` em `src/engine/decision/deload.ts` computa a baseline
como a **média da própria série filtrada** (excluindo entradas
`recall_late=true`) e classifica como "queda" qualquer sessão abaixo de
`baseline × (1 - LOAD_DROP_THRESHOLD_PCT)`. **Circular**: se a carga cair
monotonicamente em todos os dias (regressão real lenta), a média acompanha a
queda e nenhuma sessão fica "abaixo do baseline" — o gatilho **não dispara**.
A baseline correta seria independente da série recente: carga de referência do
bloco do plano, ou média histórica das últimas N semanas estáveis, ou peso de
referência por exercício.

**Por que é dívida (problema 2 — constantes sem fundamento):** quatro
constantes em `src/domain/constants.ts` foram introduzidas como
**placeholders de stub** sem fundamento científico decidido — números
escolhidos para satisfazer os testes, não derivados de literatura ou
calibração com dados próprios:

- **`OBJECTIVE_DELOAD_JUMP_DROP_PCT = 0.10`** — queda relativa de
  jump_height instrumentado que dispara o ramo objetivo de deload.
  Decisão científica: ver Foster (sRPE), RSI-mod (Behm 2024) e literatura
  sobre detecção de overreaching por queda de salto. Hoje é 10%, chutado.

- **`LOAD_DROP_THRESHOLD_PCT = 0.30`** — quão abaixo da baseline uma sessão
  precisa estar para contar como "queda" no `shouldSuggestDeload`. Hoje é 30%,
  chutado. Conectado ao problema 1 (baseline circular).

- **`CONSECUTIVE_LOAD_DROP_DAYS_FOR_DELOAD = 2`** — número de sessões
  consecutivas de queda para sugerir deload reativo (brief §8.3). O `2` vem
  do brief, então tem alguma ancoragem; mas a operacionalização precisa
  ser revista junto com os outros valores.

- **`TREND_REGRESSION_THRESHOLD_PCT = 0.15`** — queda relativa na média
  das semanas que classifica tendência como "regressão" em
  `computeTrend`. Hoje é 15%, chutado.

**Conexão com a Auditoria-lacunas (V2, L1):** detecção de overreaching e
calibração de carga interna são exatamente as áreas que aquela auditoria
sinaliza como precisando de fundamento empírico antes da engine real.

**🚨 GATILHO DE REVISÃO OBRIGATÓRIA:** quando a engine de deload/trend real
for construída (item 6 do brief §12), tratar **TODOS** estes valores como
indecisos:
1. Trocar baseline circular por carga de referência do bloco do plano (ou
   alternativa que não dependa da série recente);
2. Derivar cada uma das 4 constantes acima de literatura validada (Foster,
   RSI-mod/Behm, ACWR como informacional sem peso decisório por I-9) ou
   calibrar com dados próprios acumulados;
3. Não tratar nenhum dos quatro números atuais como "decidido" — eles existem
   apenas para os stubs satisfazerem os invariantes do Passo 5.

Os testes de invariante validam **comportamento de discriminação** (par
positivo/negativo retorna opostos), não os números — então rever esses
valores não quebra os testes atuais.
