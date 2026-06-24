// Tipos para o AccessHandlePoolVFS VENDORADO (cópia local de
// wa-sqlite/src/examples/AccessHandlePoolVFS.js com DEFAULT_CAPACITY reduzido).
// O nosso worker usa: construir com o diretório, aguardar isReady, e — na
// recuperacao de boot (acquireVfs) — liberar os handles de um acquire parcial.
export class AccessHandlePoolVFS {
  constructor(directoryPath: string);
  isReady: Promise<void>;
  readonly name: string;
  // Libera TODOS os FileSystemSyncAccessHandles do pool (sem reaquirir). Usado
  // por acquireVfs para soltar um acquire parcial antes de tentar de novo.
  close(): Promise<void>;
}
