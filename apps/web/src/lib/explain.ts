// Short explanations written by a language model (worker/explain.ts).
// The app decides right and wrong by itself; this only adds words about a mistake, and only when there is a connection.
import { useEffect, useState } from "react";

export interface ExplainRequest {
  /** "hint" must not give the answer away; "explain" comes after the answer is shown. */
  kind: "hint" | "explain";
  /** The English sentence the learner was asked to say. */
  en: string;
  /** The expected Norwegian. */
  no: string;
  /** What the learner typed. */
  answer: string;
  /** Names of the words and patterns the learner got wrong. */
  topics: string[];
}

const TIMEOUT_MS = 12_000;

/** Returns null when there is no connection, no server, or no answer in time. */
export async function explain(
  request: ExplainRequest,
  signal?: AbortSignal
): Promise<string | null> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return null;
  }

  try {
    const response = await fetch("/api/explain", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)])
        : AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      return null;
    }

    const { text } = (await response.json()) as { text?: string };

    return text?.trim() || null;
  } catch {
    return null;
  }
}

/** Asks once per request. The text is null until it arrives, and stays null if it never does. */
export function useExplain(request: ExplainRequest | null): string | null {
  const [text, setText] = useState<string | null>(null);
  const key = request ? JSON.stringify(request) : null;

  useEffect(() => {
    setText(null);

    if (!request) {
      return;
    }

    const stop = new AbortController();
    void explain(request, stop.signal).then((t) => {
      if (!stop.signal.aborted) {
        setText(t);
      }
    });

    return () => {
      stop.abort();
    };
    // The request is rebuilt on every render; its content is what matters.
  }, [key]);

  return text;
}
