// The public interface of the design system. Tokens are imported from "@norsk/ui/tokens.stylex",
// because StyleX only resolves variables that come straight from a `.stylex.ts` file.

// Shared behaviours
export { effects } from "./tokens/effects";

// Components
export { AnswerInput } from "./components/answer-input";

export { AudioButton } from "./components/audio-button";

export { Blob } from "./components/blob";

export type { BlobKind } from "./components/blob";

export { Button, buttonStyle } from "./components/button";

export type { ButtonSize, ButtonVariant } from "./components/button";

export { Card } from "./components/card";

export { Chip } from "./components/chip";

export { Display } from "./components/display";

export { GroupLabel } from "./components/group-label";

export { IconButton } from "./components/icon-button";

export { Key } from "./components/key";

export { ListCard } from "./components/list-card";

export { PageTitle } from "./components/page-title";

export { Progress } from "./components/progress";

export type { ProgressTone } from "./components/progress";

export { Segmented } from "./components/segmented";

export { Tag } from "./components/tag";

export type { TagTone } from "./components/tag";

export { useDesktop } from "./components/use-desktop";

// Patterns
export { AiNote } from "./patterns/ai-note";

export { Answer } from "./patterns/answer";

export { Ask } from "./patterns/ask";

export { Bare } from "./patterns/bare";

export { Choices } from "./patterns/choices";

export { DockHint } from "./patterns/dock-hint";

export { DockRow } from "./patterns/dock-row";

export { Focus } from "./patterns/focus";

export { Mine } from "./patterns/mine";

export { Remark } from "./patterns/remark";

export { Shell } from "./patterns/shell";

export type {
  ShellDestination,
  ShellLinkProps,
  ShellWidth,
} from "./patterns/shell";

export { SignIn } from "./patterns/sign-in";

export type { SignInFailure } from "./patterns/sign-in";

export { Stamp } from "./patterns/stamp";
