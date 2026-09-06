/** Tiny structured logger for scripts: one line per event, no dependencies. */
const started = Date.now();

function stamp(): string {
  return `${((Date.now() - started) / 1000).toFixed(1)}s`;
}

export const log = {
  info: (msg: string, ...rest: unknown[]) => console.log(`[${stamp()}] ${msg}`, ...rest),
  warn: (msg: string, ...rest: unknown[]) => console.warn(`[${stamp()}] WARN ${msg}`, ...rest),
  error: (msg: string, ...rest: unknown[]) => console.error(`[${stamp()}] ERROR ${msg}`, ...rest),
  /** Print the one-line summary every script ends with (SPEC 6.1). */
  summary: (msg: string) => console.log(`\n${msg}`),
};

export function fail(msg: string, code = 1): never {
  log.error(msg);
  process.exit(code);
}
