// A development page that draws every old Tailwind component beside its @norsk/ui replacement,
// so the two can be compared pixel by pixel (packages/ui/parity). It goes away with Tailwind.
import {
  AiNote as NewAiNote,
  Answer as NewAnswer,
  AnswerInput as NewAnswerInput,
  Ask as NewAsk,
  AudioButton as NewAudioButton,
  Bare as NewBare,
  Blob as NewBlob,
  Button as NewButton,
  Card as NewCard,
  Chip as NewChip,
  Choices as NewChoices,
  Display as NewDisplay,
  DockHint as NewDockHint,
  DockRow as NewDockRow,
  Focus as NewFocus,
  IconButton as NewIconButton,
  Key as NewKey,
  Label as NewLabel,
  ListCard as NewListCard,
  Mine as NewMine,
  PageTitle as NewPageTitle,
  Progress as NewProgress,
  Remark as NewRemark,
  Segmented as NewSegmented,
  Shell as NewShell,
  SignIn as NewSignIn,
  Stamp as NewStamp,
  Tag as NewTag,
  buttonStyle,
  effects,
} from "@norsk/ui";
import type { BlobKind, ShellDestination, ShellLinkProps } from "@norsk/ui";
import { color, text } from "@norsk/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  BookOpen,
  Ear,
  Library,
  Play,
  Ruler,
  Sun,
  Waypoints,
  X,
} from "lucide-react";
import { createContext, use, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { AnswerInput as OldAnswerInput } from "../components/AnswerInput";
import {
  DockHint as OldDockHint,
  DockRow as OldDockRow,
  Focus as OldFocus,
} from "../components/Focus";
import { Shell as OldShell } from "../components/Shell";
import { Bare as OldBare, SignIn as OldSignIn } from "../components/SignIn";
import {
  AiNote as OldAiNote,
  Answer as OldAnswer,
  Ask as OldAsk,
  Choices as OldChoices,
  Mine as OldMine,
  Remark as OldRemark,
  Stamp as OldStamp,
} from "../components/tasks/shared";
import {
  AudioButton as OldAudioButton,
  Blob as OldBlob,
  Button as OldButton,
  Card as OldCard,
  Chip as OldChip,
  Display as OldDisplay,
  IconButton as OldIconButton,
  Key as OldKey,
  Label as OldLabel,
  ListCard as OldListCard,
  PageTitle as OldPageTitle,
  Progress as OldProgress,
  Segmented as OldSegmented,
  Tag as OldTag,
  buttonClass,
} from "../components/ui";

type Side = "old" | "new";

interface GallerySearch {
  /** A pattern that fills the window is drawn alone: its name, together with `side`. */
  page?: string;
  /**
   * Draws only the old or only the new components. A cell then sits at the same place
   * whichever side is shown, so the two screenshots line up to the pixel.
   */
  side?: Side;
  /**
   * The order of the options in each multiple-choice case, by the name of the case. The old
   * component shuffles them itself; the comparison reads the order it chose and hands it to
   * the page that draws the new one.
   */
  order?: Record<string, string[]>;
}

const isOrder = (value: unknown): value is Record<string, string[]> =>
  typeof value === "object" &&
  value !== null &&
  Object.values(value).every(
    (list) =>
      Array.isArray(list) && list.every((option) => typeof option === "string")
  );

/** The side to draw, or null for both, side by side. */
const OnlySide = createContext<Side | null>(null);

export const Route = createFileRoute("/gallery")({
  validateSearch: (search: Record<string, unknown>): GallerySearch => ({
    ...(typeof search.page === "string" ? { page: search.page } : {}),
    ...(search.side === "old" || search.side === "new"
      ? { side: search.side }
      : {}),
    ...(isOrder(search.order) ? { order: search.order } : {}),
  }),
  component: Gallery,
});

// The gallery is a development tool. A build leaves it out unless it is asked for
// (VITE_GALLERY=1), which is how the StyleX output of a production build is checked.
const SHOWN = import.meta.env.DEV || import.meta.env.VITE_GALLERY === "1";

if (SHOWN) {
  // The document defaults of @norsk/ui. An app imports them once at its root; here they are
  // loaded only with the gallery, so that a normal build of the app does not get them yet.
  void import("@norsk/ui/base.css");
}

if (import.meta.env.DEV) {
  // In development the StyleX plugin serves the compiled rules through this virtual module,
  // which also reloads them after an edit. A build writes them into the stylesheet instead.
  // @ts-expect-error -- The module exists only inside the development server.
  void import("virtual:stylex:runtime");
}

// What a screen would pass through the `style` prop. Each mirrors the Tailwind classes
// that the old component is given in the same case.
const overrides = stylex.create({
  fullOnPhone: { width: { default: "100%", [stylex.env.desktop]: "auto" } },
  audioLarge: {
    height: { default: "3rem", [stylex.env.desktop]: "3.75rem" },
    width: { default: "3rem", [stylex.env.desktop]: "3.75rem" },
  },
  audioDock: {
    height: { default: "2.5rem", [stylex.env.desktop]: "3.5rem" },
    width: { default: "2.5rem", [stylex.env.desktop]: "3.5rem" },
  },
  blobLarge: {
    height: { default: "2.75rem", [stylex.env.desktop]: "3.25rem" },
    width: { default: "2.75rem", [stylex.env.desktop]: "3.25rem" },
  },
  keyLarge: {
    fontSize: { default: text.s12, [stylex.env.desktop]: text.s15 },
    height: { default: "1.5rem", [stylex.env.desktop]: "2rem" },
    minWidth: { default: "1.5rem", [stylex.env.desktop]: "2rem" },
  },
  tagLarge: {
    fontSize: { default: text.s13, [stylex.env.desktop]: text.s15 },
    height: { default: "1.625rem", [stylex.env.desktop]: "2rem" },
    paddingLeft: { default: "0.5rem", [stylex.env.desktop]: "0.625rem" },
    paddingRight: { default: "0.625rem", [stylex.env.desktop]: "0.875rem" },
  },
  cardRoomy: { padding: { default: "1.125rem", [stylex.env.desktop]: "2rem" } },
  labelSpaced: {
    paddingBottom: "0.5rem",
    paddingTop: { default: "0.75rem", [stylex.env.desktop]: "1.375rem" },
  },
  remarkLower: { marginTop: "0.375rem" },
  grow: { flexBasis: "0%", flexGrow: 1, flexShrink: 1 },
  row: {
    backgroundColor: "transparent",
    color: color.fg,
    paddingBlock: { default: "0.8125rem", [stylex.env.desktop]: "1.125rem" },
    paddingInline: 0,
    textAlign: "left",
  },
  icon18: { height: "1.125rem", width: "1.125rem" },
});

// The frame of the gallery itself and the plain elements inside the new cells. They are
// StyleX too, so the new side can be compared with the Tailwind stylesheet taken away.
const layout = stylex.create({
  page: {
    backgroundColor: color.canvas,
    minHeight: "100dvh",
    paddingBlock: "1.5rem",
    paddingInline: { default: "1rem", [stylex.env.desktop]: "2rem" },
  },
  title: { fontSize: text.s20, fontWeight: 500, paddingBottom: "1rem" },
  section: {
    borderColor: color.line,
    borderStyle: "solid",
    borderTopWidth: 1,
    borderWidth: 0,
    paddingBlock: "0.75rem",
  },
  caseName: {
    color: color.fg3,
    fontFamily: "ui-monospace, monospace",
    fontSize: text.s12,
    paddingBottom: "0.5rem",
  },
  columns: {
    display: "grid",
    gap: "0.75rem",
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      [stylex.env.desktop]: "repeat(2, minmax(0, 1fr))",
    },
  },
  cell: {
    alignItems: "flex-start",
    backgroundColor: color.panel,
    display: "flex",
    flexDirection: "column",
    gap: "0.625rem",
    minWidth: 0,
    padding: "1rem",
  },
  cellStretch: { alignItems: "stretch" },
  wrap: { display: "flex", flexWrap: "wrap" },
  gap2: { gap: "0.5rem" },
  gap3: { gap: "0.75rem" },
  figure: { fontSize: text.s28, fontWeight: 500 },
  listRow: {
    paddingBlock: { default: "0.8125rem", [stylex.env.desktop]: "1.125rem" },
  },
  listButton: {
    backgroundColor: "transparent",
    borderBottomWidth: 0,
    borderInlineWidth: 0,
    paddingInline: 0,
    textAlign: "left",
  },
  meter: { alignItems: "center", display: "flex", gap: "0.75rem" },
  meterText: { color: color.fg2, fontSize: text.s14 },
  bigType: { fontSize: text.s44, fontWeight: 500, lineHeight: 1.1 },
  settingRow: { paddingBlock: "1rem" },
});

