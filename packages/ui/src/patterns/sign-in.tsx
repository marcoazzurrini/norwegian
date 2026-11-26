// The only screen a signed-out device can see: a greeting and one way in.
import * as stylex from "@stylexjs/stylex";
import { X } from "lucide-react";

import { Button } from "../components/button";
import { Chip } from "../components/chip";
import {
  color,
  display,
  radius,
  text,
  tracking,
} from "../tokens/tokens.stylex";
import { Bare } from "./bare";

const styles = stylex.create({
  greeting: {
    alignItems: "center",
    display: "flex",
    flexBasis: "0%",
    flexDirection: "column",
    flexGrow: 1,
    flexShrink: 1,
    gap: { default: "1rem", [stylex.env.desktop]: "1.75rem" },
    justifyContent: "center",
    paddingBottom: { default: null, [stylex.env.desktop]: "7.5rem" },
    paddingInline: { default: "1.5rem", [stylex.env.desktop]: 0 },
    textAlign: "center",
  },
  title: {
    fontSize: display.display,
    fontWeight: 500,
    letterSpacing: tracking.tighter,
    lineHeight: 1,
    margin: 0,
  },
  lead: {
    color: color.fg2,
    fontSize: { default: text.s17, [stylex.env.desktop]: text.s22 },
    margin: 0,
  },
  // On a wide screen the action sits with the greeting; on a phone it sits at the bottom, under the thumb.
  wideActions: {
    alignItems: "center",
    display: { default: "none", [stylex.env.desktop]: "flex" },
    flexDirection: "column",
    gap: "1.75rem",
  },
  wideButton: {
    paddingTop: "0.75rem",
  },
  phoneActions: {
    display: { default: "flex", [stylex.env.desktop]: "none" },
    flexDirection: "column",
    gap: "0.75rem",
    paddingBottom: "max(calc(env(safe-area-inset-bottom) + 0.5rem), 1rem)",
    paddingInline: "1rem",
    paddingTop: "0.75rem",
  },
  button: {
    width: { default: "100%", [stylex.env.desktop]: "auto" },
  },
  mark: {
    flexShrink: 0,
    height: "1.125rem",
    width: "1.125rem",
  },
  failure: {
    alignItems: { default: "flex-start", [stylex.env.desktop]: "center" },
    backgroundColor: color.inset,
    borderColor: color.line,
    borderRadius: radius.r20,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    gap: "0.75rem",
    paddingBlock: "0.875rem",
    paddingInline: { default: "1rem", [stylex.env.desktop]: "1.25rem" },
    textAlign: "left",
  },
  failureIcon: {
    color: color.red,
    flexShrink: 0,
    height: { default: "1.125rem", [stylex.env.desktop]: "1.25rem" },
    marginTop: { default: "0.125rem", [stylex.env.desktop]: 0 },
    width: { default: "1.125rem", [stylex.env.desktop]: "1.25rem" },
  },
  failureTitle: {
    fontSize: text.s16,
    fontWeight: 500,
  },
  failureDetail: {
    color: color.fg2,
    fontSize: text.s14,
    lineHeight: 1.45,
  },
  note: {
    color: color.fg3,
    fontSize: { default: text.s14, [stylex.env.desktop]: text.s16 },
    lineHeight: 1.45,
    margin: 0,
    textAlign: "center",
  },
});

const GoogleMark = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true" {...stylex.props(styles.mark)}>
    <path
      fill="#EA4335"
      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
    />
    <path
      fill="#4285F4"
      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
    />
    <path
      fill="#FBBC05"
      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
    />
    <path
      fill="#34A853"
      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
    />
  </svg>
);

export interface SignInFailure {
  /** Such as "Sign-in failed". */
  title: string;
  /** One sentence on what went wrong. */
  detail: string;
}

interface SignInProps {
  /** The name of the app as it is written at the top, such as "norsk". */
  name: string;
  /** The language that is learned, in the learner's own language: "Norwegian". */
  language: string;
  /** "Welcome" in the language that is learned. */
  welcome: string;
  /** Called when the learner presses the button. The caller starts the sign-in. */
  onSignIn: () => void;
  /** True while the sign-in is starting; the button cannot be pressed again. */
  busy?: boolean;
  /** Shown above the button when the last attempt failed. */
  failure?: SignInFailure | null;
}

export const SignIn = ({
  name,
  language,
  welcome,
  onSignIn,
  busy = false,
  failure = null,
}: SignInProps) => {
  const alert =
    failure === null ? null : (
      <div role="alert" {...stylex.props(styles.failure)}>
        <X {...stylex.props(styles.failureIcon)} />
        <div>
          <div {...stylex.props(styles.failureTitle)}>{failure.title}</div>
          <div {...stylex.props(styles.failureDetail)}>{failure.detail}</div>
        </div>
      </div>
    );

  const button = (
    <Button style={styles.button} disabled={busy} onClick={onSignIn}>
      <GoogleMark />
      Sign in with Google
    </Button>
  );

  const note = (
    <p {...stylex.props(styles.note)}>
      Your progress is saved to your account and follows you to every device.
    </p>
  );

  return (
    <Bare name={name}>
      <div {...stylex.props(styles.greeting)}>
        <Chip strong={`${name.charAt(0).toUpperCase()}${name.slice(1)}.`}>
          {language} by recall
        </Chip>
        <h1 {...stylex.props(styles.title)}>{welcome}</h1>
        <p {...stylex.props(styles.lead)}>
          Welcome. Sign in to start learning.
        </p>
        <div {...stylex.props(styles.wideActions)}>
          {alert}
          <div {...stylex.props(styles.wideButton)}>{button}</div>
          {note}
        </div>
      </div>
      <div {...stylex.props(styles.phoneActions)}>
        {alert}
        {button}
        {note}
      </div>
    </Bare>
  );
};
