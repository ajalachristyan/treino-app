# Design — Camada de Aderência + Prontidão (treino-app)

**Data:** 2026-07-01 · **Dono:** Christyan Ajala · **Status:** aprovado no brainstorming; aguardando revisão do spec antes do plano de implementação.

> Escopo NOVO, complementar ao motor de periodização (`C:\Users\ajala\.claude\plans\parsed-popping-kay.md`).
> O motor decide **o que prescrever por fase**; esta camada mede **o quão bem o dono segue o plano** e **reage** — sem nunca reescrever o plano sozinho.

---

## 1. Problema / motivação (nas palavras do dono)

1. "Registrar as faltas E as presenças, pra saber como foi a semana, o mês."
2. "Não é problemático o plano prosseguir mesmo eu não treinando? Aí vou ter que fazer algo mais avançado tendo pulado caminho." → risco de **entrar no trabalho de alto risco (Mês 3 / depth jumps) sem base** = lesão.
3. "É bom ter o aviso e a reformulação em caso de muitas faltas ou exercícios não feitos."
4. "Se só fizer os treinos parcialmente, conta como progressão igual? Não tem que ter uma trava?"
5. "Deve ter graus de importância — pular back extension às vezes ≠ pular back squat muitas vezes."

Hoje o app **não** tem tela de aderência, **não** avisa quando o dono está atrás, e a progressão **conta sessão parcial como completa**.

---

## 2. INVARIANTE DE DESIGN (load-bearing — a trava do "não inventar")

> **O sugeridor só rearranja/reoferece o conteúdo do próprio plano do dono. O contexto escolhe QUAL rearranjo. Jamais autora treino novo.**

Consequências:
- Os únicos "ajustes" possíveis são estruturais e já contemplados pelo plano: **repetir a semana**, **estender a fase**, **mexer a data de início** (P2.5). Nada de inventar exercício, carga, série ou fase.
- O espaço de sugestão = só o que está no plano. Se um buraco real exigir algo novo, o app **sinaliza** ("isso foge do plano — quer adicionar?") e o **dono decide** (dono valida). Nunca inventa em silêncio.
- Toda constante/limiar cita a fonte e é `dono valida`; nada científico é decidido sozinho.

Alinha com: anti-culpa §6.3 (avisa/sugere, nunca pune nem bloqueia o log), I-12 (maleabilidade — overlay de leitura, o dono sobrescreve), I-15 (planejado-não-feito não progride), e a memória `feedback_anti_overengineering`.

---

## 3. Decisões travadas (do brainstorming, 2026-07-01)

| Tema | Decisão |
|---|---|
| Nível de ação do app | **Avisar + sugerir ajuste que o dono confirma.** Trava a progressão indevida. **Nunca** reescreve sozinho. |
| Trava de progressão | Progride só com a **maioria (~2/3) das séries prescritas**, todas no topo. (JÁ CONSTRUÍDO — ver §6.) |
| Gatilho do aviso | **Dois** — (a) aderência da fase baixa; (b) trava reforçada ao entrar em **fase de risco** (Mês 3) sem base. |
| Graus de importância | Do campo `exercise.priority`: `primary` / `accessory` / `finisher` / `bonus`. Largar `primary` (back squat, saltos) repetidamente pesa; largar `accessory`/`finisher` de vez em quando, não. |

---

## 4. Arquitetura (unidades isoladas, testáveis)

```
Dados (selectors — data layer)
  planejado por janela (work_block_item + priority + planned_sets)  ─┐
  executado (sessions + statuses)                                    ├─► adherence.ts (puro)
  faltas (missed_session)                                          ─┘        │
                                                                             ▼
                                                          AdherenceSummary
                                                                             │
                    phaseContext (phase.ts, já existe) ──────────────────────┤
                                                                             ▼
                                                          readiness.ts (puro)
                                                                             │
                              { adherenceWarning?, riskPhaseGate?,           │
                                neglectedKeyExercises[], suggestedAdjustment? }
                                                                             ▼
                                              Wiring/UI: tela de aderência + banners
                                              + "sugestão de ajuste — confirmar"
```

> **Nota de implementação (2026-07-01, W2b):** o selector `plannedOccurrences` (`src/data/adherence.ts`) deriva "falta" **estruturalmente** (ocorrência vencida + slot não-executado), **não** de `missed_session`. Motivo: para dias passados os dois produzem o mesmo número — consultar `missed_session` seria código morto (anti-over-engineering). Faltas explicitamente registradas (P2.5) entram como **exibição** na tela de aderência (W5), não no cálculo do resumo. As menções a `missed_session`/`absences.ts` como coletor abaixo (§4.3) valem só para o **display** do W5.