const noop = () => undefined;

const BLOBS: BlobKind[] = ["sounds", "review", "new", "story", "recall", "map"];

const TONES = ["good", "progress", "new", "bad", "neutral"] as const;

const LENGTHS: [number, string][] = [
  [5, "5 min"],
  [15, "15 min"],
  [25, "25 min"],
  [40, "40 min"],
];

const QUIZ = {
  prompt: "Hva betyr «et hus»?",
  options: ["a house", "a car with a very long name that wraps", "a boat"],
};

const DESTINATIONS: ShellDestination[] = [
  { to: "/", label: "Today", icon: Sun },
  { to: "/map", label: "Map", icon: Waypoints },
  { to: "/stories", label: "Stories", icon: BookOpen },
  { to: "/sounds", label: "Sounds", icon: Ear },
  { to: "/items", label: "Items", icon: Library },
];

/** How an app hands its router link to the shell. */
function ShellLink({ to, children, ...rest }: ShellLinkProps) {
  return (
    <Link to={to} {...rest}>
      {children}
    </Link>
  );
}

function OldSegmentedDemo({ large }: { large?: boolean }) {
  const [value, setValue] = useState(15);

  return (
    <OldSegmented
      label="Session length (old)"
      value={value}
      options={LENGTHS}
      onPick={setValue}
      large={large}
    />
  );
}

