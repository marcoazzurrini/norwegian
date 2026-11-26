import type { BlobKind } from "@norsk/ui";

/** What every task screen shows around the task itself. */
export interface Frame {
  block: BlobKind;
  title: string;
  label: string;
  progress: number;
  /** Where the bar stood on the task before, so it fills from there. */
  progressFrom?: number;
  onClose: () => void;
}
