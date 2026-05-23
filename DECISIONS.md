# DECISIONS.md — registro de decisões com motivo

Este arquivo guarda o **porquê** de cada decisão arquitetural não-óbvia. Não é
documentação de uso; é defesa contra alguém (humano ou IA futura) "consertar"
um invariante achando que é arbitrário.

Cada entrada responde a *por que* esta decisão foi tomada, não só *qual* foi.
Quando o brief (`brief-data-model-fase0.md`) e este documento divergirem em
algum ponto, **o brief é a fonte de verdade** — este documento é o
acompanhamento que explica os porquês e registra refinamentos do brief.

---

## §A. Invariantes I-1 a I-15 — porquê de cada um

> Para cada invariante da Seção 9 do brief, uma linha (ou duas) explicando o
> que ele previne. Se algum invariante parecer arbitrário, **leia o porquê
> aqui antes de tentar "consertá-lo"** — eles foram destilados de erros
> concretos do projeto, não inventados.

### I-1 — Observação ≠ interpretação

A régua-mãe. O projeto repetiu o mesmo erro estrutural quatro vezes em camadas
diferentes (VBT, sensor de fadiga, `role`, plano-como-contrato) antes de
nomear: confundir output com sinal, ou gravar interpretação como se fosse
fato. Sem I-1, I-2/I-3/I-15 parecem frescura; com ele, viram consequências
naturais. **Quem quiser ignorar: releia §1.2 do brief inteiro antes de
discordar.**

### I-2 — `role` nunca persiste

A mesma `height` é KPI para a regra de progressão e contexto para a regra de
fadiga (§1.2). Se `role` fosse coluna, congelaria uma das duas leituras como
verdade — a outra regra teria que disputar o significado do mesmo número.
Solução: `role` vive na engine como função de (métrica, regra, bloco); o
registro guarda só a métrica.

### I-3 — Teste de salto grava observação pura (sem RSI/RSI-mod)

Tentação contínua porque RSI = `height / contact_time` é cálculo barato. Mas o
papel do RSI muda por bloco (kpi_reactive só em Mês 3 peaking); gravar a
derivação como coluna seria gravar a interpretação do Mês 3 dentro de dados
que vão ser relidos em Mês 1 e Mês 2. Derivar na leitura é mais barato em CPU
do que retrofitar mil registros depois de mudar a regra.

### I-4 — Só `instrumented` dispara o ramo objetivo de deload

Sinais subjetivos (soreness, motivação) já têm canal próprio (`daily_signal`).
Se também disparassem o ramo objetivo, "dormi mal" se confundiria com
"overreaching" — estado de prontidão contra estado de adaptação crônica. Os
ramos têm que ficar separados para a engine não sugerir alívio crônico em
resposta a ruído agudo.

### I-5 — `sRPE` carimbado + `recall_late` excluído deterministicamente

sRPE narrado horas depois é observação degradada (viés de recordação). A
tentação é deixar entrar como "menos confiável" — pior dos mundos: dado de
baixa confiança pesando em decisão objetiva. Solução binária: 30 min
(constante nomeada `RECALL_LATE_THRESHOLD_MIN`) define a janela; fora dela,
exclusão **determinística** do ramo objetivo. O dado fica registrado
(transparência), mas a engine sabe ignorá-lo.

### I-6 — `contact_time` só em `jump_test`, nunca em `session_set`

`contact_time` instrumentado exige plataforma de força (MyJump no celular).
Fora disso, vira chute. Se a coluna existisse em `session_set`, alguém um dia
preencheria de cabeça — e a engine usaria como instrumentado. Tornar a coluna
**fisicamente ausente** em `session_set` (e o `CASE WHEN 'contact_time' THEN
0` no CHECK exaustivo) faz o invariante virar estrutura, não disciplina.

### I-7 — Aquecimento fora de progressão/volume

3×5 a 60kg aquecendo para um agachamento pesado parece "trabalho". Se entrar
no volume, o histórico semanal mente; se entrar na progressão, o sistema
"decide" subir carga baseado em séries de aquecimento. Marcar `is_warmup`
separa intenção de execução pesada — sem ele, a estatística confunde calor
com força.

