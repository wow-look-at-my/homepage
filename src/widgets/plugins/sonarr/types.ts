export interface SonarrSeries {
  title: string;
  id: number;
}

export interface SonarrQueue {
  totalRecords: number;
}

export interface SonarrWantedMissing {
  totalRecords: number;
}

export interface SonarrQueueDetail {
  trackedDownloadState: string;
  trackedDownloadStatus: string;
  timeLeft: string;
  size: number;
  sizeLeft: number;
  seriesId: number;
  episodeTitle: string;
  episodeId: number;
  status: string;
}
