# treino-app — README operacional

App pessoal de treino. PWA local-first, single-user, offline-first. Construído
no PC, usado no celular (iPhone 15 / iOS), frequentemente offline na academia.

> **Antes de mexer em qualquer código**, leia nesta ordem:
> 1. [`brief-data-model-fase0.md`](./brief-data-model-fase0.md) — o
>    **contrato** e a filosofia. Decisões aparentemente arbitrárias têm
>    fundamento aqui.
> 2. [`DECISIONS.md`](./DECISIONS.md) — o **porquê** de cada decisão
>    arquitetural, refinamentos do brief, e as 4 **dívidas técnicas com
>    gatilho nomeado** (releitura obrigatória quando o gatilho dispara).
>
> O brief é a fonte de verdade. O DECISIONS.md explica o porquê. Este README
> só ensina a operar.

---

## Pré-requisitos

- **Node 24** (LTS recente — usei 24.15 no desenvolvimento)
- **npm 11+** (vem com Node 24)
- **Git for Windows** (se você está em Windows — necessário para o hook
  pré-commit que usa `sh.exe`)

Verificar:

    node --version    # esperado: v24.x
    npm --version     # esperado: 11.x

---

## Quick start

Da raiz do projeto:

    npm install      # instala dependências (uuid + dev: typescript, vitest, better-sqlite3, wa-sqlite, husky)
    npm test         # roda a suíte inteira (82 testes em ~1.7s)
    npm run check    # typecheck + test (o que o hook pré-commit roda)

Se `npm test` mostrar **82/82 passed** e `npm run check` sair com código 0, o
projeto está saudável.

---

## Estrutura de pastas

    treino-app/
    ├── brief-data-model-fase0.md      # CONTRATO. Leia primeiro.
    ├── DECISIONS.md                    # PORQUÊS + dívidas com gatilho.
    ├── plano-vertical-grade-operacional.md  # plano de salto/força (input).
    ├── rotina-flexibilidade-core-ginastica.md  # plano de flex/core (input).
    │
    ├── migrations/                     # SQL versionado. Ordem importa.
    │   └── 001_init.sql                # schema inicial (13 tabelas, 4 triggers).
    │
    ├── src/
    │   ├── domain/
    │   │   ├── types.ts                # enums, IDs brandados, constantes.
    │   │   ├── constants.ts            # limiares nomeados (incluindo TODOs).
    │   │   └── types.test.ts           # asserções de tipo (compiladas + runtime).
    │   ├── db/
    │   │   ├── adapter.ts              # interface async (Database).
    │   │   ├── adapters/
    │   │   │   ├── better-sqlite3.ts   # adapter de teste rápido.
    │   │   │   └── wa-sqlite-node.ts   # adapter espelho do engine de produção.
    │   │   ├── runner.ts               # aplica migrations dentro de transação.
    │   │   ├── migrations.ts           # manifesto (versão → arquivo .sql).
    │   │   └── runner.test.ts          # testes parametrizados nos 2 engines.
    │   ├── engine/                     # STUBS PROVISÓRIOS (ver Caminho I em DECISIONS.md §D).
    │   │   ├── derivations.ts          # rsi, rsiMod, isRecallLate, volumeByBlock.
    │   │   ├── foster.ts               # monotony com piso de SD.
    │   │   └── decision/               # módulos que I-9 grepa (sem ACWR).
    │   │       ├── deload.ts
    │   │       ├── interference.ts
    │   │       ├── progression.ts
    │   │       ├── role.ts
    │   │       └── trend.ts
    │   └── invariants/                 # 18 arquivos, 33 it()s, 46 invocações.
    │       ├── I-01.test.ts ... I-15.test.ts
    │       ├── I-10-derived-immutability.test.ts
    │       ├── quality-dual-role.test.ts
    │       ├── check-vs-ts-enum-parity.test.ts
    │       └── _helpers/engines.ts     # array de engines para describe.each.
    │
    ├── .github/workflows/ci.yml        # rodar testes em PR.
    ├── .husky/pre-commit               # hook que roda `npm run check` em todo commit.
    ├── package.json
    └── tsconfig.json

---

## Como entender se algo quebrou

### O hook pré-commit

Toda vez que você commita, o Git roda `npm run check` **antes** de aceitar o
commit. Se algum teste falha ou typecheck reclama, o commit é **abortado** e
nada é gravado no histórico.

- **Verde (commit aceito):** "82 passed" e exit code 0. Commit entra.
- **Vermelho (commit rejeitado):** vê linhas vermelhas ou "× test failed" ou
  erro de typecheck. **O commit não foi feito.** Olhe o erro, conserte, commite
  de novo.

**Se o hook bloquear um commit, NÃO é bug — é a rede funcionando.** Aceitar
o vermelho seria gravar regressão no histórico.