### I-8 — Piso de SD na monotony

`monotony = média / SD`. Se a carga é uniforme, `SD ≈ 0` e a monotony explode
para `Infinity`. A fórmula sinalizaria "overreaching iminente" justamente
quando o usuário está **mais consistente**. Piso de SD elimina a divisão por
~zero. O número exato do piso é revisável; o piso em si não é. O teste valida
**comportamento** (uniforme → finito; varied < uniforme), não o número.

### I-9 — ACWR sem peso decisório

A razão aguda:crônica, popularizada na literatura de gestão de carga e
parcialmente desconstruída desde (Impellizzeri et al., ver
AUDITORIA-lacunas V1), não é preditor causal validado de lesão. Manter
como informação opcional ("consciência de pico") é OK; deixar pesar em
decisões automáticas é importar dogma. A regra **negativa** (nenhum módulo
de decisão consulta ACWR) evita esse arrasto.

### I-10 — `measurement_source` imutável

Um dado nasce instrumentado (MyJump, balança) ou subjetivo (olho). Se
`measurement_source` pudesse mudar, o usuário "corrigiria" um dado subjetivo
para instrumentado depois — falsificando a base estatística. O trigger
anti-UPDATE garante que a confiança do dado é fixada no momento da
observação, não revisável retroativamente.

### I-11 — Sync last-write-wins por `timestamp_server` (uso **sequencial** single-user)

O caso real: treina no celular, depois mexe no plano no PC. **Sequencial, não
concorrente.** Importar CRDT/HLC resolveria um problema que não existe ao
custo de tombstones, oplog e relógio lógico em cada linha. Decisão A do Passo
3: arquivo-LWW + snapshot pré-sobrescrita + aviso quando os dois lados
divergirem do mesmo ancestral. CRDT explicitamente rejeitado. Ver brief §9
I-11 (atualizado para refletir esta decisão).

### I-12 — Sessão é lista mutável, não cópia read-only do plano

O app anterior (RepCount) tratava a sessão como cópia read-only do plano.
Reordenar, adicionar exercício novo, trocar por barra ocupada — tudo fricção.
**O abandono veio dali.** A sessão é totalmente maleável; o plano só semeia.
O hash do `work_block` antes e depois da mutação prova que a separação é
estrutural, não disciplinada.

### I-13 — Gate de timing `acute_interference` (**avisa, não bloqueia**)

Bloqueio duro contradiz §6.3 (anti-culpa). Se o gate barra o usuário
fisicamente, o app passa de auxiliar a guardião — exatamente o anti-padrão
que afastou o usuário do RepCount. Solução: aviso estruturado + flag
`session.interference_warned = true` para a estatística considerar. A sessão
prossegue. Ver brief §9 I-13 e §7.2 (atualizados para refletir esta decisão).
Cabeçalho de §8.5 também atualizado: "HARD por padrão; ver I-13 para a
exceção `acute_interference`".

### I-14 — Deload não é regressão

Semanas de deload têm carga ~50% das normais. Se a engine computa tendência
sem excluir essas semanas, ela classifica "regressão" exatamente quando o
usuário está executando o plano corretamente. A informação "esta semana é
deload" mora em `plan_phase` (D4 — derivada do `timestamp` da sessão);
corrigir a periodização reclassifica as semanas antigas automaticamente.

### I-15 — Desvio não progride o planejado (**mas o substituto progride a si mesmo**)

A regra ingênua "item `substituted` não progride" é incompleta. Ela protege o
**planejado** (back_squat não progride se substituído por leg_press), mas
ignora que o substituto **foi executado**. Refino R3 do Passo 2: o substituto
SEMPRE progride a si mesmo se foi executado, qualquer `deviation_reason`. O
`deviation_reason` só protege a engine de **sugestão** (`equipment_busy` não
vira preferência aprendida), não bloqueia a progressão do que foi feito.
I-15 protege apenas o **planejado-não-feito**. Ver brief §9 I-15 (atualizado).

### I-10 derivado (D1) — `progression_type` imutável em `exercise` e `session_set`

