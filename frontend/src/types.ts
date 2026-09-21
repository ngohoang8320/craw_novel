export interface Chapter {
  chapter_id: string;
  title: string;
  url: string | null;
  order: number;
  locked: boolean;
  // True if the link wasn't in the catalog page itself but was recovered,
  // remembered from an earlier fetch, or entered by hand.
  recovered: boolean;
}

export interface VolumeLabel {
  title: string;
  before_order: number;
  cover_url: string | null;
}

export interface TocResponse {
  chapters: Chapter[];
  volumes: VolumeLabel[];
  novel_author: string | null;
}

export interface ContentItem {
  type: "text" | "image";
  text?: string;
  src?: string;
  // Set once the image has been downloaded to local disk at capture time -
  // the frontend doesn't use this directly, just needs to pass it through
  // unchanged so the EPUB build request (which re-sends these items) can
  // read the image from disk instead of re-fetching a possibly-dead URL.
  local_path?: string | null;
}

export interface CapturedChapter {
  chapter_id: string;
  captured: boolean;
  title?: string | null;
  is_complete?: boolean | null;
  page_count?: number | null;
  total_pages?: number | null;
  missing_pages?: number[];
  paragraph_count?: number | null;
  image_count?: number | null;
  char_count?: number | null;
  items?: ContentItem[] | null;
}

export interface CapturesResponse {
  chapters: CapturedChapter[];
}

export interface CrawlResult {
  chapter_id: string;
  order: number;
  title: string;
  page_count: number;
  total_pages: number | null;
  is_complete: boolean;
  missing_pages: number[];
  paragraph_count: number;
  image_count: number;
  char_count: number;
  items: ContentItem[];
  error: string | null;
}
