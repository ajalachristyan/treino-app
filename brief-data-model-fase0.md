# Brief de Implementação — Software de Treino Pessoal (Fase 0 + Fase 1)

> **Para o Claude Code.** Este documento é o **contrato** e a **memória de raciocínio** do projeto. Foi destilado de uma análise longa onde cada decisão derrubou uma anterior por um motivo nomeado. Leia a Seção 1 (filosofia) antes de qualquer linha de código — sem ela, você vai reconstruir os erros que já corrigimos, porque vários invariantes parecem inconvenientes ou redundantes até você entender o que cada um previne.
>
> **Regra de ouro:** os invariantes da Seção 9 não são negociáveis. Se um deles parecer chato de implementar, isso não é licença para relaxá-lo — é o sinal para escrever o teste que o trava. Onde houver decisão de implementação **não** fixada aqui, escolha o caminho mais simples que não viole nenhum invariante e justifique em comentário.

---

## 1. Filosofia do projeto — leia primeiro

### 1.1 O sistema, em uma frase

App pessoal (**um único usuário**) para registrar treino de força/potência/salto/ginástica/flexibilidade, calcular estatísticas e progressões, gerir recuperação e medir progresso rumo a um objetivo de salto vertical. Construído no PC, **usado no celular**, na academia, frequentemente offline. Não é produto comercial: sem contas, sem multiusuário, sem nuvem própria, sem telemetria.

### 1.2 O princípio-mãe: observação ≠ interpretação

Toda a arquitetura existe para honrar uma distinção única:

> **O registro guarda apenas o que foi observado. A interpretação mora na engine. Nunca grave no dado uma decisão que pertence à lógica.**

Este princípio foi descoberto da forma mais cara possível: o projeto repetiu o **mesmo erro estrutural quatro vezes** em camadas diferentes, e só o nomeou na quarta. O erro é sempre *confundir output com sinal*, ou *gravar interpretação como se fosse fato*. As quatro encarnações:

1. **Métrica de velocidade (VBT):** a tentação era exigir velocidade medida em todo exercício. Correção: velocidade é dado *instrumentado* só em compostos explosivos; fora disso, é um sinal subjetivo. Não confundir os dois.
2. **Sensor de fadiga (eixo 3):** a tentação era usar *altura do salto* como sensor de fadiga. Mas altura é **output** — sob fadiga, o corpo preserva a altura reorganizando a estratégia. O sinal de fadiga é o **RSI-mod** (altura ÷ tempo até decolagem), que carrega os dois componentes. Output ≠ sinal.
3. **`role` como coluna:** a tentação era gravar no registro do teste se uma métrica é "KPI" ou "sensor". Mas papel não é propriedade do dado — é como a engine *lê* o dado. A mesma altura é KPI para uma regra e contexto para outra. Gravar o papel congela uma interpretação no fato.
4. **Plano como contrato:** a tentação (e o erro do RepCount) era tratar o plano de treino como estrutura imutável que a sessão apenas "preenche". Mas o plano é **intenção** e a sessão é **observação** — a academia lotada vence o plano toda vez. A sessão tem que ser totalmente maleável; o plano só a semeia.

**A régua que decide tudo — invariância sob releitura:**

> Se o valor pode mudar de significado sem que a observação mude, **não é coluna** (é relação, vive na engine). Se o valor nasce fixo e nenhuma regra futura o reclassifica, **é coluna** (é fato, vai no registro).

Exemplos resolvidos por essa régua: `measurement_source` é imutável (um dado nasce instrumentado ou subjetivo e morre assim) → **coluna**. `role` varia com quem lê → **engine**. Aplique esta régua a qualquer campo novo que você for tentado a adicionar.

### 1.3 A fricção que o app existe para matar

