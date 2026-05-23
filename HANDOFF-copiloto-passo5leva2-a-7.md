# HANDOFF-copiloto — Passo 5 leva 2 → Passo 7

> Terceiro handoff. Continua de onde os dois anteriores pararam (Passo 5
> leva 1 / canário verde nos dois engines). Mesmo espírito: este é
> **memória de raciocínio**, não só de estado. O `git log` conta o que
> ficou em código; este documento conta o que ficou em conversa.

---

## Estado de saída (2026-05-22, 23:48)

- **8 commits**, lineares, sem força-push, sem amend. Top: `7e85dae`.
- **82 testes verdes** (`npm run check` limpo), ~1.7s.
- **Camada de dados FECHADA.** Próximo trabalho é UI + engine real.
- **3 documentos alinhados** (brief, DECISIONS, README) e **5 dívidas
  técnicas** com gatilho nomeado, todas em DECISIONS.md §E.

### Git log (cru, top a fundo):

    7e85dae Passo 7 - brief (6 trechos) + DECISIONS.md (§A-§F) + README
    56612e5 Passo 6 - CI local via husky pre-commit + GitHub Action
    9a41593 Passo 5 leva 2 - 18 arquivos de invariante (33 it()s / 48 invocações)
    a4d9357 Passo 5 leva 1 - adapter wa-sqlite-node + parametrização + canário
    1af2382 Passo 4 - runner de migrations: interface async + adapter + fix
    2f27ee5 Passo 3 - schema inicial: 001_init.sql
    7f7fde7 Passo 2 - enums, tipos brandados, constantes nomeadas
    6eb373a Passo 1 - tooling: TypeScript strict, Vitest 4, smoke test
    693a458 Fase 0 - pasta nua: brief + planos

---

## §1. Passo 5 leva 2 — os 18 arquivos de invariante

### O que foi entregue

- **18 arquivos de teste** em `src/invariants/`: I-01.test.ts a
  I-15.test.ts + `I-10-derived-immutability.test.ts` +
  `quality-dual-role.test.ts` + `check-vs-ts-enum-parity.test.ts`.
- **33 `it()`s** (28 do mapa original + 5 discriminantes), **48
  invocações** quando contadas as parametrizações nos 2 engines (13 DB ×
  2 + 22 puro-TS).
- **Engine stubs** em `src/engine/` — caminho I do Passo 5: cada stub
  implementa **exatamente** a regra do invariante, marcado como STUB
  PROVISÓRIO no docblock. Estrutura:
  - `derivations.ts` — `rsi`, `rsiMod`, `isRecallLate`, `volumeByBlock`.
  - `foster.ts` — `monotony` com piso de SD.
  - `decision/` — `role.ts`, `deload.ts`, `interference.ts`,
    `progression.ts`, `trend.ts`. (Pasta `decision/` é a sentinela
    permanente para o grep de I-9 contra ACWR.)

### A decisão de método que vale mais que os arquivos: pares discriminantes

> Esta é a parte que não aparece no diff e que **muda o jeito de
> escrever testes** daqui pra frente.

O risco real do caminho I (stubs minimalistas) é o stub-constante:
uma função que sempre retorna `false` passa todos os testes negativos
sem provar nada. Se I-4 espera "subjetivo não dispara objetivo →
false", um stub `() => false` passa verde, mas não prova que a engine
**discrimina** subjetivo de instrumentado.

A régua que emergiu da conversa:

> **Todo teste de invariante que espera uma resposta negativa precisa de
> um par positivo no mesmo arquivo — o caso que deve disparar o
> oposto.** Os dois rodam juntos. Se o stub vira constante, par positivo
> e negativo colidem e a suite quebra.

5 invariantes ganharam pares discriminantes (anotados como `#Nb` no
mapa):

