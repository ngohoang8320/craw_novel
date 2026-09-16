import type { CapturesResponse, ContentItem, TocResponse } from "../types";

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      // response body wasn't JSON, keep statusText
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export async function fetchToc(novelId: string): Promise<TocResponse> {
  const res = await fetch(`/api/novels/${encodeURIComponent(novelId)}/toc`);
  return handleResponse<TocResponse>(res);
}

export async function fetchCaptures(
  novelId: string,
  chapterIds: string[],
): Promise<CapturesResponse> {
  const params = new URLSearchParams({ chapter_ids: chapterIds.join(",") });
  const res = await fetch(
    `/api/novels/${encodeURIComponent(novelId)}/captures?${params.toString()}`,
  );
  return handleResponse<CapturesResponse>(res);
}

/** URL to load a chapter image through the backend proxy, which fetches it
 * with the Referer the image CDN's hotlink protection expects (see
 * backend/app/routers/image_proxy.py) - loading `src` directly from this
 * app's own origin would get a 403. */
export function imageProxyUrl(src: string): string {
  return `/api/image-proxy?url=${encodeURIComponent(src)}`;
}

export interface EpubChapterInput {
  title: string;
  order: number;
  items: ContentItem[];
}

/** Builds an EPUB from the given chapters and returns it as a downloadable Blob. */
export async function buildEpub(
  novelId: string,
  novelTitle: string,
  novelAuthor: string,
  chapters: EpubChapterInput[],
  coverUrl?: string | null,
): Promise<Blob> {
  const res = await fetch(`/api/novels/${encodeURIComponent(novelId)}/epub`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      novel_title: novelTitle,
      novel_author: novelAuthor,
      cover_url: coverUrl ?? null,
      chapters,
    }),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      // response body wasn't JSON, keep statusText
    }
    throw new Error(detail);
  }
  return res.blob();
}

export async function deleteCapture(novelId: string, chapterId: string): Promise<boolean> {
  const res = await fetch(
    `/api/novels/${encodeURIComponent(novelId)}/captures/${encodeURIComponent(chapterId)}`,
    { method: "DELETE" },
  );
  const data = await handleResponse<{ deleted: boolean }>(res);
  return data.deleted;
}