O usuário abandonou o app anterior (RepCount) por um motivo específico e diagnosticado: o RepCount **pré-preenchia** a sessão (acertou nisso), mas tratava a lista de exercícios como **rígida** — reordenar era difícil, adicionar exercício na hora era quase impossível. A dor não era *registrar*; era *a inflexibilidade quando a vida real diverge do plano*. A cura é a Seção 6 (sessão maleável). Se você construir uma sessão read-only sobre o plano, você reconstruiu o RepCount e o projeto falhou.

### 1.4 Maleabilidade na estrutura, rigor no dado

O lema operacional que reconcilia flexibilidade com estatística confiável:

> O usuário mexe em tudo livremente (ordem, composição, substituição, adição). O app nunca relaxa o registro de **o que** mudou e **por quê**. A flexibilidade é do usuário; a contabilidade é do app.

É *por causa* da contabilidade rigorosa que a flexibilidade é segura: um desvio registrado vira contexto para a estatística ("o volume caiu porque a barra estava ocupada", não "ficou mais fraco"), em vez de virar lixo.

---

## 2. Stack (fixada)

- **PWA local-first**, instalável, **offline-first** (uso em academia sem rede é o caso normal, não a exceção).
- **Persistência: SQLite no browser** (sql.js / wa-sqlite ou equivalente), com **migrations versionadas** como artefato de primeira classe no repositório. O SQLite é escolhido deliberadamente sobre IndexedDB puro: nosso modelo vive de invariantes e de derivados com fórmula fechada (Foster, RSI), e queremos as estatísticas como *queries*, não como loops à mão, além do versionamento de schema que as migrations dão.
- **TypeScript.** Os enums deste brief são **tipos checados**, não strings livres.
- **Sync: por arquivo no Google Drive** (o usuário já tem o conector ativo). O app lê/escreve o arquivo de banco (ou um export) no Drive. **Avalie se a API do Drive comporta esse padrão de forma confiável**; se não, **caia para export/import manual por botão** — fallback já autorizado. Não introduza backend próprio nem serviço de sync de terceiros sem perguntar.
- **NÃO** usar `localStorage`/`sessionStorage` para dados de domínio.
- **IA (parsing e geração):** chamadas à API da Anthropic (endpoint de mensagens) para (a) importar plano a partir de texto livre e (b) estruturar narração pós-treino. A chave é gerida pelo ambiente; não embutir no código.

---

## 3. Arquitetura conceitual — as quatro entidades

Há uma separação fundamental entre **o que se pretende** e **o que aconteceu**, e entre **o catálogo** e **o evento**:

- **`exercise`** — o catálogo. A identidade de um movimento (back squat, couch stretch ativo, depth jump). Reutilizável. Carrega o *tipo* de progressão, não os números.
- **`plan` / `work_block` / `routine`** — a **intenção**. A periodização de 18 semanas, os blocos por dia, as rotinas anexáveis. Editável, mas é "o que pretendo fazer".
- **`session`** — a **observação**. O que de fato aconteceu numa ida à academia. Semeada pelo plano, mas totalmente maleável. É o fato.
- **`engine`** — a **interpretação**. Lê catálogo + intenção + observação e produz progressões, estatísticas, gatilhos de deload, sugestões de substituição. **Nenhuma interpretação é persistida como dado** (princípio-mãe).

---

## 4. Eixo 1 — Progressão (o que melhora e como se mede)

### 4.1 `progression_type` (enum, cidadão de primeira classe)

A unidade de prescrição **não** é "exercício com carga × reps". `load_reps` é apenas um dos tipos. Este enum é a peça que permite força, salto, plio, calistenia, ginástica e flexibilidade coexistirem no mesmo modelo sem exceções:

