"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/Button";

export interface RankingsErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Error boundary for the rankings route (SPEC 3.0 / F13). No stack traces;
 * the digest is enough to find the server log line.
 */
export default function RankingsError({ error, reset }: RankingsErrorProps) {
  const pathname = usePathname();
  useEffect(() => {
    console.error("[profpeek] rankings error", error.digest ?? error.message);
  }, [error]);

  return (
    <section role="alert" className="mx-auto flex w-full max-w-xl flex-col items-start gap-4 px-4 py-16 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-danger">Error</p>
      <h1 className="m-0 text-2xl font-semibold tracking-tight text-ink">Something broke loading this page</h1>
      <p className="m-0 text-sm text-ink-muted">
        The rankings for <code className="rounded bg-surface-sunken px-1 py-0.5 font-mono text-[0.85em]">{pathname}</code> could not be
        rendered. Retrying usually fixes it.
      </p>
      {error.digest ? (
        <p className="m-0 text-xs text-ink-faint">
          Reference: <code className="font-mono">{error.digest}</code>
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => reset()}>Retry</Button>
        <Button variant="secondary" href="/">
          Go home
        </Button>
      </div>
    </section>
  );
}
