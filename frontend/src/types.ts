export interface Chapter {
  chapter_id: string;
  title: string;
  url: string | null;
  order: number;
  locked: boolean;
}

export interface TocResponse {
  chapters: Chapter[];
}

export interface CapturedChapter {
  chapter_id: string;
  captured: boolean;
  title?: string | null;
  is_complete?: boolean | null;
  page_count?: number | null;
  paragraph_count?: number | null;
  char_count?: number | null;
  paragraphs?: string[] | null;
}

export interface CapturesResponse {
  chapters: CapturedChapter[];
}

export interface CrawlResult {
  chapter_id: string;
  order: number;
  title: string;
  page_count: number;
  paragraph_count: number;
  char_count: number;
  paragraphs: string[];
  error: string | null;
}
