// The only screen a signed-out device can see, wired to the sign-in of the app.
import { SignIn } from "@norsk/ui";
import type { SignInFailure } from "@norsk/ui";
import { useRouterState } from "@tanstack/react-router";
import { useState } from "react";

import { useCourse } from "../course";
import { learner, useSyncStatus } from "../learner";

/** What to tell the learner about the last attempt, or null if nothing went wrong. */
export const signInFailure = (
  syncError: string | null,
  refused: boolean
): SignInFailure | null => {
  if (syncError !== null) {
    return { detail: syncError, title: "Not signed in" };
  }

  return refused
    ? {
        detail: "This Google account may not use this app.",
        title: "Sign-in failed",
      }
    : null;
};

export const SignInScreen = () => {
  const sync = useSyncStatus();
  const { meta } = useCourse();
  const [starting, setStarting] = useState(false);

  // Google sends the browser back with ?error=... if the sign-in failed or the account is not allowed.
  const refused = useRouterState({
    select: (state) => "error" in state.location.search,
  });

  const start = async () => {
    setStarting(true);
    await learner().signIn();
    // On success the browser leaves for Google; this line only matters if the sign-in could not start.
    setStarting(false);
  };

  return (
    <SignIn
      name={meta.wordmark}
      language={meta.name}
      welcome={meta.greetings.welcome}
      busy={starting}
      failure={signInFailure(sync.error, refused)}
      onSignIn={() => {
        start().catch(reportError);
      }}
    />
  );
};