function NewSegmentedDemo({ large }: { large?: boolean }) {
  const [value, setValue] = useState(15);

  return (
    <NewSegmented
      label="Session length (new)"
      value={value}
      options={LENGTHS}
      onPick={setValue}
      large={large}
    />
  );
}

function OldInputDemo({ start }: { start: string }) {
  const [value, setValue] = useState(start);

  return <OldAnswerInput value={value} onChange={setValue} onSubmit={noop} />;
}

function NewInputDemo({ start }: { start: string }) {
  const [value, setValue] = useState(start);

  return <NewAnswerInput value={value} onChange={setValue} onSubmit={noop} />;
}

/**
 * The old component shuffles the options itself, so the new one is given the order that the
 * old one ended up with: read from the old one on this page, or passed in the address.
 */
function ChoicesPair({
  name,
  wrong,
  answered,
}: {
  name: string;
  wrong: string[];
  answered: boolean;
}) {
  const { order: given } = Route.useSearch();
  const old = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState<string[] | null>(null);

  useEffect(() => {
    const shown = [...(old.current?.querySelectorAll("button > span") ?? [])];

    setSeen(shown.map((span) => span.textContent ?? ""));
  }, []);

  const order = given?.[name] ?? seen;

  return (
    <Pair
      name={name}
      old={
        <div ref={old}>
          <OldChoices
            quiz={{ index: 0, question: QUIZ, wrong, answered }}
            onPick={noop}
            onNext={noop}
          />
        </div>
      }
      new={
        order && (
          <div>
            <NewChoices
              options={order}
              answer={QUIZ.options[0]}
              wrong={wrong}
              answered={answered}
              onPick={noop}
              onNext={noop}
            />
          </div>
        )
      }
    />
  );
}

