// src/lib/compose-refs.ts
import * as React from 'react';

/**
 * Passes or assigns an arbitrary value to a ref function or object.
 *
 * @param ref
 * @param value
 */
export function assignRef<T>(ref: React.Ref<T> | undefined, value: T) {
  if (ref == null) return;
  if (typeof ref === 'function') {
    ref(value);
  } else {
    try {
      (ref as React.MutableRefObject<T>).current = value;
    } catch {
      throw new Error(`Cannot assign value "${value}" to ref "${ref}"`);
    }
  }
}

/**
 * Passes or assigns a value to multiple refs (typically used for composing local and forwarded refs).
 *
 * @param refs
 */
export function composeRefs<T>(...refs: (React.Ref<T> | undefined)[]) {
  return (node: T) => refs.forEach((ref) => assignRef(ref, node));
}

/**
 * A custom hook that composes multiple refs.
 *
 * @param refs
 */
export function useComposedRefs<T>(...refs: (React.Ref<T> | undefined)[]) {
  // Dynamic ref lists cannot be expressed as a static dependency literal.
  // eslint-disable-next-line react-hooks/use-memo,react-hooks/exhaustive-deps
  return React.useCallback(composeRefs(...refs), refs);
}
