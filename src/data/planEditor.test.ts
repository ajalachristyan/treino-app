import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import type { Database } from "../db/adapter.ts";
import { BetterSqlite3Adapter } from "../db/adapters/better-sqlite3.ts";
import { WaSqliteNodeAdapter } from "../db/adapters/wa-sqlite-node.ts";
import { applyMigrations } from "../db/runner.ts";
import { loadMigrations } from "../db/migrations.ts";
import { getWorkBlockItems } from "./plan.ts";
import { getExercise } from "./catalog.ts";
import {
  addItem,
  removeItem,
  setItemSets,
  reorderActive,
  updateExerciseText,
} from "./planEditor.ts";

const BLK = "wb_ter_forca"; // bloco Ter-Forca do seed (6 itens)
const PLAN = "pl_vertical_18w";

type AdapterFactory = (path: string) => Promise<Database>;
const engines: ReadonlyArray<readonly [string, AdapterFactory]> = [
  ["better-sqlite3", (p) => BetterSqlite3Adapter.open(p)],
  ["wa-sqlite-node", (p) => WaSqliteNodeAdapter.open(p)],
];

// Cria uma sessao que TOCA (status) o work_block_item dado, referenciando-o.
async function referenceItem(
  db: Database,
  sid: string,
  siid: string,
  workBlockItemId: string,
  exerciseId: string,
  status: string,
  reason: string | null,
): Promise<void> {
  const now = Date.now();
  await db.run(
    `INSERT INTO session (id, plan_id, work_block_id, started_at, timestamp_server)
     VALUES (?, ?, ?, ?, ?)`,
    [sid, PLAN, BLK, now, now],
  );
  await db.run(
    `INSERT INTO session_item
       (id, session_id, exercise_id, work_block_item_id, actual_sequence,
        status, deviation_reason, data_origin, timestamp_server)
     VALUES (?, ?, ?, ?, 1, ?, ?, 'live', ?)`,
    [siid, sid, exerciseId, workBlockItemId, status, reason, now],
  );
}

