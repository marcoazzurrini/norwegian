// Sign-in, in the browser.
//
// Hides: Better Auth's client, the addresses it calls, and the trip to Google and back.
// Each function rejects if the server could not be reached, so a caller that is offline
// can tell "signed out" from "could not ask".
import { createAuthClient } from "better-auth/client";

/** The account signed in on this device. */
export interface Account {
  email: string;
}

const client = createAuthClient();

const unreachable = (action: string) =>
  new Error(`${action} failed: the sign-in server could not be reached.`);

/**
 * Sends the browser to Google. It comes back to the start page, signed in,
 * or with ?error=... if Google or the list of allowed addresses refused.
 */
export const signIn = async (): Promise<void> => {
  const { error } = await client.signIn.social({
    callbackURL: "/",
    errorCallbackURL: "/",
    provider: "google",
  });

  if (error !== null) {
    throw unreachable("Sign-in");
  }
};

/** Signs this device out. */
export const signOut = async (): Promise<void> => {
  const { error } = await client.signOut();

  if (error !== null) {
    throw unreachable("Sign-out");
  }
};

/** Who is signed in on this device, or null if nobody is. */
export const currentUser = async (): Promise<Account | null> => {
  const { data, error } = await client.getSession();

  if (error !== null) {
    throw unreachable("Checking the account");
  }

  return data === null ? null : { email: data.user.email };
};
