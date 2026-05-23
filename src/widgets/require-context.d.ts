interface RequireContext {
  keys(): string[];
  (id: string): unknown;
  resolve(id: string): string;
}

declare namespace NodeJS {
  interface Require {
    context(
      directory: string,
      useSubdirectories?: boolean,
      regExp?: RegExp,
      mode?: "sync" | "lazy" | "eager" | "weak",
    ): RequireContext;
  }
}