/** One case: the old component and the new one in two cells of the same size. */
function Pair({
  name,
  old,
  new: next,
  stretch,
}: {
  name: string;
  old: ReactNode;
  new: ReactNode;
  /** The cell is a column whose children take the full width, as in the exchange of a task. */
  stretch?: boolean;
}) {
  const only = use(OnlySide);
  const cell = stylex.props(layout.cell, stretch && layout.cellStretch);

  return (
    <section {...stylex.props(layout.section)}>
      <h2 {...stylex.props(layout.caseName)}>{name}</h2>
      <div {...stylex.props(layout.columns)}>
        {only !== "new" && (
          <div data-old={name} {...cell}>
            {old}
          </div>
        )}
        {only !== "old" && (
          <div data-new={name} {...cell}>
            {next}
          </div>
        )}
      </div>
    </section>
  );
}

function Components() {
  return (
    <div {...stylex.props(layout.page)}>
      <h1 {...stylex.props(layout.title)}>
        Old (Tailwind) and new (@norsk/ui)
      </h1>

      {(["primary", "secondary", "outline", "danger"] as const).map((v) => (
        <Pair
          key={v}
          name={`button-${v}`}
          old={
            <>
              <OldButton variant={v} hint="↵">
                Continue
              </OldButton>
              <OldButton variant={v} size="medium">
                Medium
              </OldButton>
              <OldButton variant={v} size="small">
                Small
              </OldButton>
              <OldButton variant={v} disabled>
                Disabled
              </OldButton>
            </>
          }
          new={
            <>
              <NewButton variant={v} hint="↵">
                Continue
              </NewButton>
              <NewButton variant={v} size="medium">
                Medium
              </NewButton>
              <NewButton variant={v} size="small">
                Small
              </NewButton>
              <NewButton variant={v} disabled>
                Disabled
              </NewButton>
            </>
          }
        />
      ))}
      <Pair
        name="button-full-width"
        stretch
        old={
          <>
            <OldButton className="w-full lg:w-auto">Start session</OldButton>
            <a
              href="#old"
              className={buttonClass("primary", "large", "w-full lg:w-auto")}
            >
              A link that looks like a button
            </a>
          </>
        }
        new={
          <>
            <NewButton style={overrides.fullOnPhone}>Start session</NewButton>
            <a
              href="#new"
              {...stylex.props(
                buttonStyle("primary", "large"),
                overrides.fullOnPhone
              )}
            >
              A link that looks like a button
            </a>
          </>
        }
      />
      <Pair
        name="icon-button"
        old={
          <OldIconButton label="Close (old)">
            <X className="size-[1.125rem]" />
          </OldIconButton>
        }
        new={
          <NewIconButton label="Close (new)">
            <X {...stylex.props(overrides.icon18)} />
          </NewIconButton>
        }
      />
      <Pair
        name="audio-button"
        old={
          <>
            <OldAudioButton onClick={noop} />
            <OldAudioButton
              onClick={noop}
              className="size-12 lg:size-[3.75rem]"
            />
            <OldAudioButton onClick={noop} icon={Play} label="Play the story" />
          </>
        }
        new={
          <>
            <NewAudioButton onPlay={noop} />
            <NewAudioButton onPlay={noop} style={overrides.audioLarge} />
            <NewAudioButton onPlay={noop} icon={Play} label="Play the story" />
          </>
        }
      />
      <Pair
        name="key"
        old={
          <>
            <OldKey>1</OldKey>
            <OldKey>Space</OldKey>
            <OldKey className="lg:text-15 lg:h-8 lg:min-w-8">2</OldKey>
          </>
        }
        new={
          <>
            <NewKey>1</NewKey>
            <NewKey>Space</NewKey>
            <NewKey style={overrides.keyLarge}>2</NewKey>
          </>
        }
      />
      <Pair
        name="blob"
        old={
          <div className="flex flex-wrap gap-3">
            {BLOBS.map((kind) => (
              <OldBlob key={kind} kind={kind} />
            ))}
            <OldBlob kind="review" className="size-11 lg:size-[3.25rem]" />
          </div>
        }
        new={
          <div {...stylex.props(layout.wrap, layout.gap3)}>
            {BLOBS.map((kind) => (
              <NewBlob key={kind} kind={kind} />
            ))}
            <NewBlob kind="review" style={overrides.blobLarge} />
          </div>
        }
      />
      <Pair
        name="tag"
        old={
          <div className="flex flex-wrap gap-2">
            {TONES.map((tone) => (
              <OldTag key={tone} tone={tone}>
                {tone}
              </OldTag>
            ))}
            <OldTag icon={Ruler}>Pattern</OldTag>
            <OldTag
              icon={Ruler}
              className="lg:text-15 lg:h-8 lg:pr-3.5 lg:pl-2.5"
            >
              Large
            </OldTag>
          </div>
        }
        new={
          <div {...stylex.props(layout.wrap, layout.gap2)}>
            {TONES.map((tone) => (
              <NewTag key={tone} tone={tone}>
                {tone}
              </NewTag>
            ))}
            <NewTag icon={Ruler}>Pattern</NewTag>
            <NewTag icon={Ruler} style={overrides.tagLarge}>
              Large
            </NewTag>
          </div>
        }
      />
      <Pair
        name="chip"
        old={
          <>
            <OldChip strong="Norsk.">Norwegian by recall</OldChip>
            <OldChip strong="12" />
          </>
        }
        new={
          <>
            <NewChip strong="Norsk.">Norwegian by recall</NewChip>
            <NewChip strong="12" />
          </>
        }
      />
      <Pair
        name="card"
        stretch
        old={
          <>
            <OldCard>
              <OldLabel>Hours</OldLabel>
              <div className="text-28 font-medium">12 of 150</div>
            </OldCard>
            <OldCard className="lg:!p-8">A card with more room</OldCard>
          </>
        }
        new={
          <>
            <NewCard>
              <NewLabel>Hours</NewLabel>
              <div {...stylex.props(layout.figure)}>12 of 150</div>
            </NewCard>
            <NewCard style={overrides.cardRoomy}>A card with more room</NewCard>
          </>
        }
      />
      <Pair
        name="list-card"
        stretch
        old={
          <OldListCard>
            <div className="py-[0.8125rem] lg:py-[1.125rem]">Text size</div>
            <div className="py-[0.8125rem] lg:py-[1.125rem]">Voice</div>
            <button
              type="button"
              className="border-x-0 border-b-0 bg-transparent px-0 py-[0.8125rem] text-left lg:py-[1.125rem]"
            >
              A row that is a button
            </button>
          </OldListCard>
        }
        new={
          <NewListCard>
            <div {...stylex.props(layout.listRow)}>Text size</div>
            <div {...stylex.props(layout.listRow)}>Voice</div>
            <button
              type="button"
              {...stylex.props(layout.listRow, layout.listButton)}
            >
              A row that is a button
            </button>
          </NewListCard>
        }
      />
      <Pair
        name="progress"
        stretch
        old={
          <>
            <OldProgress value={0} />
            <OldProgress value={0.37} />
            <OldProgress value={1} />
            <div className="flex items-center gap-3">
              <OldProgress value={2 / 3} fill="bg-green" className="flex-1" />
              <span className="text-14 text-fg2">67%</span>
            </div>
          </>
        }
        new={
          <>
            <NewProgress value={0} />
            <NewProgress value={0.37} />
            <NewProgress value={1} />
            <div {...stylex.props(layout.meter)}>
              <NewProgress value={2 / 3} tone="good" style={overrides.grow} />
              <span {...stylex.props(layout.meterText)}>67%</span>
            </div>
          </>
        }
      />
      <Pair
        name="segmented"
        old={
          <>
            <OldSegmentedDemo />
            <OldSegmentedDemo large />
          </>
        }
        new={
          <>
            <NewSegmentedDemo />
            <NewSegmentedDemo large />
          </>
        }
      />
      <Pair
        name="page-title"
        stretch
        old={
          <>
            <OldPageTitle title="Items" />
            <OldPageTitle title="God morgen" sub="14 minutes today">
              <OldSegmentedDemo large />
            </OldPageTitle>
          </>
        }
        new={
          <>
            <NewPageTitle title="Items" />
            <NewPageTitle title="God morgen" sub="14 minutes today">
              <NewSegmentedDemo large />
            </NewPageTitle>
          </>
        }
      />
      <Pair
        name="label"
        stretch
        old={
          <>
            <OldLabel>Forms</OldLabel>
            <OldLabel className="pt-3 pb-2 lg:pt-[1.375rem]">The rule</OldLabel>
          </>
        }
        new={
          <>
            <NewLabel>Forms</NewLabel>
            <NewLabel style={overrides.labelSpaced}>The rule</NewLabel>
          </>
        }
      />
      <Pair
        name="display"
        old={
          <div className="text-44 leading-[1.1] font-medium">
            <OldDisplay text="et hus" split />
            <br />
            <OldDisplay text="et hus" split={false} />
            <br />
            <OldDisplay text="takk" split />
          </div>
        }
        new={
          <div {...stylex.props(layout.bigType)}>
            <NewDisplay text="et hus" split />
            <br />
            <NewDisplay text="et hus" split={false} />
            <br />
            <NewDisplay text="takk" split />
          </div>
        }
      />
      <Pair
        name="answer-input-empty"
        stretch
        old={<OldInputDemo start="" />}
        new={<NewInputDemo start="" />}
      />
      <Pair
        name="answer-input-filled"
        stretch
        old={<OldInputDemo start="Jeg bor i et hus" />}
        new={<NewInputDemo start="Jeg bor i et hus" />}
      />
      <Pair
        name="dock-row"
        stretch
        old={
          <OldDockRow>
            <OldButton variant="secondary">Show answer</OldButton>
            <OldButton hint="↵">Continue</OldButton>
          </OldDockRow>
        }
        new={
          <NewDockRow>
            <NewButton variant="secondary">Show answer</NewButton>
            <NewButton hint="↵">Continue</NewButton>
          </NewDockRow>
        }
      />
      <Pair
        name="dock-row-single"
        stretch
        old={
          <OldDockRow>
            <OldButton hint="↵">Continue</OldButton>
          </OldDockRow>
        }
        new={
          <NewDockRow>
            <NewButton hint="↵">Continue</NewButton>
          </NewDockRow>
        }
      />
      <Pair
        name="dock-hint"
        stretch
        old={
          <>
            <OldDockHint hint="Say it out loud first.">
              <OldButton hint="↵">Continue</OldButton>
            </OldDockHint>
            <OldDockHint>
              <OldButton>No hint</OldButton>
            </OldDockHint>
          </>
        }
        new={
          <>
            <NewDockHint hint="Say it out loud first.">
              <NewButton hint="↵">Continue</NewButton>
            </NewDockHint>
            <NewDockHint>
              <NewButton>No hint</NewButton>
            </NewDockHint>
          </>
        }
      />
      <Pair
        name="exchange"
        stretch
        old={
          <>
            <OldStamp>Sentence 3 of 8</OldStamp>
            <OldAsk note="Say in Norwegian">I live in a house</OldAsk>
            <OldAsk>
              <OldDisplay text="et hus" split />
            </OldAsk>
            <OldMine>Jeg bor i en hus</OldMine>
            <OldRemark lead="Not yet.">
              «Hus» is neuter, so it takes «et».
            </OldRemark>
            <OldRemark lead="Good." center />
            <OldRemark lead="The rule." className="mt-1.5">
              The verb comes second, whatever comes first in the sentence.
            </OldRemark>
            <OldAiNote label="Why">
              In Norwegian a noun has a gender, and the article follows it.
            </OldAiNote>
            <OldAnswer
              audio={<OldAudioButton onClick={noop} />}
              good
              note="Right on the second try"
            >
              Jeg bor i et hus
            </OldAnswer>
            <OldAnswer
              audio={
                <OldAudioButton onClick={noop} className="size-10 lg:size-14" />
              }
              note="I live in a house"
            >
              Jeg bor i et hus med en veldig lang setning som brytes over flere
              linjer
            </OldAnswer>
          </>
        }
        new={
          <>
            <NewStamp>Sentence 3 of 8</NewStamp>
            <NewAsk note="Say in Norwegian">I live in a house</NewAsk>
            <NewAsk>
              <NewDisplay text="et hus" split />
            </NewAsk>
            <NewMine>Jeg bor i en hus</NewMine>
            <NewRemark lead="Not yet.">
              «Hus» is neuter, so it takes «et».
            </NewRemark>
            <NewRemark lead="Good." center />
            <NewRemark lead="The rule." style={overrides.remarkLower}>
              The verb comes second, whatever comes first in the sentence.
            </NewRemark>
            <NewAiNote label="Why">
              In Norwegian a noun has a gender, and the article follows it.
            </NewAiNote>
            <NewAnswer
              audio={<NewAudioButton onPlay={noop} />}
              good
              note="Right on the second try"
            >
              Jeg bor i et hus
            </NewAnswer>
            <NewAnswer
              audio={
                <NewAudioButton onPlay={noop} style={overrides.audioDock} />
              }
              note="I live in a house"
            >
              Jeg bor i et hus med en veldig lang setning som brytes over flere
              linjer
            </NewAnswer>
          </>
        }
      />
      <ChoicesPair name="choices-open" wrong={[]} answered={false} />
      <ChoicesPair
        name="choices-wrong"
        wrong={[QUIZ.options[1]]}
        answered={false}
      />
      <ChoicesPair name="choices-right" wrong={[QUIZ.options[2]]} answered />
      <Pair
        name="effects"
        stretch
        old={
          <button
            type="button"
            className="press rise text-fg bg-transparent px-0 py-[0.8125rem] text-left lg:py-[1.125rem]"
          >
            A row that answers a press
          </button>
        }
        new={
          <button
            type="button"
            {...stylex.props(effects.press, effects.rise, overrides.row)}
          >
            A row that answers a press
          </button>
        }
      />
    </div>
  );
}

