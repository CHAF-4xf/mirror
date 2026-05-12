/** En-US memo header date: "May 11, 2026" — matches Renderer output style. */
export function formatMemoHeaderDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}
