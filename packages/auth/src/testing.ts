// For tests only: signs an address in without going to Google.
import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";

import { settings } from "./settings";
import type { AuthEnv } from "./settings";

/**
 * Creates the account for `email` if there is none, then a session for it, as Better Auth itself
 * would after Google's answer. Returns the value of the `cookie` header that carries the session.
 * The address must be in `env.ALLOWED_EMAILS`, as for a real sign-in.
 */
export const createTestSession = async (
  env: AuthEnv,
  email: string
): Promise<string> => {
  const auth = betterAuth({ ...settings(env), plugins: [testUtils()] });
  const context = await auth.$context;

  const found = await context.internalAdapter.findUserByEmail(email);

  const user =
    found?.user ??
    (await context.test.saveUser(context.test.createUser({ email })));

  const { headers } = await context.test.login({ userId: user.id });

  return headers.get("cookie") ?? "";
};