const EXCHANGE = {
  old: (
    <>
      <OldStamp>Sentence 3 of 8</OldStamp>
      <OldAsk note="Say in Norwegian">I live in a house</OldAsk>
      <OldMine>Jeg bor i et hus</OldMine>
      <OldAnswer
        audio={<OldAudioButton onClick={noop} />}
        good
        note="Right first time"
      >
        Jeg bor i et hus
      </OldAnswer>
    </>
  ),
  new: (
    <>
      <NewStamp>Sentence 3 of 8</NewStamp>
      <NewAsk note="Say in Norwegian">I live in a house</NewAsk>
      <NewMine>Jeg bor i et hus</NewMine>
      <NewAnswer
        audio={<NewAudioButton onPlay={noop} />}
        good
        note="Right first time"
      >
        Jeg bor i et hus
      </NewAnswer>
    </>
  ),
};

const PAGE_BODY = {
  old: (
    <>
      <OldPageTitle title="God morgen" sub="14 minutes today" />
      <OldCard>
        <OldLabel>Hours</OldLabel>
        <OldProgress value={0.3} />
      </OldCard>
      <OldListCard>
        <div className="py-4">Text size</div>
        <div className="py-4">Voice</div>
      </OldListCard>
    </>
  ),
  new: (
    <>
      <NewPageTitle title="God morgen" sub="14 minutes today" />
      <NewCard>
        <NewLabel>Hours</NewLabel>
        <NewProgress value={0.3} />
      </NewCard>
      <NewListCard>
        <div {...stylex.props(layout.settingRow)}>Text size</div>
        <div {...stylex.props(layout.settingRow)}>Voice</div>
      </NewListCard>
    </>
  ),
};

