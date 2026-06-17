// Tipos para o AccessHandlePoolVFS VENDORADO (cópia local de
// wa-sqlite/src/examples/AccessHandlePoolVFS.js com DEFAULT_CAPACITY reduzido).
// Só o que o nosso worker usa: construir com o diretório e aguardar isReady.
export class AccessHandlePoolVFS {
  constructor(directoryPath: string);
  isReady: Promise<void>;
  readonly name: string;
}
