// Short explanations written by a language model, asked from the server.
// The app decides right and wrong by itself; this only adds words about a mistake, and only when there is a connection.
import {
  ExplainRequestSchema,
  ExplainResponseSchema,
  ROUTES,
} from "@norsk/protocol";
import type { ExplainRequest } from "@norsk/protocol";
import { useEffect, useState } from "react";
import * as v from "valibot";

import { note } from "./journal";

/** A little longer than the server waits for the model, so that the server's answer is the one that arrives. */
const TIMEOUT_MS = 28_000;

/** Sends a request, already written as JSON. Returns null when there is no connection, no server, or no answer in time. */
const ask = async (
  body: string,
  signal: AbortSignal
): Promise<string | null> => {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return null;
  }

  try {
    const response = await fetch(ROUTES.explain, {
      body,
      headers: { "content-type": "application/json" },
      method: "POST",
      signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
    });

    if (!response.ok) {
      return null;
    }

    const answer = v.safeParse(ExplainResponseSchema, await response.json());
    const text = answer.success ? answer.output.text.trim() : "";

    return text === "" ? null : text;
  } catch {
    return null;
  }
};

/** An answer, and the request it answers. */
interface Answer {
  body: string;
  text: string | null;
}

/** Asks once per request. The text is null until it arrives, and stays null if it never does. */
export const useExplain = (request: ExplainRequest | null): string | null => {
  const [answer, setAnswer] = useState<Answer | null>(null);
  // The request is rebuilt on every render; its content is what matters.
  const body = request === null ? null : JSON.stringify(request);

  useEffect(() => {
    const stop = new AbortController();

    const run = async (asked: string): Promise<void> => {
      const started = Date.now();
      const text = await ask(asked, stop.signal);

      if (!stop.signal.aborted) {
        note("explain", {
          ms: Date.now() - started,
          request: v.parse(ExplainRequestSchema, JSON.parse(asked)),
          text,
        });
        setAnswer({ body: asked, text });
      }
    };

    if (body !== null) {
      run(body).catch(reportError);
    }

    return () => {
      stop.abort();
    };
  }, [body]);

  // An answer to an earlier request is not shown for this one.
  return answer !== null && answer.body === body ? answer.text : null;
};
