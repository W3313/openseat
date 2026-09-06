import { parseArgs } from "node:util";

export interface ScriptArgs {
  flags: Record<string, string | boolean | undefined>;
  positionals: string[];
}

/**
 * parseArgs (strict: false) treats an undeclared `--name value` pair as a boolean flag plus a positional,
 * so rewrite it to `--name=value`; a value is any following token that does not itself start with `--`.
 */
export function normalizeArgv(argv: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    const next = argv[i + 1];
    if (tok.startsWith('--') && !tok.includes('=') && next !== undefined && !next.startsWith('--')) {
      out.push(`${tok}=${next}`);
      i++;
    } else {
      out.push(tok);
    }
  }
  return out;
}

/**
 * Minimal flag parser shared by every script: `--school uiuc --term 2026-fa --only-missing --yes`.
 * Unknown flags are allowed (strict: false) so scripts can declare only what they read.
 */
export function readArgs(argv: string[] = process.argv.slice(2)): ScriptArgs {
  const { values, positionals } = parseArgs({
    args: normalizeArgv(argv),
    strict: false,
    allowPositionals: true,
  });
  return { flags: values as Record<string, string | boolean | undefined>, positionals };
}

export function flagString(args: ScriptArgs, name: string, fallback?: string): string | undefined {
  const v = args.flags[name];
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

export function flagBool(args: ScriptArgs, name: string): boolean {
  const v = args.flags[name];
  return v === true || v === "true" || v === "1";
}

export function flagList(args: ScriptArgs, name: string, fallback: string[] = []): string[] {
  const v = flagString(args, name);
  return v ? v.split(",").map((s) => s.trim()).filter(Boolean) : fallback;
}