| Valor | Modalidade típica | O que mede |
|---|---|---|
| `load_reps` | barra/halter | carga × reps |
| `isometric_intent` | inamovível balístico | pico de força / intenção no ângulo |
| `contact_quality` | drop landing / plio sem instrumento | qualidade da aterrissagem (escala subjetiva) |
| `contact_time` | bounce / depth jump | ms de contato — **só via teste instrumentado** (ver I-6) |
| `jump_height` | approach / CMJ / e qualquer distância que melhora (ex.: quadril-chão no espacato) | cm |
| `difficulty_tier` | calistenia, core, flexibilidade em escada | progressão/regressão de dificuldade (degraus) |
| `assisted_load` | negativos / assistido | assistência em −kg |
| `skill_acquisition` | ginástica/acrobacia | domina (sim/não), tempo de hold |
| `time_under_tension` | tendão / isometria sustentada / holds de mobilidade | segundos sob tensão |

> **Nota de design:** não crie um tipo ou eixo separado para "mobilidade" ou "flexibilidade". Seria o erro de modelar a *taxonomia* (interpretação) em vez da *observação*. Flexibilidade são os mesmos tipos acima (`time_under_tension`, `difficulty_tier`, `jump_height` como distância) com **critério de progressão e regra de timing próprios** (Seção 7).

### 4.2 `exercise` (catálogo)

- `name`
- `progression_type` (enum acima)
- `priority: enum { primary, accessory, finisher, bonus }` — sem isto, a média de volume conta finalizador como primário, e o aviso de desvio (Seção 6.4) trata tudo igual.
- `load_type: enum { barbell, dumbbell, band, bodyweight, assisted, box_height }`
- `rep_range: { min, max }` — necessário para a dupla progressão funcionar.
- `acute_interference: boolean` — marca exercícios cuja execução longa imediatamente antes de sessão de potência causa déficit agudo de força (ver gate I-13 e Seção 7.2). Ex.: holds estáticos > 60s.
- `function_tag` — para a engine de substituição operar **por função, não por músculo** (ex.: "tripla extensão explosiva", "sóleo", "flexão de ombro overhead"). É o que permite "RDL *ou* Nordic" e a sugestão de troca quando o aparelho está ocupado.

### 4.3 `work_block` (unidade de prescrição dentro do plano)

- `ordered: boolean` — `true` para complexos/PAP onde a ordem e o descanso interno são o estímulo (Sáb: iso → salto → Zercher; Mês 3: squat 2×2 → 3-4 min → depth jumps). Sequência tratada como **unidade**.
- `internal_rest_s: number`
- `attachable / recurring: boolean` — `true` para rotinas que **grudam no fim de outras sessões** em vez de serem um dia autônomo (ver Seção 7.1, a rotina de flexibilidade de 8-12 min anexada a Ter/Qui/Sex). A mesma rotina anexada a três dias é **uma** rotina referenciada três vezes, não três cópias.
- `items[]` — exercícios na ordem planejada; cada item carrega seu próprio `progression_type` (herdado do catálogo).

---

## 5. Eixo 2 — Carga interna (quanto a sessão custou; método de Foster)

### 5.1 `session_load`

`sRPE (CR10, 0–10) × duração_min` → unidades arbitrárias (UA).

- **Modalidade-agnóstico.** É a moeda única entre força, salto, ginástica e flexibilidade. Por isso a **ginástica/acrobacia reportam carga com UM número** (RPE × min) mesmo tendo a UI de progressão diferida — a carga delas é input obrigatório do teto de recuperação que o usuário nomeou como o limite real de tudo.
- Coleta do RPE: ~15–30 min pós-sessão. Veja I-5 (timestamp + `recall_late`).

### 5.2 Derivados (fórmula fechada — implemente a publicada, não invente)

- `monotony` = média diária ÷ desvio-padrão da carga (janela 7d). **Aplicar piso mínimo de SD** (I-8) — sem ele, treino uniforme zera o denominador e explode o strain.
- `strain` = carga semanal × monotony.
- `acute_load` (média 7d) e `chronic_load` (média 28d): **consciência opcional de pico, sem peso decisório** (I-9). Não codifique nada que finja prever lesão — a razão aguda:crônica não é preditor causal validado.

---

## 6. Eixo 3 — Sessão real e maleabilidade (a camada que separa intenção de observação)

