import type { BlobKind } from "@norsk/ui";

/** What every task screen shows around the task itself. */
export interface Frame {
  block: BlobKind;
  title: string;
  label: string;
  progress: number;
  onClose: () => void;
}
