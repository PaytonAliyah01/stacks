import { useEffect, useRef, type RefObject } from 'react';

// A scanner types a whole code in well under a second; people can't keep
// keys this close together for 10+ digits.
const MAX_GAP_MS = 150;
const MIN_LENGTH = 10;

const TEXT_TYPES = new Set(['text', 'search', '']);

/**
 * The digit a key stands for. Uses the physical key as a fallback, so scans
 * still read right on keyboard layouts where the number row types other
 * characters without Shift (e.g. French or Belgian AZERTY: & é " ' ( …).
 */
export function digitOf(e: KeyboardEvent | React.KeyboardEvent): string | null {
  if (/^\d$/.test(e.key)) return e.key;
  const m = /^(?:Digit|Numpad)(\d)$/.exec(e.code);
  return m ? m[1] : null;
}

/** Change a text box's value in a way React notices. */
function setInputValue(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * USB and Bluetooth barcode scanners act like a keyboard: they type the
 * digits very fast and then press Enter (or Tab).
 *
 * The most reliable place for a scan to land is a text box, where the
 * browser takes every key in order. So when a digit arrives while the focus
 * is somewhere that doesn't take typing (the page, a button, a tab, a
 * dropdown, a checkbox), we move the focus to `scanBox` (an invisible input
 * the app owns) and put the digit there; the rest of the scan follows it in.
 *
 * In other text boxes (Search, the book form) people type for real, so there
 * we only step in when keys arrive at scanner speed: the digits are taken back
 * out of that box and handed to `onScan`.
 */
export function useBarcodeScanner(
  onScan: (code: string) => void,
  scanBox: RefObject<HTMLInputElement | null>,
  enabled = true,
) {
  const cb = useRef(onScan);
  cb.current = onScan;

  useEffect(() => {
    if (!enabled) return;
    let buffer = '';
    let typed = 0; // characters the burst put into a text box
    let last = -Infinity;

    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const box = scanBox.current;
      if (!el || el === box || el.dataset.scanInput !== undefined) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (el instanceof HTMLTextAreaElement || el.isContentEditable) return;
      const textBox = el instanceof HTMLInputElement && TEXT_TYPES.has(el.type) ? el : null;
      const otherInput =
        el instanceof HTMLInputElement && !textBox && !['checkbox', 'radio', 'button', 'submit'].includes(el.type);
      if (otherInput) return; // dates, numbers, prices

      const digit = digitOf(e);

      if (!textBox) {
        // Page, buttons, dropdowns, checkboxes: hand the scan to the scan box.
        if (digit && box) {
          e.preventDefault();
          box.focus();
          box.value += digit;
          box.dataset.last = String(e.timeStamp);
        }
        return;
      }

      // Inside a text box: judge by when the key was pressed, not when the
      // page got round to handling it, so a busy moment doesn't split a scan.
      const t = e.timeStamp;
      if (t - last > MAX_GAP_MS) {
        buffer = '';
        typed = 0;
      }
      last = t;

      if (e.key === 'Enter' || e.key === 'Tab') {
        const code = buffer;
        const inBox = typed;
        buffer = '';
        typed = 0;
        if (code.length >= MIN_LENGTH) {
          e.preventDefault();
          e.stopPropagation();
          setInputValue(textBox, textBox.value.slice(0, Math.max(0, textBox.value.length - inBox)));
          cb.current(code);
        }
        return;
      }
      if (digit || /^[Xx]$/.test(e.key)) {
        buffer += digit ?? 'X';
        typed++;
      } else if (e.key !== 'Shift') {
        buffer = '';
        typed = 0;
      }
    };

    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [enabled, scanBox]);
}