Esta é a camada onde o RepCount falhou. Leia 1.3 e 1.4 antes.

### 6.1 `session` é uma lista mutável, NÃO uma cópia read-only do plano

Ao iniciar o treino, o app **semeia** a sessão a partir do `work_block` do dia, **pré-preenchendo cada exercício com os valores da última execução** (a memória de carga que o usuário precisa). A partir daí, durante a execução, a sessão é **totalmente editável** sem sair do modo treino:

- **Adicionar exercício na hora** — botão "+" sempre visível. Busca na biblioteca; se não existir, cria com o mínimo (nome + `progression_type`). Entra com status `added_adhoc` (volume extra, não planejado).
- **Remover / pular** — status `skipped`. Evapora sem cobrança (ver 6.3).
- **Reordenar** — arrastar, ou simplesmente registrar fora de ordem. A **ordem realizada** é um campo de sequência no log, independente da ordem do plano.
- **Substituir** — toque longo → "substituir" → engine sugere por `function_tag`, ou o usuário escolhe livremente. Status `substituted` + `substitution_reason`.

Este é o **invariante I-12**. Se a sessão for read-only sobre o plano, o projeto falhou.

### 6.2 Status e proveniência de cada item

Cada item de sessão carrega:

- `status: enum { done, skipped, substituted, reordered, deferred, added_adhoc }`
- `actual_sequence: number` — ordem real de execução.
- `substitution_reason: enum { equipment_busy, injury_avoidance, user_choice, engine_suggested }` — **protege o sinal**: uma troca por barra ocupada NÃO deve ensinar à engine uma preferência de exercício. Mesma lógica do `measurement_source`.
- `data_origin: enum { live, narrated }` — registro ao vivo vs. narração estruturada por IA depois. Dado `narrated` carrega **menor confiança** para carga (risco de recall), análogo ao `recall_late`. Ao vivo é o padrão; narração é atalho.

### 6.3 Evaporar com registro — NÃO perseguir

Exercício planejado e não feito (`skipped` ou `deferred`) **evapora**: não vira pendência, não gera fila, não cobra. A pendência gera culpa, e culpa é o que faz o usuário abandonar o app (foi o destino do app anterior). MAS o desvio é **registrado** com seu motivo, para a estatística saber *por que* o volume daquele bloco caiu. Evaporar para o usuário; registrar para a engine.

### 6.4 Exceção do primário

Se o exercício pulado for `priority = primary` (o motor do bloco, ex.: agachamento), o app pode **avisar uma vez** na próxima sessão ("seu primário do bloco não roda desde X") — não como pendência que persegue, mas como consciência. `accessory`, `finisher` e `bonus` evaporam silenciosamente. Respeita a hierarquia de `priority`.

### 6.5 Entrada por narração (atalho de menor confiança)

Para o dia tumultuado demais para tocar no celular, o usuário escreve/dita texto livre ("troquei agachamento por leg press, pulei o clean pull") e a IA (API Anthropic) estrutura para o schema: marca `substituted` / `skipped`, infere `substitution_reason: user_choice`, e grava `data_origin: narrated`. **A narração nunca dispara progressão do exercício planejado** que não foi feito.

### 6.6 Desvio nunca polui a progressão

A regra "topo do rep_range em todas as séries → +carga" só dispara para itens `status = done` **do exercício planejado**. Um `substituted` (leg press no lugar do agachamento) **não** progride o agachamento. O status do item é o que blinda a engine de aprender lixo.

---

## 7. Rotinas, timing e flexibilidade

### 7.1 Rotina anexável ≠ dia de treino

A rotina de flexibilidade do usuário é uma **dose-base anexa**: 8-12 min **no fim** de Ter/Qui/Sex, mais uma sessão maior sozinha no Domingo. No app:

