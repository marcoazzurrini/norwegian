import { createTestSession } from "@norsk/auth/testing";
// How the tests talk to the Worker: as a browser page of the site would, or as the audio build script.
import { env, exports } from "cloudflare:workers";

export const SITE = "https://norsk.test";
export const LEARNER = "learner@example.com";

/** Anything JSON can carry. A test may send a body the server must refuse, so the shape is open. */
export type Json =
  | boolean
  | number
  | string
  | null
  | undefined
  | Date
  | readonly Json[]
  | { readonly [key: string]: Json };

/** Signs the learner in and returns the session cookie. */
export const signIn = async () => await createTestSession(env, LEARNER);

export const send = async (path: string, init: RequestInit = {}) =>
  await exports.default.fetch(new Request(`${SITE}${path}`, init));

/** A POST as the app sends it, with `text` as the body. */
export const postText = async (
  path: string,
  text: string,
  cookie = "",
  headers: Record<string, string> = {}
) =>
  await send(path, {
    body: text,
    headers: {
      "content-type": "application/json",
      cookie,
      origin: SITE,
      ...headers,
    },
    method: "POST",
  });

/** A POST as the app sends it, with `body` as JSON. */
export const post = async (
  path: string,
  body: Json,
  cookie = "",
  headers: Record<string, string> = {}
) => await postText(path, JSON.stringify(body), cookie, headers);

/** The status and JSON body of an answer. */
export const result = async (response: Response | Promise<Response>) => {
  const answer = await response;

  return { body: await answer.json<unknown>(), status: answer.status };
};

/** What JSON makes of a value: dates become text. This is what travels and what is stored. */
export const onTheWire = (value: Json) => {
  const text = JSON.stringify(value);
  const read: unknown = JSON.parse(text);

  return read;
};

export const withKey = { authorization: `Bearer ${env.SYNC_KEY}` };

/** A sync request from a device that has never synced and has nothing. */
export const EMPTY_SYNC = {
  epoch: null,
  log: [],
  logSeq: 0,
  memRev: 0,
  memory: [],
  meta: null,
};
