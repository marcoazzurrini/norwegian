// Before every test: empty storage with the production tables, and no way out to the internet.
import { applyD1Migrations, reset } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, vi } from "vitest";

beforeEach(async () => {
  await reset();
  await applyD1Migrations(env.DB, env.MIGRATIONS);

  // A test that expects a request to the language model replaces this with its own answer.
  vi.stubGlobal("fetch", (input: RequestInfo | URL) => {
    const address = input instanceof Request ? input.url : String(input);

    throw new Error(`A test tried to reach ${address}`);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