Para **desligar temporariamente o hook** (NUNCA em main, só para debug em
branch isolado):

    git commit --no-verify -m "..."

Use isso só se você sabe exatamente o que está fazendo e por quê.

---

## Como adicionar uma nova migration

> ⚠️ **LEIA ATÉ O FIM ANTES DE COMEÇAR** — se você é o futuro-você (ou uma
> IA mantendo este projeto), este aviso existe para impedir perda de dados
> reais. Não pule.

### Fluxo padrão para migration **additive-only** (segura)

Migration additive-only = só **adiciona** estrutura, nunca remove nem
sobrescreve. Exemplos seguros:
- `CREATE TABLE nova_tabela (...)`
- `ALTER TABLE existente ADD COLUMN nova_coluna TEXT` (com NULL default)
- `CREATE INDEX idx_novo ON tabela(coluna)`

Para essas, basta:

1. Criar `migrations/002_<nome_descritivo>.sql` com o DDL.
2. Terminar o arquivo com `INSERT INTO schema_version (version, applied_at) VALUES (2, ...);`.
3. Adicionar entrada em `src/db/migrations.ts` no `MIGRATION_MANIFEST`:
   `{ version: 2, name: '002_<nome_descritivo>' }`.
4. Rodar `npm test`. O teste 28 (`check-vs-ts-enum-parity`) vai pegar se você
   adicionou enum no SQL sem refletir em `src/domain/types.ts`.
5. Commitar. O hook valida tudo de novo.

### ⛔ ANTES de qualquer migration **destrutiva** sobre dados reais

Migration destrutiva = **muda** ou **apaga** dados existentes. Exemplos:
- `DROP TABLE`, `DROP COLUMN`
- `ALTER TABLE ... DROP CONSTRAINT`
- `ALTER TABLE ... RENAME COLUMN` (em alguns SQLites)
- `UPDATE ... SET` em massa que sobrescreve dados
- `DELETE FROM ...` em massa
- Mudança no CHECK constraint que rejeita dados existentes
- Trocar tipo de coluna (perda silenciosa de precisão)

**Você tem dados reais no app (treinos registrados, jump tests, peso corporal)?**

- **Se SIM** ⇒ **PARE**. Leia a [`DECISIONS.md` Dívida 1](./DECISIONS.md) e
  a **F1 da AUDITORIA-lacunas** (sua fundamentação externa). A regra é
  inegociável: **snapshot completo do banco antes**, com possibilidade de
  rollback. Sem snapshot prévio, NÃO faça. Migrations destrutivas sobre
  dados reais sem snapshot são exatamente como você perde meses de histórico
  num minuto.

- **Se NÃO** (banco vazio, ou só de dev/teste) ⇒ pode prosseguir, mas registre
  no `DECISIONS.md` na seção de mudanças de schema o porquê da destruição.

### Por que esse aviso é prominente

A primeira migration que toque dados reais é o momento em que dívidas de
plataforma viram bugs irreversíveis. O brief §10.5 manda backup versionado;
a [Dívida 3 do DECISIONS.md](./DECISIONS.md) (eviction iOS) reforça que
backup tem que existir antes do primeiro deploy. Migration destrutiva em
produção sem snapshot prévio é a forma mais rápida de transformar todas
essas dívidas em arrependimento.

---

## Como rodar o teste de salto

> 🟡 **Não implementado ainda.** Esta seção descreve o que o app **vai**
> fazer quando a UI entrar (brief §10.4). Documentado aqui para você lembrar
> da forma operacional quando chegar a hora.

**O que é:** medição instrumentada do salto vertical (altura, time-to-takeoff,
contact_time) usando o app **MyJump** (ou similar) no celular. O resultado
vira uma linha em `jump_test` com `measurement_source='instrumented'`.

**Cadência:** no **início de cada bloco** da periodização (Mês 1, Mês 2, Mês 3).
Lembrete agendado por notificação (brief §10.4, segunda das duas notificações
permitidas). Sem lembretes diários — ruído leva ao abandono.

**Como executar (quando a UI existir):**
1. No celular, abrir o app de treino e ir em **"Teste de salto"**.
2. Aquecer normalmente (sem hold estático longo — gate I-13).
3. Fazer o salto sob o método do MyJump (3 saltos + média, ou conforme protocolo).
4. **Digitar** os números no app: altura (cm), tempo até decolagem (ms),
   tempo de contato (ms se for DJ).
5. Marcar `jump_type`: CMJ / SJ / DJ / approach / bounce.
6. **Confirmar** `measurement_source = instrumented`. Se algo deu errado e
   você só "estimou no olho", marque `subjective` — o invariante I-4 garante
   que só `instrumented` dispara o ramo objetivo de deload.

