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