- Ter/Qui/Sex: ao fechar a sessão principal (Força/Salto), aparece um bloco curto **"Mobilidade — 10 min"** logo abaixo, como apêndice da mesma ida à academia (`attachable = true`). Faz ou pula; leve.
- Domingo: a Flexibilidade aparece como **sessão principal** do dia.

Separação correta: flexibilidade e força são **atividades** e **placares** separados (a evolução da ponte não se mistura com a do agachamento), mas frequentemente **no mesmo dia**, uma após a outra. O app não obriga a abrir duas coisas.

### 7.2 Gate de timing — `acute_interference` (invariante I-13)

O plano do usuário crava: hold estático longo (>60s) imediatamente antes de ginástica ou salto causa déficit agudo de força. Exercícios com `acute_interference = true` agendados antes de sessão de potência → a engine **bloqueia ou avisa**. É um gate de segurança análogo ao da dor patelar. (Fundamentação fornecida pelo usuário: Behm/Warneke 2024 — déficit relevante só >60s em força máxima isolada; saltos/RFD poupados.)

### 7.3 Ramo de progressão por consistência

Flexibilidade e core progridem por **frequência/consistência**, não por carga, e a falha de progresso responde com **mais exposição**, não mais intensidade. Critério do usuário: "sustenta no tempo, RPE ≤5, sem compensação, em 2 sessões consecutivas → sobe o degrau"; "estagnou 3 semanas → mais frequência, NUNCA mais intensidade/dor". A engine precisa deste ramo para `time_under_tension` e `difficulty_tier` de flexibilidade — senão sugere "aumente a carga" onde o certo é "apareça mais vezes".

### 7.4 Qualidade por série como sinal de regressão

Campo de qualidade por série/hold: `enum { stable, tremor, joint_pain }`. A engine lê `tremor` como "não progrida o degrau" (encurtar alavanca, não grindar) e `joint_pain` como flag de cautela (dor articular, não muscular → sugerir avaliação). Mesma mecânica do gate de dor patelar, outro contexto.

---

## 8. Engine de regras

### 8.1 Mapa `role` (vive na ENGINE, NUNCA no registro — I-2)

`role` é predicado da engine sobre a métrica, resolvido por **métrica × bloco**. A mesma observação (altura) é lida com papéis diferentes por regras diferentes. **Não existe coluna `role`.**

| Métrica (derivada na leitura) | Papel | Quando |
|---|---|---|
| `rsi_mod` = height ÷ time_to_takeoff (CMJ, SSC lento) | `fatigue_sensor` | sempre |
| `rsi` = height ÷ contact_time (drop jump, SSC rápido, <250ms) | `kpi_reactive` | bloco Mês 3 (peaking) |
| `height` | `kpi_performance` (lagging) | sempre, como KPI/contexto |

### 8.2 Progressão (por `progression_type`)

- `load_reps`: topo do `rep_range` em **todas** as séries `done` → +2,5–5 kg.
- `contact_time`: ms estagnado ou subindo → **não** progride altura/intensidade.
- `jump_height`: avaliar **tendência por bloco**, padronizada (descansado, pós-deload) — **nunca** dia a dia.
- `difficulty_tier`: domina N reps limpas / hold estável → próximo degrau.
- `skill_acquisition`: domina (sim/não); não forçar por reps.
- `time_under_tension` / flexibilidade: ramo de consistência (7.3).

### 8.3 Deload (dois gatilhos) e anti-poluição

- **Agendado:** semanas 6, 10, 18 do plano. A engine reduz metas automaticamente.
- **Reativo:** ≥2 sessões de queda de carga, OU queda de `rsi_mod` vs baseline acima do limiar, OU `soreness_energy` ≤ 2 por ≥2 dias → **sugere** antecipar alívio.
- **Só dados `instrumented` disparam o ramo objetivo** (I-4). `soreness_energy` é subjetivo e entra só no seu próprio ramo.
- **I-14 (anti-poluição):** semana marcada como deload **nunca conta como regressão** na tendência. Carga menor em deload é *plano*, não fraqueza. Esta é uma das coisas que a engine erra por padrão — trave com teste.

