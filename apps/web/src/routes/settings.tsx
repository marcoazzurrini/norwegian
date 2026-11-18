import type { SyncStatus } from "@norsk/learner";
import { Button, ListCard, PageTitle, Segmented, effects } from "@norsk/ui";
import { color, radius, text } from "@norsk/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { createFileRoute } from "@tanstack/react-router";
import { Check, ChevronsUpDown, WifiOff } from "lucide-react";
import { useRef, useState } from "react";
import type { ReactNode } from "react";

import { AppShell } from "../components/app-shell";
import { learner, useMemory, useSettings, useSyncStatus } from "../learner";
import { speak, useVoices } from "../speech";

const LENGTHS = [
  [5, "5 min"],
  [15, "15 min"],
  [25, "25 min"],
  [40, "40 min"],
] as const;

const TARGETS = [
  [0.85, "85%"],
  [0.9, "90%"],
  [0.92, "92%"],
] as const;

const SIZES = [
  [0.9, "Small"],
  [1, "Normal"],
  [1.15, "Large"],
  [1.3, "Larger"],
] as const;

const SPEEDS = [
  [0.7, "Slow"],
  [0.9, "Normal"],
  [1, "Fast"],
] as const;

const styles = stylex.create({
  cards: {
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
  },
  row: {
    alignItems: { default: "flex-start", [stylex.env.desktop]: "center" },
    display: "flex",
    flexDirection: { default: "column", [stylex.env.desktop]: "row" },
    gap: { default: "0.75rem", [stylex.env.desktop]: "1.5rem" },
    justifyContent: { default: null, [stylex.env.desktop]: "space-between" },
    paddingBlock: { default: "1rem", [stylex.env.desktop]: "1.375rem" },
  },
  rowText: {
    maxWidth: "32.5rem",
  },
  rowTitle: {
    fontSize: { default: text.s17, [stylex.env.desktop]: text.s20 },
    fontWeight: 500,
  },
  rowHelp: {
    color: color.fg2,
    fontSize: { default: text.s14, [stylex.env.desktop]: text.s16 },
    lineHeight: 1.45,
  },
  rowControl: {
    flexShrink: 0,
    maxWidth: "100%",
  },
  voice: {
    alignItems: "center",
    display: "inline-flex",
    maxWidth: "100%",
    position: "relative",
  },
  voiceSelect: {
    appearance: "none",
    backgroundColor: color.control,
    borderRadius: radius.pill,
    borderWidth: 0,
    color: color.fg,
    fontSize: text.s15,
    fontWeight: 500,
    height: "2.625rem",
    maxWidth: "100%",
    paddingLeft: "1.125rem",
    paddingRight: "2.5rem",
  },
  voiceIcon: {
    color: color.fg3,
    height: "1rem",
    pointerEvents: "none",
    position: "absolute",
    right: "0.875rem",
    width: "1rem",
  },
  buttons: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.5rem",
  },
  status: {
    alignItems: "center",
    color: color.fg2,
    display: "flex",
    fontSize: { default: text.s14, [stylex.env.desktop]: text.s16 },
    gap: "0.5rem",
    margin: 0,
  },
  statusInCard: {
    paddingBottom: { default: "1rem", [stylex.env.desktop]: "1.375rem" },
  },
  mark: {
    flexShrink: 0,
    height: "1rem",
    width: "1rem",
  },
  good: { color: color.green },
  bad: { color: color.red },
});

interface RowProps {
  title: string;
  help?: string;
  children: ReactNode;
}

const Row = ({ title, help, children }: RowProps) => (
  <div {...stylex.props(styles.row)}>
    <div {...stylex.props(styles.rowText)}>
      <div {...stylex.props(styles.rowTitle)}>{title}</div>
      {help === undefined ? null : (
        <div {...stylex.props(styles.rowHelp)}>{help}</div>
      )}
    </div>
    <div {...stylex.props(styles.rowControl)}>{children}</div>
  </div>
);

