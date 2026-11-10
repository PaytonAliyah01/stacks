/** A copy of `o` without the key `k` (handy for dropping a field before saving). */
export function without<T extends object, K extends keyof T>(o: T, k: K): Omit<T, K> {
  const copy: Partial<T> = { ...o };
  delete copy[k];
  return copy as Omit<T, K>;
}