describe.each(engines)("planEditor — %s", (_name, openDb) => {
  let db: Database;

  beforeEach(async () => {
    db = await openDb(":memory:");
    await applyMigrations(db, loadMigrations);
  });
  afterEach(async () => {
    await db.close();
  });

  it("addItem adiciona ao fim (ativo), com planned_sets, sequencia acima de todas", async () => {
    const before = await getWorkBlockItems(db, BLK);
    const id = await addItem(db, {
      workBlockId: BLK,
      exerciseId: "ex_zercher_leve",
      plannedSets: 3,
      notes: "extra",
    });
    const after = await getWorkBlockItems(db, BLK);
    expect(after).toHaveLength(before.length + 1);
    expect(after[after.length - 1]?.id).toBe(id); // por ultimo
    expect(after[after.length - 1]?.planned_sets).toBe(3);
  });

  it("setItemSets valida planned_sets (> 0 ou null)", async () => {
    const id = (await getWorkBlockItems(db, BLK))[0]!.id;
    await expect(setItemSets(db, id, 0)).rejects.toThrow(/invalido/i);
    await expect(setItemSets(db, id, -2)).rejects.toThrow(/invalido/i);
    await expect(setItemSets(db, id, 2.5)).rejects.toThrow(/invalido/i);
    await setItemSets(db, id, 5);
    const after = await getWorkBlockItems(db, BLK);
    expect(after.find((i) => i.id === id)?.planned_sets).toBe(5);
    await setItemSets(db, id, null); // null ok
  });

  it("removeItem apaga item nunca tocado (sem sessao referenciando)", async () => {
    const id = await addItem(db, { workBlockId: BLK, exerciseId: "ex_zercher_leve" });
    await removeItem(db, id);
    const row = await db.get("SELECT id FROM work_block_item WHERE id = ?", [id]);
    expect(row).toBeUndefined();
  });

  it("reorderActive reordena os ativos; UNIQUE intacto com um descontinuado no bloco", async () => {
    const items0 = await getWorkBlockItems(db, BLK);
    const back = items0.find((i) => i.exercise_id === "ex_back_squat")!;
    // referencia e descontinua o back squat (mantem planned_sequence ocupado)
    await referenceItem(db, "s_r", "si_r", back.id, back.exercise_id, "skipped", "user_choice");
    await removeItem(db, back.id);

    const active = await getWorkBlockItems(db, BLK); // 5 ativos, sem back squat
    expect(active.find((i) => i.id === back.id)).toBeUndefined();

    // inverte a ordem dos ativos — NAO pode colidir com a sequencia do descontinuado
    const reversed = [...active].reverse().map((i) => i.id);
    await reorderActive(db, BLK, reversed);

    const after = await getWorkBlockItems(db, BLK);
    expect(after.map((i) => i.id)).toEqual(reversed); // ordem nova aplicada
    const t = await db.get<{ active: number }>(
      "SELECT active FROM work_block_item WHERE id = ?",
      [back.id],
    );
    expect(t?.active).toBe(0); // segue descontinuado e invisivel
  });

  it("reorderActive com id forasteiro/duplicado: nao corrompe (UNIQUE sobrevive, mesmos itens)", async () => {
    const items = await getWorkBlockItems(db, BLK);
    const ids = items.map((i) => i.id);
    // entrada suja: id que nao e do bloco + um id duplicado
    await reorderActive(db, BLK, [ids[0]!, "ex_forasteiro_inexistente", ids[1]!, ids[0]!]);

    const after = await getWorkBlockItems(db, BLK);
    expect(after).toHaveLength(items.length); // nada sumiu nem duplicou
    expect(new Set(after.map((i) => i.id))).toEqual(new Set(ids)); // mesmos itens
    const seqs = after.map((i) => i.planned_sequence);
    expect(new Set(seqs).size).toBe(seqs.length); // sequencias unicas (UNIQUE intacto)
  });

  it("I-15: editar o plano NAO muda o exercicio planejado de um session_item substituido", async () => {
    const items = await getWorkBlockItems(db, BLK);
    const planned = items.find((i) => i.exercise_id === "ex_back_squat")!;
    // sessao substitui back squat por hip thrust, preservando work_block_item_id (I-15)
    await referenceItem(
      db, "s_edit", "si_sub", planned.id, "ex_hip_thrust", "substituted", "equipment_busy",
    );

    const before = await db.get<{ ex: string }>(
      "SELECT exercise_id AS ex FROM work_block_item WHERE id = ?",
      [planned.id],
    );
    expect(before?.ex).toBe("ex_back_squat");

    // EDITA o plano de varias formas (reorder + remove referenciado + add)
    await reorderActive(db, BLK, [...items].reverse().map((i) => i.id));
    await removeItem(db, planned.id); // referenciado -> descontinua (nao apaga)
    await addItem(db, { workBlockId: BLK, exerciseId: "ex_zercher_leve", plannedSets: 3 });

    const after = await db.get<{ ex: string; active: number }>(
      "SELECT exercise_id AS ex, active FROM work_block_item WHERE id = ?",
      [planned.id],
    );
    expect(after?.ex).toBe("ex_back_squat"); // planejado intacto -> recuperacao I-15 honesta
    expect(after?.active).toBe(0); // descontinuado, nao apagado (FK + historico)
    const si = await db.get<{ wbi: string }>(
      "SELECT work_block_item_id AS wbi FROM session_item WHERE id = 'si_sub'",
    );
    expect(si?.wbi).toBe(planned.id); // o vinculo da sessao continua
  });

  it("I-15 estrutural: o banco RECUSA UPDATE de work_block_item.exercise_id (trigger)", async () => {
    const items = await getWorkBlockItems(db, BLK);
    const id = items[0]!.id;
    await expect(
      db.run("UPDATE work_block_item SET exercise_id = ? WHERE id = ?", [
        "ex_zercher_leve",
        id,
      ]),
    ).rejects.toThrow(/immutable/i);
    // o exercicio planejado segue intacto (defesa de banco, alem do guard estatico)
    const row = await db.get<{ ex: string }>(
      "SELECT exercise_id AS ex FROM work_block_item WHERE id = ?",
      [id],
    );
    expect(row?.ex).toBe(items[0]!.exercise_id);
  });

  it("updateExerciseText edita how_to/categoria sem tocar progression_type", async () => {
    await updateExerciseText(db, "ex_escadas", {
      howTo: "Subir e descer escadas 10 min, ritmo leve.",
      category: "mobilidade",
    });
    const ex = await getExercise(db, "ex_escadas");
    expect(ex?.how_to).toMatch(/escadas/i);
    expect(ex?.category).toBe("mobilidade");
    expect(ex?.progression_type).toBe("skill_acquisition"); // intacto
  });
});

// ---------------------------------------------------------------------------
// Guard estatico: o editor NUNCA atribui exercise_id (I-15) nem progression_type
// (I-10-derivado). "Trocar exercicio" = remover + adicionar, nao UPDATE.
// ---------------------------------------------------------------------------
describe("planEditor — guard estatico (I-15 / I-10-derivado)", () => {
  it("nao atribui exercise_id nem progression_type em nenhum lugar", async () => {
    const src = await readFile(
      join(dirname(fileURLToPath(import.meta.url)), "planEditor.ts"),
      "utf-8",
    );
    expect(/exercise_id\s*=/.test(src), "planEditor nao deve atribuir exercise_id").toBe(false);
    expect(/progression_type\s*=/.test(src), "planEditor nao deve atribuir progression_type").toBe(false);
  });
});