- **I-4 (#6b):** série COM instrumentado em queda 50% (60→30cm) dispara
  o ramo objetivo. Sem essa queda, o ramo não dispara.
- **I-5 (#8b):** série SEM `recall_late=true` dispara deload. COM o
  flag na mesma série, filtra e não dispara.
- **I-7 (#12b):** item com séries de **trabalho** no topo do rep_range
  progride. Item idêntico marcado `isWarmup=true` não progride.
- **I-8 (#13b):** input variado tem monotony **menor** que input
  uniforme. (Reflete variância sem amarrar a um número.)
- **I-14 (#21b):** queda real **fora** de deload classifica regressão.
  Mesma queda **dentro** de deload não classifica.

**Princípio que vale registrar:** quando uma régua aparece, ela vale
para o resto do projeto. Os pares discriminantes não são "polish do
Passo 5" — são o jeito de testar engine de decisão quando a engine
real entrar. Os 5 testes puro-TS que hoje rodam contra stubs reganham
peso quando a engine real expandi-los; o desenho do par
positivo/negativo prepara para essa virada.

### O outro desenho importante: o mapa teste → invariante → prova-da-violação

Antes de escrever uma linha de teste, o usuário pediu um **mapa em
tabela** com 4 colunas:

    | # | it() | invariante | como prova a violação | banco / puro-TS |

A coluna 3 não aceitava "verifica que o trigger existe" — exigia
"verifica que a violação é barrada". Cada linha do mapa descreve a
**asserção negativa**: o que o teste tenta fazer de errado, e por que
espera-se que falhe.

Exemplo (I-10): `tenta UPDATE em measurement_source de registro
existente, espera RAISE(ABORT); se passar, falha`.

**Por que isso importa pro futuro:** a auto-auditoria depois do verde
inteiro foi pedir, para cada `it()`, "inverti o oposto e confirmei que
falha? (S/N + como)". Mesma estrutura. Se quiser fazer auto-revisão
honesta de qualquer suíte futura, replicar esta mecânica:

1. Antes de escrever o teste, descrever a violação que ele provoca.
2. Antes de aprovar o verde, inverter mentalmente o mecanismo
   (remover trigger, virar stub em constante, etc.) e confirmar que o
   teste **quebraria**.

Sem isso, "tudo verde" pode esconder "o teste não testa".

### O hash de I-12 — anotação técnica que pode escapar

O teste I-12 (sessão mutável, plano intacto) computa SHA-256 do
estado **completo** (`SELECT *`) de `work_block` e `work_block_item`,
ordenado por `id` (e `planned_sequence`), **antes** da mutação da
sessão e **depois**. Iguais ⇒ plano intacto.

O usuário pegou que minha primeira versão usaria "campos escolhidos a
dedo". Correção: hash sobre o resultado de `SELECT *` literal — qualquer
campo que eu não citasse explicitamente teria escapado. Vale como
princípio: **hash de integridade deve cobrir o estado todo, não a
parte que você lembrou de incluir.**

---

## §2. Passo 6 — CI local via husky

### O que entrou

- **`husky` instalado** como devDependency.
- **`.husky/pre-commit`** roda `npm run check` (typecheck + test) em
  todo commit.
- **`npm run check`** é o script consolidado em `package.json`.
- **`.github/workflows/ci.yml`** roda a mesma suite em PR/push para
  main, como apólice se um dia houver remote.

### O comportamento que importa lembrar

Se o hook **bloqueia** um commit, NÃO é bug — é a rede funcionando.
O README documenta isso explicitamente para o leigo não desligar a
rede achando que está com problema.

**Validação ao vivo:** o hook foi provado no próprio commit do Passo 6
(rodou check antes de aceitar; passou; commit entrou). Sem teatro.

---

## §3. Passo 7 — brief atualizado + DECISIONS.md + README

### Os 6 trechos do brief (o documento-contrato passou a contar a história nova)

O brief original tinha 3 pontos divergentes da implementação real
(I-11/I-13/I-15), mais 1 ponto corrigido tarde (§2 IA / L2), mais 1
contradição estrutural (§8.5 header). Total 6 trechos:

1. **§7.2 (linha 181):** "bloqueia ou avisa" → "avisa (não bloqueia) +
   flag `interference_warned` + metáfora aviso/portão". Razão ligada a
   §6.3 (anti-culpa).
2. **§8.5 cabeçalho (linha 227):** "HARD, determinísticos" →
   "determinísticos — HARD por padrão; ver I-13 para a exceção
   `acute_interference`". (Ver §3.1 abaixo — esse foi caçado.)
3. **§9 I-11 (linha 250):** explicitou "uso sequencial single-user";
   nomeou a decisão A (arquivo-LWW + snapshot + aviso); cravou CRDT
   rejeitado.
4. **§9 I-13 (linha 252):** "bloqueio/aviso" → "aviso estruturado +
   flag interference_warned".
5. **§9 I-15 (linha 254):** adicionou refino R3 (substituto progride a
   si mesmo; I-15 protege só o planejado-não-feito).
6. **§2 IA (linha 55):** "chave gerida pelo ambiente" → "mecanismo de
   chave pendente de decisão (provável BYOK, ver AUDITORIA-lacunas
   L2)". Ver §3.2 abaixo.

### §3.1. A contradição do §8.5 que o usuário caçou

O usuário pediu: "antes de editar, cole a linha 231 da §8 como está
hoje". A linha 231 era `- acute_interference antes de potência →
gate de timing (7.2).` — limpa, não usava "bloqueia". Pelo teste
literal dele ("se usar, entra como 5º trecho"), não precisava de fix.

**Mas o cabeçalho da §8.5 (linha 227) dizia "Gates de segurança
(HARD, determinísticos)" — implicando que TODOS os 4 gates da lista
eram HARD, inclusive o `acute_interference`** que acabamos de virar
"aviso, não bloqueia". Contradição estrutural, embora a linha
explícita do gate fosse inocente.

Eu apontei. O usuário escolheu (β) — entrar como 5º trecho. Redação
escolhida: "determinísticos — HARD por padrão; ver I-13 para a
exceção `acute_interference`". A regra (HARD por padrão) e a única
exceção nomeada, com ponteiro para I-13.

**Lição que vale registrar:** atualizar o corpo do texto e esquecer o
título é o tipo de rachadura que sobrevive a uma revisão apressada. A
busca pela linha 231 verbatim **antes** de editar evitou a tentação
de aprovar sem olhar. Se uma seção tem header que classifica seus
itens, mudar um item exige reler o header.

### §3.2. A correção L2/BYOK (escapou e teve que voltar)

A AUDITORIA-lacunas L2 (externa ao repo, vive com o usuário) já
desmontava a frase do brief §2 "chave gerida pelo ambiente": PWA
sem backend rodando no browser **não tem variável de ambiente de
servidor** onde a chave more. O padrão correto é BYOK — usuário cola
a própria chave.

Eu cometi o erro de copiar essa frase do brief para o README sem
checar. O usuário pegou na revisão do README, notou que a L2 estava
reservada para o Passo 7 e tinha escapado dos refinamentos do brief.

**Como foi resolvido:** pacote completo —
1. brief §2 corrigido (6º trecho);
2. README "Conexão com IA" corrigido;
3. nova **Dívida 5** no DECISIONS.md;
4. §F atualizada de 3 para 4 pontos cruzados brief↔DECISIONS↔README.

**Padrão de raciocínio que sobreviveu:** "rachadura não some, só
muda de lugar". Corrigir só o README deixaria brief vs README como o
novo ponto de fratura. O critério para fechar foi a §F (referências
cruzadas) — se brief, DECISIONS e README citam o mesmo ponto, todos
os três devem dizer a mesma coisa.

### §3.3. As atribuições científicas que o usuário fez recuar

O DECISIONS.md original (rascunho do Passo 7) cravava:

- "Gabbett 2016" como origem do ACWR
- "Behm 2024" como fonte do RSI-mod

O usuário caçou as duas:

- **"Gabbett 2016"**: pode estar certo de memória, mas a auditoria
  só dá Impellizzeri (para a desconstrução). O Claude Code pode ter
  alucinado a atribuição de origem. **Risque o ano-autor** — diga
  "popularizada na literatura de gestão de carga, parcialmente
  desconstruída desde (Impellizzeri et al., ver V1)".
- **"Behm 2024" para RSI-mod**: o Claude Code trocou as bolas. Behm
  2024 é da fundamentação do **gate de interferência** (I-13), não
  do **sensor de fadiga** (RSI-mod). A auditoria atribui RSI-mod a
  **Gathercole et al. 2015** e MyJump a **Bishop et al. 2022** (V2/§10).

**Princípio que ficou explícito:** "documento permanente, atribuição
errada envenena o documento que existe pra ser confiável". Quando o
agente não viu a fonte com seus próprios olhos, **não crava
autor-ano** — usa ponteiro à auditoria (ou ao documento que viu).

Os 4 edits corretivos saíram (correções 1-4 no DECISIONS.md). O
agente confessou na hora que **a AUDITORIA-lacunas não está no repo**
— vive externamente — e portanto não poderia "confirmar contra os
arquivos do projeto" como o usuário pediu. A saída honesta foi
aceitar a correção do usuário como autoritativa e nomear AUDITORIA-
lacunas como ponteiro externo, não como se tivesse verificado.

### §3.4. DECISIONS.md — estrutura final §A–§F

- **§A. Invariantes I-1 a I-15** + I-10-derivado + R1 — uma linha de
  porquê por invariante. Os "porquês" foram destilados de erros
  concretos do projeto, não inventados. **I-1 ancora a régua-mãe nos
  quatro erros nomeados** (VBT, sensor de fadiga, role,
  plano-como-contrato).
- **§B. Decisões arquiteturais (A–I).** sync arquivo-LWW; wa-sqlite +
  OPFS + Drive snapshot; React+Vite; migrations caseiras; Vitest
  parametrizado; function_tag livre; engine híbrida; recall_late 30min
  constante nomeada; backup 30+rotação.
- **§C. Decisões de modelagem (D1–D7).** session_set polimórfico +
  progression_type desnormalizado; jump_test separado;
  attached_routine_id; plan_phase; body_weight_log; timestamps INTEGER;
  booleans 0/1.
- **§D. Decisões de processo.** Caminho I (stubs); fonte única de
  verdade por regra (a melhor síntese do projeto, na minha opinião:
  "se eu mudar essa regra, em quantos lugares preciso editar? Resposta
  deve ser **um**"); anti-over-engineering.
- **§E. 5 dívidas técnicas com gatilho nomeado** (resumidas em §4
  abaixo).
- **§F. Referências cruzadas brief↔DECISIONS** — 4 pontos refinados/
  corrigidos no Passo 7. **Defesa estrutural contra fonte rachada.**

### O README operacional — escrito para leigo, não para engenheiro

Duas exigências que o usuário cravou:

1. Seções de **"como rodar teste de salto"** e **"como o backup
   funciona"** em linguagem que o leigo executa sem ler código —
   passos numerados, sem jargão. Mesmo essas features não existindo
   ainda (UI futura), o README descreve o que **vai** ser, para o
   futuro-usuário lembrar.
2. **"Como adicionar nova migration"** com aviso **⛔ destrutiva**
   prominente, citando Dívida 1 e **F1 da AUDITORIA-lacunas** por
   nome. O futuro-você criando migration 002 bate no aviso ANTES de
   destruir dados.

---

## §4. As 5 dívidas técnicas com gatilho — leitura rápida

Cada uma tem condição de revisão que dispara sozinha quando o momento
chega. **Antes de mexer no item da Fase 1 listado, leia a dívida.**

| # | Dívida | Gatilho |
|---|---|---|
| 1 | wa-sqlite npm 1.0.0 × GitHub v1.1.1 (bugfixes WAL/OPFS) | **antes** do primeiro empacotamento que persista OPFS no celular |
| 2 | Baseline circular + 4 constantes de deload (`OBJECTIVE_DELOAD_JUMP_DROP_PCT`, `LOAD_DROP_THRESHOLD_PCT`, `CONSECUTIVE_LOAD_DROP_DAYS_FOR_DELOAD`, `TREND_REGRESSION_THRESHOLD_PCT`) | **antes** de construir engine de deload/trend real (item 6 da Fase 1) |
| 3 | Mitigação de eviction iOS (`navigator.storage.persist()` + auto-backup ao fim de sessão) | **antes** do primeiro deploy PWA no celular |
| 4 | `pain_log.location` string livre vs convenção canônica | **antes** de implementar o gate de dor patelar (separado de I-13) |
| 5 | BYOK da API Anthropic (A/B/C onde a chave persiste; escolha de modelo por acurácia, não preço) | **antes** de implementar IA (itens 2 e 4 da Fase 1) |

Repare como os gatilhos mapeiam exatamente para os itens 2-7 da Fase
1 do brief §12. Não é coincidência — cada dívida foi nomeada pensando
no momento natural em que o problema vira real.

---

## §5. Estado das memórias do agente (persistem entre sessões)

Em `.claude/projects/.../memory/` (gitignored), 4 arquivos:

- **`user-leigo-manutencao-ia`** — usuário se declara leigo,
  dependência de IA para manutenção; manutenibilidade vence
  elegância.
- **`feedback-anti-overengineering`** — CRDT/HLC/oplog rejeitados;
  princípio "não importar padrões de SaaS para app single-user".
- **`feedback-single-source-of-truth`** — não duplicar regra entre
  schema e TS; cada regra escolhe sua casa.
- **`project-treino-app`** — contexto do projeto, stack fechada,
  refinamentos do brief, estado dos passos, dispositivo alvo
  (iPhone 15), eviction L3 com mitigação obrigatória, gatilhos das
  dívidas mapeados aos itens 2-7 da Fase 1.

**Para a próxima sessão:** essas memórias carregam automaticamente.
Não precisa repetir contexto fundamental. Sessão nova pode começar
direto de "ok, item N da Fase 1".

---

## §6. A virada de fase — o que muda daqui pra frente

Os Passos 1-7 foram a camada de dados. Próximo trabalho é **UI +
engine real** (itens 2-7 da Fase 1). Três coisas mudam:

### 6.1. Natureza da revisão muda

Até aqui a revisão foi *"esse invariante está bem traduzido contra o
brief?"* — alinhamento estrutural. Daqui pra frente a revisão vira
*"essa decisão de produto está certa?"* — UX, fluxo, fricção, escolhas
que o brief não pode cravar antecipadamente.

O usuário sinalizou que tem opinião forte sobre fricção (RepCount,
§6 do brief, anti-culpa). Trazer cada feature de UI **com o teste de
fricção explícito**: "essa tela adiciona quantos toques? Quantos
trocam um treino real?"

### 6.2. Stubs viram engine

Os 9 stubs de engine (`derivations.ts`, `foster.ts`, `decision/*`)
foram desenhados para **expandir**, não substituir. Quando a engine
real entrar no item 6, ela **cresce** a partir desses arquivos. Os
testes puro-TS que hoje validam a regra mínima passam a validar
regressão da engine inteira.

Especialmente:
- `engine/decision/deload.ts` — Dívida 2 dispara aqui. Baseline
  circular e 4 constantes precisam ser revistas com fundamento.
- `engine/decision/trend.ts` — mesmo gatilho.
- `engine/decision/role.ts` — provavelmente o primeiro a expandir
  (mapa role inteiro da Seção 8.1 do brief).

### 6.3. Auditoria-lacunas sai do papel

L1 (calibração de monotony / dias de descanso) e L4 (timezone) são as
duas que **mordem cedo** na engine real e escapam fácil porque
parecem detalhe técnico. Quando a engine começar, elas entram como
decisão explícita com teste — mesma régua dos invariantes I-1 a I-15:
violação detectável, par discriminante onde fizer sentido, atribuição
científica conferida contra o documento (não memória).

L2, L3 e F1 já estão em dívidas registradas com gatilho. L1 e L4
serão registradas quando a engine real começar (não antecipar — a
dívida sem gatilho é dívida esquecida).

---

## §7. Notas de processo do trabalho dos Passos 5b-7

Coisas que valem registrar do **como** trabalhamos, não do quê:

### 7.1. Pacotes em vez de commits granulares no Passo 7

O Passo 7 mudou 3 arquivos (brief, DECISIONS, README) que **citam um
ao outro**. Commitar separados criaria janelas onde brief diz X mas
DECISIONS diz Y — exatamente o tipo de fonte rachada que estamos
caçando. Decisão: **um único commit do Passo 7**, com mensagem
descritiva listando o que entrou.

Custo: o usuário não viu `git diff` consolidado dos três como bloco
final; viu cada peça crua em rodadas anteriores. Risco residual
mitigado por `npm run check` verde + greps por strings sensíveis. O
usuário aceitou esse risco explicitamente — "revisei em camadas, não
num bloco só".

### 7.2. O agente paginar diff longo é OK; perder fidelidade não

Em algum ponto eu mostrei um `git diff` longo e o usuário não enxergou
hunks por causa de wrap. Solução: **repaginei por hunks etiquetados**
(Hunk 1 = §7.2; Hunk 2 = §8.5 cabeçalho; Hunk 3 = §9 I-11/I-13/I-15).
Mesmo conteúdo, formatação mais clara. Nunca cortar conteúdo para
caber melhor — só reorganizar.

### 7.3. Quando o agente comete erro, ele admite com diagnóstico

Dois exemplos no Passo 7:
- Atribuição "Gabbett 2016" / "Behm 2024" — eu cravei autor-ano de
  memória, usuário pegou. Confissão honesta: "Não tenho a auditoria-
  lacunas no repo, não posso confirmar contra os arquivos do projeto.
  Aceito sua correção como autoritativa."
- Copiei "ANTHROPIC_API_KEY" do brief §2 sem checar a L2. Usuário
  pegou no README. Reconhecimento: "O Claude Code não inventou, mas
  copiou fielmente o brief §2 que continua errado. A L2 escapou
  quando atualizamos os 3 refinamentos."

Nos dois casos, o caminho de saída foi nomear o erro, propor o fix,
e perguntar se quer pacote completo (incluindo correções cascateadas
em outros arquivos) antes de executar. **Não tentar minimizar.**

---

## §8. Próxima sessão começa onde

Estado limpo. Para retomar:

1. Verificar `git log` (8 commits, top `7e85dae`).
2. Verificar `npm run check` (esperado: 82 verde, typecheck 0 erros).
3. Ler `DECISIONS.md` §E (as 5 dívidas) para mapear o item da Fase 1
   contra o gatilho correspondente.
4. Confirmar o item da Fase 1 a executar — itens 2 a 7 do brief §12.

**Itens 2-7 da Fase 1, em ordem do brief:**

2. **Importação de plano por texto** (IA) → Dívida 5 dispara.
3. **Registro de sessão ao vivo** com pré-preenchimento + maleabilidade
   (§6 inteiro). Provavelmente o item de maior impacto na UX.
4. **Narração + parsing** (IA) → Dívida 5 já decidida no item 2.
5. **Estatísticas v1** — 4 estatísticas que decidem ação (brief §10.3).
6. **Engine de progressão + deload** → Dívida 2 dispara. Maior
   trabalho técnico.
7. **Sync Drive + backup + notificações mínimas** → Dívidas 1 e 3
   disparam.

Recomendação subjetiva (não cravada): item 3 antes do 2/4. Sem
registro de sessão ao vivo, não há sentido em importar plano. Mas é
escolha do usuário — e ele tem critério para isso.

---

> **Quem está lendo isto:** se você é o futuro-eu (humano ou IA), o
> trabalho mais importante antes de continuar é **não tratar os 8
> commits como caixa-preta**. Leia o brief, depois o DECISIONS.md
> §A-§F, depois este handoff. O código fica claro a partir daí. O
> caminho inverso (código primeiro) faz você refazer raciocínios já
> resolvidos.
