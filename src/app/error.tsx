"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

export interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Root error boundary (SPEC 3.0 / F13). Never shows a stack trace; the digest
 * lets the operator find the server log line.
 */
export default function RootError({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    // Server-side details stay in the server log; the client gets a digest only.
    console.error("[profpeek] page error", error.digest ?? error.message);
  }, [error]);

  return (
    <section
      role="alert"
      className="mx-auto flex w-full max-w-xl flex-col items-start gap-4 px-4 py-16 sm:px-6"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-danger">Error</p>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        Something broke loading this page
      </h1>
      <p className="text-sm text-ink-muted">
        The data behind this page could not be rendered. Retrying usually fixes it; if it keeps
        failing, the demo dataset may not have been generated yet
        (<code className="rounded bg-surface-sunken px-1 py-0.5 font-mono text-[0.8em]">npm run data:all</code>).
      </p>
      {error.digest ? (
        <p className="text-xs text-ink-faint">
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
