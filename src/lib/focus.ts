/** Ref callback that moves focus into a field when it appears (e.g. a form that just opened). */
export function focusOnMount(el: HTMLInputElement | null) {
  el?.focus();
}
