// The components of the penna design system (.penna/, page Components).
import {
  BookOpen,
  Check,
  CircleDashed,
  Ear,
  Lock,
  Repeat,
  RotateCcw,
  Sparkles,
  Volume2,
  Waypoints,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { speak } from "../lib/speech";

/** True on the wide layout (sidebar, large type). Matches Tailwind's `lg`. */
export function useDesktop(): boolean {
  const [desktop, setDesktop] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 64rem)").matches
  );

  useEffect(() => {
    const query = window.matchMedia("(min-width: 64rem)");

    const update = () => {
      setDesktop(query.matches);
    };

    update();
    query.addEventListener("change", update);

    return () => {
      query.removeEventListener("change", update);
    };
  }, []);

  return desktop;
}

type Variant = "primary" | "secondary" | "outline" | "danger";

type Size = "large" | "small" | "medium";

const VARIANT: Record<Variant, string> = {
  primary: "border-0 bg-inverse text-on-inverse",
  secondary: "border-0 bg-control text-fg",
  outline: "border border-strong text-fg bg-transparent",
  danger: "border-0 bg-red text-on-inverse",
};

const SIZE: Record<Size, string> = {
  // The main action of a screen.
  large: "h-[3.25rem] px-[1.375rem] text-17 lg:h-14 lg:px-7 lg:text-18",
  medium: "h-9 px-4 text-14 lg:h-11 lg:px-5 lg:text-16",
  small: "h-9 px-4 text-14",
};

export const buttonClass = (
  variant: Variant = "primary",
  size: Size = "large",
  extra = ""
) =>
  `press inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap no-underline disabled:opacity-40 ${VARIANT[variant]} ${SIZE[size]} ${extra}`;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** The key that does the same thing, shown where there is a keyboard. */
  hint?: string;
}

export function Button({
  variant = "primary",
  size = "large",
  hint,
  children,
  className = "",
  ...rest
}: ButtonProps) {
  // The button that takes the Enter key shows its key hint, so it needs no focus ring as well.
  return (
    <button
      type="button"
      {...rest}
      className={buttonClass(
        variant,
        size,
        `${rest.autoFocus ? "focus-visible:outline-none" : ""} ${className}`
      )}
    >
      {children}
      {hint && (
        <kbd className="keyboard-only text-12 -mr-2 rounded-[7px] bg-black/8 px-[7px] py-0.5 font-sans font-medium text-black/55">
          {hint}
        </kbd>
      )}
    </button>
  );
}

export function IconButton({
  label,
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      {...rest}
      className={`press bg-control text-fg flex size-10 shrink-0 items-center justify-center rounded-full border-0 lg:size-11 ${className}`}
    >
      {children}
    </button>
  );
}

/** The white round button that plays Norwegian audio. `className` sets its size. */
export function AudioButton({
  text,
  label = "Play audio",
  className = "size-10",
  icon: Icon = Volume2,
  onClick,
}: {
  text?: string;
  label?: string;
  className?: string;
  icon?: LucideIcon;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick ?? (() => text && void speak(text))}
      className={`press bg-inverse text-on-inverse flex shrink-0 items-center justify-center rounded-full border-0 ${className}`}
    >
      <Icon className="size-[45%]" strokeWidth={2} />
    </button>
  );
}

export function Key({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <kbd
      className={`keyboard-only text-12 text-fg2 inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-[7px] bg-white/8 px-[7px] font-sans font-medium ${className}`}
    >
      {children}
    </kbd>
  );
}

export type BlobKind = "sounds" | "review" | "new" | "story" | "recall" | "map";

const BLOB: Record<
  BlobKind,
  { icon: LucideIcon; shape: string; turn: string; back: string }
> = {
  sounds: { icon: Ear, shape: "bg-teal rounded-full", turn: "", back: "" },
  review: {
    icon: Repeat,
    shape: "bg-blue rounded-[32%]",
    turn: "-rotate-[8deg]",
    back: "rotate-[8deg]",
  },
  new: {
    icon: Sparkles,
    shape: "bg-violet rounded-[58%_42%_50%_50%/46%_54%_46%_54%]",
    turn: "",
    back: "",
  },
  story: {
    icon: BookOpen,
    shape: "bg-orange rounded-full",
    turn: "",
    back: "",
  },
  recall: {
    icon: RotateCcw,
    shape: "bg-green rounded-[32%]",
    turn: "rotate-[8deg]",
    back: "-rotate-[8deg]",
  },
  map: {
    icon: Waypoints,
    shape: "bg-indigo rounded-[50%_50%_42%_58%/56%_44%_56%_44%]",
    turn: "",
    back: "",
  },
};