### 8.4 Pivô de ênfase (força relativa = agachamento ÷ peso corporal)

- `< 1,5` → ênfase força (estado atual, ~1,0).
- `1,5–2,0` → transição; enviesa conversão (potência/RFD).
- `> 2,0` → inverte para potência/reativo; força só se mantém.

### 8.5 Gates de segurança (HARD, determinísticos)

- dor patelar > 2–3/10 → **bloqueia depth jump**; revisar.
- regressão de salto **sustentada entre ciclos** (≠ queda transitória pré-deload, que é normal) → overreaching.
- `acute_interference` antes de potência → gate de timing (7.2).
- `joint_pain` recorrente → flag de cautela (7.4).

---

## 9. INVARIANTES — implementar como asserções testáveis

> Para **cada** invariante, escreva um teste automatizado que falha se ele for violado. Estes testes são o coração da entrega e rodam no CI antes de qualquer commit que toque schema ou engine.

- **I-1 — Observação ≠ interpretação.** Nenhuma tabela de registro grava papel/significado. Registro guarda só o observado.
- **I-2 — `role` nunca persiste.** Não existe coluna `role` em tabela de dado. *Teste:* schema não contém `role`; a mesma `height` retorna papéis diferentes conforme o bloco.
- **I-3 — Teste de salto grava observação pura.** Campos: `height, time_to_takeoff, contact_time, jump_type, measurement_source, timestamp`. RSI/RSI-mod **não** são colunas; derivam na leitura.
- **I-4 — Só `instrumented` dispara gatilho objetivo.** *Teste:* série só de dados subjetivos nunca dispara o ramo objetivo de deload.
- **I-5 — sRPE carimbado + `recall_late`.** Todo `session_load` tem `timestamp_server`. Fora da janela → `recall_late = true`. *Teste:* entrada `recall_late = true` é **excluída de gatilho** de forma determinística (não "menos confiável" — excluída).
- **I-6 — `contact_time`/RSI é derivado de teste periódico, não campo por-sessão.** Fora do teste MyJump, bounce/depth jump degradam para `contact_quality` subjetivo. *Teste:* não há `contact_time` instrumentado fora de um `jump_test`.
- **I-7 — Aquecimento fora do log de progressão.** *Teste:* itens de aquecimento não entram em cálculo de progressão/volume.
- **I-8 — Piso de SD na monotony.** *Teste:* carga perfeitamente uniforme não produz monotony infinita/explosiva.
- **I-9 — ACWR sem peso decisório.** *Teste:* nenhuma decisão da engine depende da razão aguda:crônica.
- **I-10 — `measurement_source` imutável.** *Teste:* mutação de `measurement_source` em registro existente falha.
- **I-11 — Sync last-write-wins por `timestamp_server`.** Conflito de dois dispositivos resolve por timestamp do servidor, nunca merge ingênuo. *Teste:* dois writes concorrentes convergem para o de timestamp maior; nenhum dado é perdido silenciosamente.
- **I-12 — Sessão é lista mutável, não cópia read-only.** *Teste:* durante a sessão é possível adicionar (`added_adhoc`), remover, reordenar (`actual_sequence`) e substituir, e o plano original permanece intacto.
- **I-13 — Gate de timing `acute_interference`.** *Teste:* exercício com `acute_interference = true` agendado antes de sessão de potência dispara bloqueio/aviso.
- **I-14 — Deload não é regressão.** *Teste:* semana marcada como deload é excluída do cálculo de tendência de performance.
- **I-15 — Desvio não progride o planejado.** *Teste:* item `substituted` ou `skipped` nunca dispara a progressão do exercício originalmente planejado.

---

## 10. Importação, edição, estatísticas, backup

### 10.1 Importar plano via texto (Fase 1 — sem isto, o app nasce vazio e inabastecível)