Não está na Seção 9 do brief; é derivado da régua de §1.2 ("nasce fixo e
nenhuma regra futura reclassifica") via a decisão D1 do Passo 3. A
desnormalização de `progression_type` para dentro de `session_set` só é
segura se o tipo no `exercise` for imutável — senão séries antigas mentiriam
sobre o que mediram. Triggers anti-UPDATE em ambas as colunas fazem essa
imutabilidade estrutural. "Mudar o tipo" implica criar novo exercise; o
histórico antigo fica colado ao tipo antigo (correto).

### R1 — `quality` colapsada em uma coluna (papel duplo)

Originalmente propus duas colunas: `contact_quality_observed` (medida
primária) e `quality` (sinal secundário da §7.4). Mesmo enum (`stable |
tremor | joint_pain`), mesmo dado, duas colunas — modelagem do **papel** como
**fato**, exatamente o erro 3 do brief em miniatura. Colapso em uma só
coluna `quality` com papel decidido pela engine: primária quando
`progression_type='contact_quality'` (CHECK exige `NOT NULL`), secundária
opcional para outros tipos. Uma observação, uma coluna; o papel é
interpretação.

---

## §B. Decisões arquiteturais do Passo 3 (A–I)

### A — Sync por arquivo + LWW (não CRDT/HLC)

Single-user sequencial, não concorrente. CRDT resolveria problema que não
existe ao custo de dobrar a complexidade do schema (tombstones, oplog,
relógio lógico). Salvaguarda contra perda: backup versionado snapshota a
versão que seria sobrescrita; aviso quando os dois lados divergem do mesmo
ancestral. Honra I-11 sem importar padrões de SaaS.

### B — `wa-sqlite + OPFS` local; Drive como snapshot periódico

OPFS dá persistência durável no browser (Safari 17.4+ via SyncAccessHandle —
iPhone 15 com iOS recente coberto). O "arquivo no Drive" vira snapshot
periódico, mesmo caminho do backup §10.5. Evita dois caminhos de persistência
divergentes. Ver dívida com gatilho sobre versão npm vs GitHub do wa-sqlite.

### C — React + Vite (não Svelte/SolidJS)

Critério decisivo neste projeto: **manutenibilidade por leigo via IA por
anos** vence elegância técnica. React é o ecossistema que qualquer modelo
futuro mantém com menos erro. Svelte/SolidJS são mais elegantes mas menos
universais — perda real de manutenibilidade para um usuário que vai depender
de IA para manter o código.

### D — Migrations caseiras (SQL puro numerado + `schema_version`)

Brief manda migrations como artefato de primeira classe. Lib amarra o schema
ao gerador; SQL puro versionado é transparente, auditável, e sobrevive a
troca de ferramenta. Único acoplamento: cada arquivo termina com `INSERT INTO
schema_version` que o runner executa dentro de transação.

### E — Vitest, um arquivo por invariante (`I-XX.test.ts`)

Rastreabilidade direta entre teste e invariante. O número do invariante no
nome do arquivo carrega o "porquê" para o leitor. `describe.each` parametriza
os testes DB-touching nos dois engines (better-sqlite3 + wa-sqlite-node) sem
duplicar `describe`.

### F — `function_tag` string livre + tabela de tags canônicas

Enum fechado congelaria vocabulário cedo demais — modelagem da taxonomia como
fato (anti-padrão de §1.2). String livre cresce com o uso; tabela canônica
permite normalização quando a engine de substituição precisar consultar por
função (não por músculo).

### G — Engine híbrida: agregações em SQL views, decisões em TS

Agregações estatísticas (Foster, monotony, tendência) são estáveis e baratas
como SQL views — declarativas, sem regra de negócio. Regras de decisão
(deload reativo, gates de segurança, progressão) evoluem e precisam de testes
unitários — TS é o lar correto. Híbrido respeita a natureza diferente das
duas camadas.

### H — `RECALL_LATE_THRESHOLD_MIN = 30` como constante nomeada

Brief diz "~15-30 min"; fixado em 30 como constante nomeada e revisável. O
teste I-5 valida **comportamento** (cruza/não cruza), não o número. Esse é o
padrão para todos os limiares do app — número solto no código é
anti-padrão; constante nomeada é revisão sem caçar referências.

### I — Backup: 30 versões + rotação >90 dias mantém 1/semana

30 versões cobrem ~1 mês de uso diário sem buracos. Rotação >90 dias mantém
granularidade semanal — sobrevive a perda longa sem virar hoarding. Mais que
isso é excesso; menos é arrependimento se o usuário precisar voltar mais de
um mês.

---

## §C. Decisões de modelagem do Passo 3 (D1–D7)

### D1 — `session_set` polimórfico + `progression_type` desnormalizado

A unidade atômica de observação é a série, e cada série carrega sua natureza
(`load_reps`, `time_under_tension`, etc.). Colunas opcionais polimórficas
permitem checagem de tipo no banco (vs EAV); a desnormalização de
`progression_type` em `session_set` torna o CHECK self-contained (CHECK do
SQLite não cruza tabela). Triggers anti-UPDATE em `exercise.progression_type`
e `session_set.progression_type` garantem que a cópia não diverge da origem.
Princípio: "qual tipo de medida eu estava fazendo" é parte **irredutível** da
observação da série, não interpretação importada.

### D2 — `jump_test` separado de `session_item`

Teste de salto é evento próprio (brief §10.4: "lembrete do teste de salto no
início de cada bloco"), não item de bloco. `contact_time` só existe em
`jump_test` — separar torna I-6 fisicamente garantido. `session_id`
nullable porque você pode testar de manhã, fora de sessão.

### D3 — `attached_routine_id` na sessão; itens semeados como cópias-de-observação

Definição da rotina vive em uma só linha do catálogo (brief §7.1: "uma rotina
referenciada três vezes, NÃO três cópias"). A semeadura copia os itens da
rotina para `session_item` com `from_routine_id` setado — cópia de
observação, não duplicação de definição. Mudar a rotina afeta sessões
futuras; o histórico das antigas fica congelado nos `session_item`s já
semeados.

### D4 — `plan_phase` com `is_deload`/`is_taper` derivado por timestamp

Carimbar `is_deload` na sessão e corrigir a periodização depois faria as
sessões antigas mentirem. Fase derivada por `started_at` da sessão + tabela
`plan_phase` torna I-14 estrutural — correções na periodização reclassificam
as sessões automaticamente.

### D5 — `body_weight_log` próprio (não coluna em session)

Peso corporal é observação independente de sessão. Pivô de ênfase (§8.4) e
razão agachamento/peso corporal leem o registro mais próximo. Algumas
pessoas pesam diário, outras semanal; gravar dentro da sessão obrigaria
pesar a cada treino.

### D6 — Timestamps como `INTEGER` (epoch ms)

Aritmética de janela é matemática, ordenação é numérica. `EpochMs` brandado
em TS evita confusão. View ISO opcional para legibilidade humana — não
bloqueia.

### D7 — Booleans `INTEGER 0/1` com `CHECK (col IN (0,1))`

Idioma SQLite — sem tipo BOOLEAN nativo. `INTEGER 0/1` com CHECK é o padrão
da comunidade. Tipos TS brandados se desejado para evitar passar `0` onde
se espera `false` semântico.

---

## §D. Decisões de processo

### Caminho I — Engine como stubs minimalistas alongside os testes

Brief §12 manda testes ANTES da engine de verdade. Os "stubs" em
`src/engine/` não são vazios — cada um implementa exatamente a regra do
invariante (`isRecallLate`, `monotony`, `shouldSuggestObjectiveDeload`,
etc.). Quando a engine real entrar (item 6 do brief), ela **expande** os
stubs, não os substitui. Permite que os 15 testes de invariante existam
como contrato executável desde o Passo 5. Cada stub leva no docblock:
"STUB PROVISÓRIO — implementa apenas a regra de I-N".

### Fonte única de verdade por regra (não duplicar)

Não duplicar regra entre schema SQL e TS. Cada regra escolhe sua casa pela
natureza:

- **Verificações de valor (enum membership, NOT NULL, range simples):**
  schema, via CHECK.
- **Regras cross-field/contextuais (com mensagem de erro útil):** TS, com
  teste dedicado.
- **Invariantes estruturais atemporais, impossíveis de driftar:** schema,
  via TRIGGER (ex.: I-10 measurement_source imutável, I-10 derivado
  progression_type imutável).

Pergunta-teste para qualquer regra nova: "se eu mudar essa regra, em
quantos lugares preciso editar?" Resposta deve ser **um**.

### Anti-over-engineering

Não importar padrões de SaaS multi-user para app single-user pessoal.
CRDT/HLC, oplog, tombstones existem para resolver concorrência verdadeira;
nosso uso é sequencial. Mesma família para qualquer "solução para problema
que não temos": Emscripten build do wa-sqlite from source, vector clocks,
distributed consensus — todos rejeitados pelo mesmo critério. Justificativa
estrutural: app pessoal mantido por leigo via IA não pode carregar a
complexidade de uma plataforma multi-tenant.

---

## §E. Dívidas técnicas com gatilho nomeado

> Dívida sem gatilho é dívida esquecida. As entradas aqui têm condição de
> revisão explícita — o próprio momento futuro dispara a releitura. Quando o
> gatilho corresponder à situação atual, **pare e decida** antes de seguir.

### Dívida 1 — wa-sqlite npm 1.0.0 (SQLite 3.44.0) × GitHub v1.1.1

**Estado atual (2026-05-22):** projeto usa `wa-sqlite@1.0.0` instalado via
npm (SQLite 3.44.0, publicado em jan/2024). Engine de **TESTE** — bem como
`better-sqlite3`. **Não selado** como engine de produção.

**Dívida:** o tag `v1.1.1` no GitHub (abr/2024) traz bugfixes de WAL que
tocam especificamente o caminho OPFS — o runtime de produção alvo no
celular. Esse tag não está no npm; está disponível via:

```
npm install --save-dev github:rhashimoto/wa-sqlite#v1.1.1
```

**🚨 GATILHO DE REVISÃO OBRIGATÓRIA:** **antes** de empacotar a primeira
versão do app que persiste dados em OPFS no celular, reavaliar entre:

- **(A) manter** `wa-sqlite@1.0.0` / SQLite 3.44.0
- **(B) trocar** para `github:rhashimoto/wa-sqlite#v1.1.1` / SQLite ~3.45
  (recomendado pelos bugfixes específicos de WAL/OPFS)

**Não empacotar** produção sobre 1.0.0 sem essa reavaliação. Se você está
lendo isto e está prestes a fazer build de produção que ativa persistência
em OPFS: **pare aqui e decida**.

**Por que não decidir agora:** otimização prematura. A escolha do engine de
produção não tem custo nenhum até existir UI rodando em OPFS no celular. O
que importa hoje é a parametrização dos testes nos dois engines para fechar
a fresta de drift de versão; o engine de produção fica para o momento que
o problema é real.

**Por que (C) "build do master" está fora:** Emscripten build para
single-user app é over-engineering da mesma família que rejeitamos em
CRDT/HLC.

### Dívida 2 — Stubs de engine de deload: baseline circular + constantes sem fundamento

**Estado atual (Passo 5, leva 2):** três stubs provisórios em
`src/engine/decision/` (`deload.ts`, `trend.ts`) encapsulam regras de deload
reativo, classificação de tendência e gate de queda objetiva. Eles
**funcionam** para os invariantes I-4, I-5, I-14 (provam discriminação),
mas dependem de quatro constantes e de uma fórmula de baseline que **não
foram calibradas empiricamente** e **não têm fundamento científico
decidido neste projeto**.

**Por que é dívida (problema 1 — baseline circular):** o
`shouldSuggestDeload` em `src/engine/decision/deload.ts` computa a baseline
como a **média da própria série filtrada** (excluindo entradas
`recall_late=true`) e classifica como "queda" qualquer sessão abaixo de
`baseline × (1 - LOAD_DROP_THRESHOLD_PCT)`. **Circular**: se a carga cair
monotonicamente em todos os dias (regressão real lenta), a média acompanha
a queda e nenhuma sessão fica "abaixo do baseline" — o gatilho **não
dispara**. A baseline correta seria independente da série recente: carga
de referência do bloco do plano, ou média histórica das últimas N semanas
estáveis, ou peso de referência por exercício.

**Por que é dívida (problema 2 — constantes sem fundamento):** quatro
constantes em `src/domain/constants.ts` foram introduzidas como
**placeholders de stub** sem fundamento científico decidido — números
escolhidos para satisfazer os testes, não derivados de literatura ou
calibração com dados próprios:

- **`OBJECTIVE_DELOAD_JUMP_DROP_PCT = 0.10`** — queda relativa de
  jump_height instrumentado que dispara o ramo objetivo de deload.
  Decisão científica: ver Foster (sRPE) e RSI-mod como sensor de fadiga
  (Gathercole et al. 2015; instrumentação via MyJump app, Bishop et al.
  2022 — ambos via AUDITORIA-lacunas V2/§10). Hoje é 10%, chutado.

- **`LOAD_DROP_THRESHOLD_PCT = 0.30`** — quão abaixo da baseline uma sessão
  precisa estar para contar como "queda" no `shouldSuggestDeload`. Hoje é
  30%, chutado. Conectado ao problema 1 (baseline circular).

- **`CONSECUTIVE_LOAD_DROP_DAYS_FOR_DELOAD = 2`** — número de sessões
  consecutivas de queda para sugerir deload reativo (brief §8.3). O `2`
  vem do brief, então tem alguma ancoragem; mas a operacionalização
  precisa ser revista junto com os outros valores.

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
2. Derivar cada uma das 4 constantes acima de literatura validada (Foster
   sRPE; RSI-mod via Gathercole 2015 + MyJump Bishop 2022; ACWR como
   informacional sem peso decisório por I-9) ou calibrar com dados
   próprios acumulados;
3. Não tratar nenhum dos quatro números atuais como "decidido" — eles
   existem apenas para os stubs satisfazerem os invariantes do Passo 5.

Os testes de invariante validam **comportamento de discriminação** (par
positivo/negativo retorna opostos), não os números — então rever esses
valores não quebra os testes atuais.

### Dívida 3 — Mitigação de eviction de storage no iPhone (AUDITORIA-lacunas L3)

**Estado atual:** sem mitigação implementada. O app planeja usar OPFS no
Safari iOS como persistência primária (decisão B), mas Safari iOS pode
**evict storage** de PWAs sob pressão de espaço ou após inatividade —
risco alto de perda de dados (per AUDITORIA-lacunas L3). Frequência de
uso **não é mitigação confiável**, mesmo o usuário abrindo o app 3-4×
por semana.

**Mitigação estrutural exigida, independente de frequência:**

1. **Persistência durável solicitada:** chamar
   `navigator.storage.persist()` na inicialização do app para pedir ao
   navegador que NÃO faça evict do OPFS deste origin sob pressão de
   espaço. Tratar resposta `false` (negada) como sinal de exigir backup
   mais agressivo.

2. **Backup automático ao fim de cada sessão:** ao fechar uma sessão de
   treino, snapshotar o estado no Drive automaticamente — mesmo caminho
   do backup versionado da §10.5 do brief. Sem confiar em "vou voltar
   amanhã" para sincronizar.

**🚨 GATILHO DE REVISÃO OBRIGATÓRIA:** antes do primeiro deploy que rode
PWA no celular do usuário, implementar essas duas mitigações. Sem isso, o
usuário pode perder semanas de histórico de um momento para outro — risco
alto que NÃO desaparece com uso frequente.

**Por que registrar agora:** o conhecimento da L3 já existe; deixar a
mitigação para "depois" no momento de criar a UI é exatamente como dívidas
de plataforma viram bugs de produção.

### Dívida 4 — `pain_log.location` como string livre (convenção da engine)

**Estado atual:** `pain_log.location` é `TEXT NOT NULL` sem CHECK — string
livre. O usuário pode gravar `'knee'`, `'joelho'`, `'patela'`, `'JOELHO'`,
etc., e o schema aceita todos.

**Por que é dívida:** o gate de dor patelar (brief §8.5) precisa achar a
dor **do joelho** especificamente. Com string livre, a engine pode não
casar `'knee'` com `'joelho'` e perder o gate.

**Por que não é problema do schema agora:** string livre é defensável
(mesma justificativa que `function_tag` na decisão F do Passo 3) — congelar
vocabulário no schema seria modelar a taxonomia como fato.

**🚨 GATILHO DE REVISÃO:** quando o gate de dor patelar (separado do gate
de interferência I-13) for implementado, introduzir tabela de localizações
canônicas (`pain_location` analógica à `function_tag`) e normalizar valores
na engine. Não tocar no schema do `pain_log.location` — a normalização vive
em camada de engine, não em constraint.

### Dívida 5 — Mecanismo da chave da API Anthropic (AUDITORIA-lacunas L2)

**Estado atual:** brief §2 e README descrevem a feature de IA (importar
plano via texto, narração pós-treino) sem cravar o mecanismo de chave.
PWA sem backend rodando no browser **não tem variável de ambiente de
servidor** — a frase original do brief ("chave gerida pelo ambiente")
foi corrigida no Passo 7 para refletir essa realidade.

**Saída provável (L2):** BYOK — o usuário cola a própria chave nas
configurações do app. Decisão pendente sobre onde a chave persiste:

- **(A)** tabela `config` no SQLite/OPFS — persistente, mas vaza junto
  com o backup do banco para o Drive (risco de exposição se o Drive
  for comprometido ou compartilhado);
- **(B)** re-input por sessão — sem persistência; mais seguro mas mais
  atrito (você cola a chave toda vez que abre o app);
- **(C)** localStorage isolado — não vai junto com o backup do banco;
  intermediário entre (A) e (B).

**🚨 GATILHO DE REVISÃO OBRIGATÓRIA:** antes de implementar **qualquer**
feature que faça chamada à API da Anthropic (item 2 da Fase 1 do brief
§12 — importação de plano via texto; também item 4 — narração), decidir
entre (A)/(B)/(C) ou alternativa equivalente. Se a escolha for (A),
implementar **exclusão da chave** do snapshot que vai para o Drive (a
chave nunca pode sair do dispositivo junto com o backup).

**Escolha de modelo (Haiku vs Sonnet vs Opus):** decidir por **acurácia
de estruturação**, não por preço. No volume de uso pessoal (importar
plano raramente + narração em sessões tumultuadas), a diferença de custo
entre os três modelos é da ordem de centavos/mês — irrelevante. O
critério correto é qual modelo erra menos ao estruturar texto livre
contra o schema do app. Decisão pertence ao momento em que a feature
existir e puder ser testada com inputs reais; não escolher por preço
agora.

**Por que não decidir agora:** a feature de IA é item 2 da Fase 1 e
ainda não foi escopada. A decisão BYOK + persistência + modelo é parte
do escopo dessa feature, não da documentação. O importante neste passo
foi **não cravar a arquitetura errada** (variável de ambiente).

---

## §F. Referências cruzadas (brief ↔ DECISIONS)

Os quatro pontos do brief que foram **refinados ou corrigidos** no Passo 7
e que devem ler igual aqui e no brief atualizado:

- **I-11** (uso sequencial single-user, CRDT rejeitado) — DECISIONS §A I-11
  + brief §9 I-11.
- **I-13** (avisa, não bloqueia) — DECISIONS §A I-13 + brief §9 I-13 + §7.2
  + cabeçalho §8.5.
- **I-15** (refino R3: substituto progride a si mesmo) — DECISIONS §A I-15
  + brief §9 I-15.
- **§2 IA (mecanismo de chave)** — variável de ambiente substituída por
  BYOK pendente (AUDITORIA-lacunas L2). DECISIONS §E Dívida 5 + brief §2 +
  README "Conexão com IA".

Se houver divergência entre os dois documentos, o brief é a fonte de verdade
— este documento explica o porquê; o brief crava o quê.
