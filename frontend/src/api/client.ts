import type { CapturesResponse, TocResponse } from "../types";

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

export async function deleteCapture(novelId: string, chapterId: string): Promise<boolean> {
  const res = await fetch(
    `/api/novels/${encodeURIComponent(novelId)}/captures/${encodeURIComponent(chapterId)}`,
    { method: "DELETE" },
  );
  const data = await handleResponse<{ deleted: boolean }>(res);
  return data.deleted;
}