O usuário tem três documentos (plano de força/salto de 18 semanas, plano de flexibilidade, e logs de sessão). O app precisa de uma função que **recebe texto livre** (colar/upload) e usa a IA para estruturá-lo em `exercise` + `plan` + `work_block` + `routine`. Sem isto, abastecer o app exige digitar exercício por exercício. **Prioridade alta da Fase 1.**

### 10.2 Tela de edição de plano (separada da sessão ao vivo)

Distinga duas coisas:
- *Atualizar carga* (subiu para 102,5) → automático ao registrar.
- *Mudar o plano* (trocar exercício do bloco de vez, ajustar periodização, adicionar exercício permanente) → **tela de edição de plano**, separada do modo treino. Sem ela, o plano congela no que foi importado.

### 10.3 Estatísticas v1 — enxutas, orientadas a ação

Comece com 3-4 que **decidem ação**, não um painel inflado (excesso de gráfico é ruído como excesso de notificação):
1. Tendência de carga do exercício `primary` (sobe / estagnou / desce).
2. Salto do MyJump (placar-mãe, por bloco).
3. Sinal de fadiga (carga interna acumulada + monotony).
4. Recordes por exercício.

Volume por grupo muscular e demais gráficos entram depois.

### 10.4 Notificações — mínimas (decisão do usuário)

Apenas duas:
1. Lembrete do **teste de salto** no início de cada bloco.
2. Aviso de **deload reativo** quando os sinais acumularem.

Sem lembrete diário de treino nem de nutrição — vira ruído e leva ao abandono.

### 10.5 Backup versionado (não-negociável)

Sync por arquivo + last-write-wins resolve dois dispositivos, mas **não** resolve corrupção/exclusão acidental — risco de perder meses de histórico. O app guarda as **últimas N versões** do arquivo no Drive (não sobrescrita cega), permitindo voltar.

---

## 11. Entregáveis de documentação

- **`DECISIONS.md`** — registre o **porquê** de cada invariante, não só o quê. Use a Seção 1 e as justificativas deste brief como base. É o guia real: daqui a meses, impede que alguém (humano ou outro modelo) "conserte" um invariante achando que é arbitrário e quebre tudo. Para cada invariante I-1 a I-15, uma linha de motivo.
- **`README` de operação** — curto: como importar o plano, como editar, como rodar o teste de salto, como o backup funciona.

---

## 12. Escopo e ordem de construção

**Fase 0 — modelar JÁ (estrutural, caro de retrofitar):** os 3 eixos; `progression_type` (enum completo); `exercise` com `priority`/`load_type`/`rep_range`/`acute_interference`/`function_tag`; `work_block` (`ordered`/`internal_rest`/`attachable`); `session` mutável com status/`actual_sequence`/`substitution_reason`/`data_origin`; `session_load` (Foster); `measurement_source`; mapa `role` na engine; resolução de conflito de sync; backup versionado.

**Fase 1 — construir, nesta ordem:**
1. Schema + migrations + **suite de testes de invariante (Seção 9)**. Nada de UI antes disto.
2. Importação de plano via texto (10.1).
3. Registro de sessão ao vivo, com pré-preenchimento e maleabilidade total (Seção 6).
4. Narração + parsing (6.5).
5. Estatísticas v1 (10.3).
6. Engine de progressão + deload (Seção 8).
7. Sync Drive + backup + notificações mínimas.

**Diferido (capturado na carga, UI de progressão depois):** UI de progressão de ginástica/calistenia. O enum já aceita `skill_acquisition`/`difficulty_tier` e a carga já é capturada via `session_load` — não é stub, é capturado no Eixo 2 e diferido no Eixo 1.

> **Se em algum momento a UI parecer pedir para gravar uma interpretação no dado (um papel, uma classificação que depende de quem lê), pare e aplique a régua de 1.2.** É o erro que perseguiu este projeto inteiro. Quando em dúvida, a observação vai no registro e a interpretação vai na engine.
