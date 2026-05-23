import type { ComponentType } from "react";

interface QueueEntryProps {
  title: string;
  activity: string;
  timeLeft: string;
  progress: number;
  size?: string;
}

declare const QueueEntry: ComponentType<QueueEntryProps>;
export default QueueEntry;