### 4.1 `src/engine/decision/adherence.ts` (puro, novo)
- **O que faz:** dado o planejado + executado + faltas de uma janela (semana / mês / fase), computa um resumo de aderência, **ponderado por `priority`**.
- **Saída (`AdherenceSummary`):** sessões planejadas/feitas/faltadas; por tier de prioridade (feito × planejado × pulado); por exercício `primary` (sequência de vezes pulado).
- **Depende de:** nada de DB (recebe dados já coletados). Testável isolado.

### 4.2 `src/engine/decision/readiness.ts` (puro, novo)
- **O que faz:** dado o `AdherenceSummary` + o `phaseContext` (fase atual e próxima), decide os avisos e a sugestão — **advisory only**.
- **Saída (`ReadinessAssessment`):**
  - `adherenceWarning?` — aderência da fase < `PHASE_ADHERENCE_WARN_PCT`.
  - `riskPhaseGate?` — vai entrar em fase de risco (Mês 3 / `plio_reativo` depth jumps) com base insuficiente.
  - `neglectedPrimary[]` — exercícios `primary` largados ≥ `KEY_EXERCISE_NEGLECT_STREAK` vezes.
  - `suggestedAdjustment?` — `'repeat_week' | 'extend_phase' | 'shift_start'` (só rearranjo do plano — §2). `readiness.ts` emite `extend_phase`/`repeat_week`; `shift_start` é oferecido no **wiring/contexto** (ex.: dono muito atrás → mexer a data de início, P2.5).
- **Depende de:** `adherence.ts`, `phase.ts`. Nada de DB.

### 4.3 Wiring / UI
- **Selectors (data layer):** coletar planejado × executado × faltas por janela (parte reusa `plan.ts`, `sessions.ts`, `absences.ts`).
- **Tela de aderência:** contagens semana / mês / fase, **esteticamente agradável, operável e com informação consultável com clareza** (requisito do dono → usar skill `frontend-design`).
- **Banners:** reusar o padrão de banner já existente (deload/fase) para os avisos.
- **"Sugestão de ajuste — confirmar":** o dono aceita/recusa; nunca automático.

---

## 5. Constantes novas (nomeadas, `dono valida`, testes discriminantes)

| Constante | Papel | Nota |
|---|---|---|
| `PHASE_ADHERENCE_WARN_PCT` | limiar de aviso suave de aderência | placeholder ~0.6; dono valida |
| `KEY_EXERCISE_NEGLECT_STREAK` | nº de vezes que um `primary` largado dispara aviso | placeholder; dono valida |
| (risco) | quais fases são "de risco" (Mês 3 / `plio_reativo`) | derivar de emphasis `m3` + function_tag, sem número mágico |

Importância = campo `priority` existente (sem constante nova). `PROGRESSION_MIN_SETS_FRACTION` já criada (§6).

---

## 6. Peça 2 — Trava de progressão (JÁ CONSTRUÍDA nesta rodada)

`shouldProgressExercise` ganhou `prescribedSets?: number | null`. Com alvo conhecido (`planned_sets`, = 3 na força/superior via migração 009), exige `latest.sets.length ≥ ceil(PROGRESSION_MIN_SETS_FRACTION × prescribedSets)` antes do critério clássico "todas no topo". Sem alvo (NULL em salto/mobilidade), degrada. 5 testes discriminantes; I-7/I-15 preservados. Constante `PROGRESSION_MIN_SETS_FRACTION = 2/3`.

---

## 7. Invariantes / limites

- **I-12 / anti-culpa §6.3:** tudo é overlay de leitura + advisory; nunca bloqueia o log de uma sessão.
- **I-15:** o que não foi feito não progride (a trava reforça).
- **Fora de escopo (agora):** dor/energia subjetiva (readiness subjetivo — Slice 2 do motor); volume de salto ≤10%/sem; reformulação automática (rejeitada pelo dono).

---

## 8. Verificação

- Testes discriminantes por unidade (`adherence.ts`, `readiness.ts`): aderência alta vs baixa; `primary` largado vs `accessory` largado (mesmo nº de faltas → só o `primary` avisa); entrada de fase de risco com/sem base. **Nunca contra o número** (60%, N).
- `npm run check` + `vite build` verdes antes de cada commit. Diff cru → `revisor-treino`. Smoke na tela de aderência. **Push só o dono.**