/** The coloured shape that identifies an activity. `className` sets its size. */
export function Blob({
  kind,
  className = "size-11",
}: {
  kind: BlobKind;
  className?: string;
}) {
  const { icon: Icon, shape, turn, back } = BLOB[kind];

  return (
    <span
      className={`text-on-inverse flex shrink-0 items-center justify-center ${shape} ${turn} ${className}`}
      aria-hidden
    >
      <Icon className={`size-[46%] ${back}`} />
    </span>
  );
}

export type TagTone = "good" | "progress" | "new" | "bad" | "neutral";

const TAG: Record<TagTone, { icon: LucideIcon; color: string }> = {
  good: { icon: Check, color: "text-green" },
  progress: { icon: CircleDashed, color: "text-orange" },
  new: { icon: Sparkles, color: "text-violet" },
  bad: { icon: X, color: "text-red" },
  neutral: { icon: Lock, color: "text-fg3" },
};

export function Tag({
  tone = "neutral",
  icon,
  children,
  className = "",
}: {
  tone?: TagTone;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  const Icon = icon ?? TAG[tone].icon;

  return (
    <span
      className={`bg-control text-13 inline-flex h-[1.625rem] shrink-0 items-center gap-1.5 rounded-full pr-2.5 pl-2 font-medium whitespace-nowrap ${className}`}
    >
      <Icon className={`size-3.5 ${TAG[tone].color}`} />
      {children}
    </span>
  );
}

/** A small two-part label: a strong word and a quieter one. */
export function Chip({
  strong,
  children,
}: {
  strong: string;
  children?: ReactNode;
}) {
  return (
    <span className="border-line bg-base text-13 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5">
      <span className="font-medium">{strong}</span>
      {children && <span className="text-fg2">{children}</span>}
    </span>
  );
}

/** The standard container: a dark inset surface with a hairline. */
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`border-line bg-inset flex flex-col rounded-[1.25rem] border p-[1.125rem] lg:rounded-[1.625rem] lg:p-7 ${className}`}
    >
      {children}
    </div>
  );
}

/** A card that holds a list of rows separated by hairlines. */
export function ListCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`border-line bg-inset [&>*+*]:border-line flex flex-col rounded-[1.25rem] border px-4 py-0.5 lg:rounded-[1.625rem] lg:px-6 lg:py-1 [&>*+*]:border-t ${className}`}
    >
      {children}
    </div>
  );
}

export function Progress({
  value,
  className = "",
  fill = "bg-fg",
}: {
  value: number;
  className?: string;
  fill?: string;
}) {
  const part = Math.max(0, Math.min(1, value));

  return (
    <div
      className={`bg-control h-1.5 overflow-hidden rounded-full ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(part * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-300 ease-out ${fill}`}
        style={{ width: `${part * 100}%` }}
      />
    </div>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onPick,
  label,
  large,
}: {
  value: T;
  options: [T, string][];
  onPick: (v: T) => void;
  label: string;
  large?: boolean;
}) {
  return (
    <div
      className={`bg-control inline-flex max-w-full rounded-full p-1 font-medium ${large ? "text-15 lg:text-17" : "text-15"}`}
      role="radiogroup"
      aria-label={label}
    >
      {options.map(([v, text]) => (
        <button
          key={String(v)}
          type="button"
          role="radio"
          aria-checked={v === value}
          onClick={() => {
            onPick(v);
          }}
          className={`press flex h-[2.125rem] items-center rounded-full border-0 px-3.5 whitespace-nowrap ${large ? "lg:h-10 lg:px-5" : ""} ${v === value ? "bg-inverse text-on-inverse" : "text-fg2 bg-transparent"}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/** Page title with an optional line under it and an optional control on the right. */
export function PageTitle({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between lg:gap-4">
      <div>
        <h1 className="text-title m-0 leading-none font-medium tracking-[-0.035em]">
          {title}
        </h1>
        {sub && (
          <p className="text-16 text-fg2 lg:text-22 m-0 pt-1.5 lg:pt-2.5">
            {sub}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

/** Small grey heading above a group of rows. */
export function Label({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`text-14 text-fg3 font-medium ${className}`}>
      {children}
    </div>
  );
}

/** "et hus" with the article quieter than the word. */
export function Display({ text, split }: { text: string; split: boolean }) {
  const at = split ? text.indexOf(" ") : -1;

  if (at < 0) {
    return <>{text}</>;
  }

  return (
    <>
      <span className="text-fg3">{text.slice(0, at + 1)}</span>
      {text.slice(at + 1)}
    </>
  );
}
