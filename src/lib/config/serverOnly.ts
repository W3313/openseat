/**
 * Runtime stand-in for `import 'server-only'`.
 *
 * Why not the bare import? Next 16 implements `server-only` at the compiler level (it is not an
 * installed package in this repo), so `tsx scripts/*.ts` — which import `env.ts` and the repository —
 * cannot resolve it and crash. This guard gives the same protection at runtime everywhere (Next server
 * bundles, tsx scripts, vitest in `node`), and throws loudly the moment a module is evaluated in a
 * browser-like environment (a `"use client"` bundle or a jsdom test).
 */
export function assertServerOnly(moduleName: string): void {
  const g = globalThis as { window?: unknown; document?: unknown };
  if (typeof g.window !== 'undefined' || typeof g.document !== 'undefined') {
    throw new Error(
      `${moduleName} is server-only: it touches fs/process.env and must not be imported from a "use client" component. ` +
        'Pass already-serialized data down as props instead.',
    );
  }
}
