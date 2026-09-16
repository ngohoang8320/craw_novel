import type { VolumeLabel } from "../types";

/** Returns the title of the volume an item at this `order` falls under - the
 * last volume header (by `before_order`) at or before this order - or `null`
 * if the item comes before any volume header (or there are no volumes at all). */
export function volumeTitleForOrder(order: number, volumes: VolumeLabel[]): string | null {
  let title: string | null = null;
  for (const v of volumes) {
    if (v.before_order <= order) {
      title = v.title;
    } else {
      break; // volumes are in ascending before_order order
    }
  }
  return title;
}

/** Looks up the cover image URL for a volume by its title (as returned by
 * `volumeTitleForOrder`/`groupByVolume`), or null if there's no title or no
 * matching volume/cover. */
export function coverUrlForTitle(title: string | null, volumes: VolumeLabel[]): string | null {
  if (title === null) {
    return null;
  }
  return volumes.find((v) => v.title === title)?.cover_url ?? null;
}

/** Builds a chapter_id -> display number map, where each chapter's number
 * restarts at 1 within its volume group (based on `order`) - this is the
 * single source of truth for per-group numbering, so the Table of Contents
 * and Crawl Results panels always show the same number for the same
 * chapter (making it easy to spot which chapter in a group is missing from
 * results). Always compute this from the FULL chapter list, never from a
 * sparse subset, or numbers would renumber as chapters get added. */
export function buildGroupDisplayNumbers<T extends { chapter_id: string; order: number }>(
  chapters: T[],
  volumes: VolumeLabel[],
): Map<string, number> {
  const sorted = [...chapters].sort((a, b) => a.order - b.order);
  const map = new Map<string, number>();
  let volumeIdx = 0;
  let counter = 0;

  for (const chapter of sorted) {
    while (volumeIdx < volumes.length && volumes[volumeIdx].before_order <= chapter.order) {
      volumeIdx++;
      counter = 0;
    }
    counter++;
    map.set(chapter.chapter_id, counter);
  }

  return map;
}

export interface VolumeGroup<T> {
  title: string | null;
  items: T[];
}

/** Buckets `items` (each with a numeric `order`) into contiguous volume
 * groups, in order. Unlike a full chapter list, `items` may be a sparse
 * subset (e.g. only the chapters someone has actually crawled) - chapters
 * are still grouped by which volume they belong to, regardless of gaps. */
export function groupByVolume<T extends { order: number }>(
  items: T[],
  volumes: VolumeLabel[],
): VolumeGroup<T>[] {
  const sorted = [...items].sort((a, b) => a.order - b.order);
  const groups: VolumeGroup<T>[] = [];

  for (const item of sorted) {
    const title = volumeTitleForOrder(item.order, volumes);
    const last = groups[groups.length - 1];
    if (last && last.title === title) {
      last.items.push(item);
    } else {
      groups.push({ title, items: [item] });
    }
  }

  return groups;
}
