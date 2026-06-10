// Polish plural form picker for interpolated counts.
// plural(1, "pozycja", "pozycje", "pozycji") → "pozycja"
// plural(3, ...) → "pozycje" (2–4, except 12–14), plural(5, ...) → "pozycji".
export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return few;
  return many;
}