/** The patterns that fill the window. Each is drawn alone, at `?page=<name>&side=old|new`. */
function FullPage({ page, side }: { page: string; side: Side }) {
  const old = side === "old";
  // The old sign-in screen reads the refusal from the address, so the new one is told the same way.
  const refused = new URLSearchParams(window.location.search).has("error");
  // The shell cases take the path that should look current from the address too.
  const at =
    new URLSearchParams(window.location.search).get("at") ?? "/gallery";

  switch (page) {
    case "shell": {
      return old ? (
        <OldShell>{PAGE_BODY.old}</OldShell>
      ) : (
        <NewShell
          destinations={DESTINATIONS}
          settingsTo="/settings"
          currentPath={at}
          account={null}
          link={ShellLink}
        >
          {PAGE_BODY.new}
        </NewShell>
      );
    }
    case "shell-narrow": {
      return old ? (
        <OldShell width="lg:max-w-[60rem]">{PAGE_BODY.old}</OldShell>
      ) : (
        <NewShell
          destinations={DESTINATIONS}
          settingsTo="/settings"
          currentPath={at}
          account={null}
          link={ShellLink}
          width="narrow"
        >
          {PAGE_BODY.new}
        </NewShell>
      );
    }
    case "shell-fill": {
      return old ? (
        <OldShell width="lg:max-w-none" fill>
          {PAGE_BODY.old}
        </OldShell>
      ) : (
        <NewShell
          destinations={DESTINATIONS}
          settingsTo="/settings"
          currentPath={at}
          account={null}
          link={ShellLink}
          width="full"
          fill
        >
          {PAGE_BODY.new}
        </NewShell>
      );
    }
    case "focus": {
      return old ? (
        <OldFocus
          block="review"
          title="Review"
          label="12 min left"
          progress={0.4}
          onClose={noop}
          dock={
            <OldDockRow>
              <OldButton variant="secondary">Show answer</OldButton>
              <OldButton hint="↵">Continue</OldButton>
            </OldDockRow>
          }
        >
          {EXCHANGE.old}
        </OldFocus>
      ) : (
        <NewFocus
          block="review"
          title="Review"
          label="12 min left"
          progress={0.4}
          onClose={noop}
          dock={
            <NewDockRow>
              <NewButton variant="secondary">Show answer</NewButton>
              <NewButton hint="↵">Continue</NewButton>
            </NewDockRow>
          }
        >
          {EXCHANGE.new}
        </NewFocus>
      );
    }
    case "focus-input": {
      return old ? (
        <OldFocus
          block="new"
          title="New words"
          label="3 of 8"
          progress={0.25}
          onClose={noop}
          dock={<OldInputDemo start="" />}
        >
          <OldAsk note="Say in Norwegian">I live in a house</OldAsk>
        </OldFocus>
      ) : (
        <NewFocus
          block="new"
          title="New words"
          label="3 of 8"
          progress={0.25}
          onClose={noop}
          dock={<NewInputDemo start="" />}
        >
          <NewAsk note="Say in Norwegian">I live in a house</NewAsk>
        </NewFocus>
      );
    }
    case "focus-wide": {
      return old ? (
        <OldFocus
          block="story"
          title="Story"
          label="Done"
          progress={1}
          onClose={noop}
          wide
          dock={
            <OldDockHint hint="That was the last one.">
              <OldButton hint="↵">Finish</OldButton>
            </OldDockHint>
          }
        >
          <OldCard>A summary in the wider column</OldCard>
        </OldFocus>
      ) : (
        <NewFocus
          block="story"
          title="Story"
          label="Done"
          progress={1}
          onClose={noop}
          wide
          dock={
            <NewDockHint hint="That was the last one.">
              <NewButton hint="↵">Finish</NewButton>
            </NewDockHint>
          }
        >
          <NewCard>A summary in the wider column</NewCard>
        </NewFocus>
      );
    }
    case "bare": {
      return old ? <OldBare /> : <NewBare />;
    }
    case "sign-in": {
      return old ? (
        <OldSignIn />
      ) : (
        <NewSignIn
          onSignIn={noop}
          failure={
            refused
              ? {
                  title: "Sign-in failed",
                  detail: "This Google account may not use this app.",
                }
              : null
          }
        />
      );
    }
    default: {
      return <p className="p-8">No such page: {page}</p>;
    }
  }
}

function Gallery() {
  const { page, side } = Route.useSearch();

  if (!SHOWN) {
    return null;
  }

  if (page && side) {
    return (
      <div style={{ display: "contents" }} {...{ [`data-${side}`]: page }}>
        <FullPage page={page} side={side} />
      </div>
    );
  }

  return (
    <OnlySide value={side ?? null}>
      <Components />
    </OnlySide>
  );
}
