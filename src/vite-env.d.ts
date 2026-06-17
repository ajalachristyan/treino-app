/// <reference types="vite/client" />

// =============================================================================
// Shims de tipo para os modulos sem tipagem do wa-sqlite usados pelo adapter de
// browser (wa-sqlite-opfs.ts). O pacote distribui JS sem .d.ts para o Factory
// ESM e para os exemplos de VFS; declaramos a superficie minima que usamos.
// =============================================================================

// AccessHandlePoolVFS (exemplo do wa-sqlite, JS puro). So a superficie que o
// adapter toca: construtor com directoryPath, isReady para aguardar o acquire
// do OPFS e o name. O objeto e passado opaco para sqlite3.vfs_register.
declare module "wa-sqlite/src/examples/AccessHandlePoolVFS.js" {
  export class AccessHandlePoolVFS {
    constructor(directoryPath: string);
    isReady: Promise<void>;
    readonly name: string;
  }
}

// Factory ESM do build SINCRONO (wa-sqlite.mjs). Recebe opcoes do Emscripten
// (locateFile) e resolve o module passado a SQLite.Factory.
declare module "wa-sqlite/dist/wa-sqlite.mjs" {
  const f: (opts?: { locateFile?: (file: string) => string }) => Promise<unknown>;
  export default f;
}