/** One line on how the last sync went. */
const syncLine = ({ error, busy, lastOkAt }: SyncStatus): string => {
  if (error !== null) {
    return error;
  }

  if (busy) {
    return "Syncing now.";
  }

  if (lastOkAt === null) {
    return "Not synced yet.";
  }

  const time = new Date(lastOkAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `Last synced at ${time}.`;
};

/** Hands the learner a file with all their progress. */
const saveBackup = async () => {
  const backup = new Blob([await learner.exportBackup()], {
    type: "application/json",
  });

  const link = document.createElement("a");

  link.href = URL.createObjectURL(backup);
  link.download = `norsk-backup-${new Date().toLocaleDateString("sv-SE")}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
};

/** Replaces all progress with a backup file. Returns what to tell the learner. */
const restoreFrom = async (backup: File): Promise<string> => {
  try {
    await learner.restoreBackup(await backup.text());

    return "Backup restored.";
  } catch (error) {
    return error instanceof Error
      ? error.message
      : "The file could not be read.";
  }
};

/** Saves the speaking speed and lets the learner hear it. */
const changeRate = async (rate: number) => {
  await learner.updateSettings({ rate });
  await speak("Hei! Hvordan går det?");
};

const SettingsPage = () => {
  const memory = useMemory();
  const settings = useSettings();
  const voices = useVoices();
  const [firstVoice] = voices;
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const sync = useSyncStatus();

  const restore = async (backup: File | undefined) => {
    if (backup !== undefined) {
      setMessage(await restoreFrom(backup));
    }
  };

  const deleteEverything = async () => {
    await learner.startOver();
    setConfirmReset(false);
    setMessage("All progress deleted.");
  };

  return (
    <AppShell width="narrow">
      <PageTitle title="Settings" />
      <div {...stylex.props(styles.cards)}>
        <ListCard>
          <Row
            title="Session length"
            help="The length offered first on the Today screen."
          >
            <Segmented
              label="Session length"
              value={settings.minutes}
              options={LENGTHS}
              onPick={(minutes) => {
                learner.updateSettings({ minutes }).catch(reportError);
              }}
            />
          </Row>
          <Row
            title="Recall target"
            help="The share of reviews you should get right. Higher means more reviews."
          >
            <Segmented
              label="Recall target"
              value={settings.desiredRetention}
              options={TARGETS}
              onPick={(desiredRetention) => {
                learner.updateSettings({ desiredRetention }).catch(reportError);
              }}
            />
          </Row>
          <Row title="Text size">
            <Segmented
              label="Text size"
              value={settings.textScale}
              options={SIZES}
              onPick={(textScale) => {
                learner.updateSettings({ textScale }).catch(reportError);
              }}
            />
          </Row>
        </ListCard>

        <ListCard>
          <Row
            title="Voice"
            help={
              firstVoice === undefined
                ? "No Norwegian voice is installed on this device. Add one in the system settings."
                : "The Norwegian voice used for words and sentences."
            }
          >
            {firstVoice === undefined ? null : (
              <div {...stylex.props(styles.voice)}>
                <select
                  value={settings.voice ?? firstVoice.voiceURI}
                  onChange={(event) => {
                    learner
                      .updateSettings({ voice: event.target.value })
                      .catch(reportError);
                  }}
                  aria-label="Voice"
                  {...stylex.props(effects.press, styles.voiceSelect)}
                >
                  {voices.map((voice) => (
                    <option key={voice.voiceURI} value={voice.voiceURI}>
                      {voice.name}
                    </option>
                  ))}
                </select>
                <ChevronsUpDown {...stylex.props(styles.voiceIcon)} />
              </div>
            )}
          </Row>
          <Row title="Speaking speed">
            <Segmented
              label="Speaking speed"
              value={settings.rate}
              options={SPEEDS}
              onPick={(rate) => {
                changeRate(rate).catch(reportError);
              }}
            />
          </Row>
        </ListCard>

        <ListCard>
          <div>
            <Row
              title="Account"
              help={`Signed in as ${String(sync.account)}. This device shares its progress with your other signed-in devices.`}
            >
              <div {...stylex.props(styles.buttons)}>
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => {
                    learner.syncNow().catch(reportError);
                  }}
                >
                  Sync now
                </Button>
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => {
                    learner.signOut().catch(reportError);
                  }}
                >
                  Sign out
                </Button>
              </div>
            </Row>
            <output {...stylex.props(styles.status, styles.statusInCard)}>
              {sync.error === null ? (
                <Check {...stylex.props(styles.mark, styles.good)} />
              ) : (
                <WifiOff {...stylex.props(styles.mark, styles.bad)} />
              )}
              {syncLine(sync)}
            </output>
          </div>
        </ListCard>

        <ListCard>
          <Row
            title="Backup"
            help="Save a copy of your progress as a file. Restoring a file replaces the progress on every signed-in device."
          >
            <div {...stylex.props(styles.buttons)}>
              <Button
                variant="secondary"
                size="small"
                onClick={() => {
                  saveBackup().catch(reportError);
                }}
              >
                Save backup
              </Button>
              <Button
                variant="secondary"
                size="small"
                onClick={() => {
                  fileInput.current?.click();
                }}
              >
                Restore
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept="application/json"
                hidden
                onChange={(event) => {
                  restore(event.target.files?.[0]).catch(reportError);
                }}
              />
            </div>
          </Row>
          <Row
            title="Start over"
            help={`Deletes all progress on every signed-in device: ${memory.size} learned items.`}
          >
            {confirmReset ? (
              <div {...stylex.props(styles.buttons)}>
                <Button
                  variant="danger"
                  size="small"
                  onClick={() => {
                    deleteEverything().catch(reportError);
                  }}
                >
                  Delete everything
                </Button>
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => {
                    setConfirmReset(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="secondary"
                size="small"
                onClick={() => {
                  setConfirmReset(true);
                }}
              >
                Start over
              </Button>
            )}
          </Row>
        </ListCard>
        {message === "" ? null : (
          <output {...stylex.props(styles.status)}>
            <Check {...stylex.props(styles.mark, styles.good)} />
            {message}
          </output>
        )}
      </div>
    </AppShell>
  );
};

export const Route = createFileRoute("/settings")({ component: SettingsPage });
