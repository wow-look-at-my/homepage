export interface UptimeKumaStatusPage {
  incident: {
    createdDate: string;
  } | null;
}

export interface UptimeKumaHeartbeat {
  heartbeatList: Record<string, { status: number }[]>;
  uptimeList: Record<string, number>;
}
