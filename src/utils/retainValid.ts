/**
 * Helpers for keeping a user's selection consistent with the items still on screen.
 *
 * The alternative is an effect that rewrites the stored selection every time the
 * underlying list changes. Deriving instead means the stored selection may briefly
 * hold ids that no longer exist, but nothing ever reads them -- and there is no
 * render where the UI shows a selection referring to a vanished row.
 *
 * Both helpers return the input unchanged when nothing was dropped, so callers keep
 * a stable identity for downstream memo dependencies.
 */

/** Selected ids, minus any that are no longer valid. */
export function retainValid<T>(selected: ReadonlySet<T>, valid: ReadonlySet<T>): ReadonlySet<T> {
  let dropped = false;
  for (const id of selected) {
    if (!valid.has(id)) {
      dropped = true;
      break;
    }
  }
  if (!dropped) return selected;

  const next = new Set<T>();
  for (const id of selected) {
    if (valid.has(id)) next.add(id);
  }
  return next;
}

/** Record entries, minus any whose key is no longer valid. */
export function retainValidKeys<V>(
  record: Readonly<Record<string, V>>,
  valid: ReadonlySet<string>,
): Readonly<Record<string, V>> {
  let dropped = false;
  for (const key of Object.keys(record)) {
    if (!valid.has(key)) {
      dropped = true;
      break;
    }
  }
  if (!dropped) return record;

  const out: Record<string, V> = {};
  for (const [key, value] of Object.entries(record)) {
    if (valid.has(key)) out[key] = value;
  }
  return out;
}
