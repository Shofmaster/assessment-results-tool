import { useState, type Dispatch, type SetStateAction } from 'react';

/**
 * A locally editable draft that follows an external value.
 *
 * The draft starts at `value` and can be changed freely (a dropdown the user is
 * operating, say). Whenever `value` itself changes -- a store write, a different
 * record loading -- the draft resets to it, discarding the local edit.
 *
 * The reset happens during render rather than in an effect, so there is no pass in
 * which the draft still shows the previous value. Comparing against the last `value`
 * seen, rather than against the draft, is what lets a user's edit survive: only a
 * change in the source resets it.
 */
export function useDraftSyncedTo<T>(value: T): [T, Dispatch<SetStateAction<T>>] {
  const [draft, setDraft] = useState<T>(value);
  const [prevValue, setPrevValue] = useState<T>(value);

  if (!Object.is(prevValue, value)) {
    setPrevValue(value);
    setDraft(value);
  }

  return [draft, setDraft];
}
