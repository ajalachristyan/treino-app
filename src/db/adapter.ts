// =============================================================================
// Interface unica para acesso ao SQLite. ASYNC por padrao para casar com
// wa-sqlite (engine de producao, async via WASM/OPFS). O adapter de
// better-sqlite3 (engine de teste, sincrono) envolve cada chamada em Promise
// trivial para satisfazer a mesma interface.
//
// Motivacao: os testes de invariante do Passo 5 vao rodar parametrizados
// nos dois engines (better-sqlite3 no watch local pela velocidade, ambos no
// CI), e o codigo de consumo (runner, engine de regras, futura UI) deve ser
// agnostico de qual esta por baixo. Isso fecha a fresta de "teste verde em
// engine A, invariante furado em engine B".
// =============================================================================

export interface Database {
  /** Executa um ou mais statements SQL sem retorno (CREATE, INSERT lote, etc). */
  exec(sql: string): Promise<void>;

  /** Prepara e executa, sem retorno (INSERT/UPDATE/DELETE de uma linha). */
  run(sql: string, params?: readonly unknown[]): Promise<void>;

  /** Prepara e retorna a primeira linha (ou undefined). */
  get<T = unknown>(sql: string, params?: readonly unknown[]): Promise<T | undefined>;

  /** Prepara e retorna todas as linhas. */
  all<T = unknown>(sql: string, params?: readonly unknown[]): Promise<T[]>;

  /**
   * Le ou define um PRAGMA.
   *   - Sem `value`: le e retorna o valor escalar (ex.: pragma('foreign_keys') -> 1).
   *   - Com `value`: define (ex.: pragma('foreign_keys', 'ON')) e retorna undefined.
   */
  pragma(name: string, value?: string | number): Promise<unknown>;

  /**
   * Executa `fn` dentro de BEGIN ... COMMIT. Se `fn` lancar, faz ROLLBACK e
   * propaga o erro. Para uso no runner de migrations (a migracao inteira
   * dentro de uma transacao) e em qualquer operacao multi-statement que
   * precise de atomicidade.
   */
  transaction<T>(fn: () => Promise<T>): Promise<T>;

  /** Fecha a conexao. */
  close(): Promise<void>;
}