**Importante:** RSI e RSI-mod **não são gravados** — derivam na leitura
(invariante I-3). Não procure campos para eles.

---

## Como o backup funciona

**Por que existe:** Safari iOS pode despejar storage de PWAs sob pressão de
espaço (eviction). Sem backup, você pode perder semanas de histórico de um
momento para outro. **Frequência de uso não é mitigação confiável** — só
backup externo é.

**O que já funciona hoje (backup LOCAL):**

1. **Persistência durável**: ao abrir o app, ele pede ao navegador para NÃO
   despejar os dados (`navigator.storage.persist()`) — best-effort, sem
   travar nada. No iPhone o que de fato protege é **instalar na Tela de
   Início**; no Chrome/Android o pedido costuma ser concedido.

2. **Baixar backup (.sql)**: a tela "Hoje" tem o botão **"Baixar backup
   (.sql)"**, e ao **Finalizar** uma sessão o app baixa um `.sql` sozinho.
   Guarde esse arquivo **fora do app** (Arquivos / iCloud / Drive, à mão) —
   é o backup externo que sobrevive a um eviction.

3. **Restaurar backup (.sql)**: também na tela "Hoje", **"Restaurar backup
   (.sql)"** abre um seletor de arquivo. Escolha um `.sql` que o próprio app
   gerou; ele **avisa que vai apagar o estado atual**, confirma, substitui
   tudo pelo backup e recarrega. É o caminho de recuperação depois de um
   eviction (ou troca de aparelho).

> 🟡 **Futuro (P3 — ainda NÃO implementado):** backup automático na nuvem
> (Google Drive), histórico de versões e restauração por data. Hoje o backup
> é **local e manual**: o arquivo `.sql` que você baixa e guarda. Ver
> [Dívida 3 do DECISIONS.md](./DECISIONS.md) e brief §10.5.

**O que NÃO é backup neste sistema:** o sync entre dois aparelhos (decisão
A do Passo 3). Sync resolve "treino no celular, depois mexe no PC"; backup
resolve "perdi meses de histórico". São dois mecanismos diferentes, ambos
necessários.

---

## Conexão com IA (parsing e geração)

> 🟡 **Não implementado ainda.** Brief §2 + §10.1.

**Para que serve:** importar plano de treino a partir de texto livre (você
cola o texto dos arquivos `plano-vertical-*.md` / `rotina-flexibilidade-*.md`
ou um plano novo, e a IA estrutura para o schema). Também: narração
pós-treino (você dita "troquei agachamento por leg press, pulei o clean
pull" e a IA marca os status corretos com `data_origin='narrated'`).

**Como vai funcionar:** chamadas à API da Anthropic (endpoint de mensagens).
**Mecanismo de chave pendente de decisão de arquitetura** — ver
AUDITORIA-lacunas L2 (fonte externa). PWA sem backend rodando no browser
**não tem variável de ambiente de servidor** onde a chave more; a saída
provável é **BYOK** (você cola a própria chave da Anthropic nas
configurações do app), com decisão pendente sobre onde a chave persiste
(config no SQLite/OPFS vs. re-input por sessão vs. localStorage isolado).
Em qualquer caso: **não embutir no código sob nenhuma hipótese**. Até
essa decisão entrar, a feature de IA fica desabilitada; o resto do app
funciona normalmente.

---

## Cheat sheet de comandos

| Comando | O que faz |
|---|---|
| `npm install` | Instala dependências. Roda 1x ou quando `package.json` muda. |
| `npm test` | Roda os 82 testes. ~1.7s. |
| `npm run test:watch` | Roda testes em loop, re-executando quando arquivos mudam. |
| `npm run typecheck` | Só typecheck TS (sem rodar testes). |
| `npm run check` | typecheck + test, em sequência. Mesmo que o hook pré-commit roda. |
| `git commit -m "..."` | Tenta commitar. Hook roda `npm run check` antes; bloqueia se vermelho. |
| `git commit --no-verify -m "..."` | ⚠️ Pula o hook. Use só em branch isolado para debug. |

---

## Apontadores

- [`brief-data-model-fase0.md`](./brief-data-model-fase0.md) — **contrato e
  filosofia**. Lê antes de mexer em qualquer coisa.
- [`DECISIONS.md`](./DECISIONS.md) — **porquês**, refinamentos do brief, e
  as **4 dívidas com gatilho nomeado**.
- `plano-vertical-grade-operacional.md` e
  `rotina-flexibilidade-core-ginastica.md` — planos de treino que vão
  alimentar o app (input, não código).

Para o agente (Claude Code) que mantém este projeto: a memória local em
`.claude/projects/.../memory/` carrega `user-leigo-manutencao-ia`,
`feedback-anti-overengineering`, `feedback-single-source-of-truth`, e
`project-treino-app` (não versionado neste repo, mas mantido entre sessões).
