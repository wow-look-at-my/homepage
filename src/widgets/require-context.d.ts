interface RequireContext {
  keys(): string[];
  (id: string): unknown;
  resolve(id: string): string;
}

// Provided by webpack at runtime; maps to the real Node `require`, bypassing
// webpack's bundler so we can load external plugin files unknown at build time.
declare const __non_webpack_require__: NodeRequire;

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
