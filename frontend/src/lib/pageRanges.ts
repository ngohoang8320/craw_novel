/** Compact a list of page numbers into a display string, e.g.
 * [3, 6, 7, 8, 12] -> "3, 6-8, 12". */
export function formatPageRanges(pages: number[]): string {
  if (pages.length === 0) {
    return "";
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0];
  let end = sorted[0];

  for (let i = 1; i <= sorted.length; i++) {
    if (i < sorted.length && sorted[i] === end + 1) {
      end = sorted[i];
      continue;
    }
    parts.push(start === end ? `${start}` : `${start}-${end}`);
    if (i < sorted.length) {
      start = sorted[i];
      end = sorted[i];
    }
  }

  return parts.join(", ");
}
