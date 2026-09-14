import { useEffect } from 'react';

/**
 * Keeps the conversation page inside the part of the screen the on-screen
 * keyboard leaves visible (B2, 2026-09-14).
 *
 * The shell (`.app`) is as tall as the layout viewport. iOS Safari never
 * shrinks that for the keyboard, only the visual viewport, so to show the
 * focused composer it pans the visible area down the page and the header
 * slides off the top. Chrome and Firefox on Android do the same by default;
 * index.html's `interactive-widget=resizes-content` asks them to shrink the
 * layout instead, which Safari ignores. So while a keyboard is up this pins
 * the shell to the visual viewport: `--vv-top`/`--vv-height` on <html> and
 * `html[data-keyboard]` (the rules live in styles/messages.css).
 *
 * It only pins when all of these hold:
 *  - a coarse pointer: desktops never attach a listener, so they stay a
 *    strict no-op;
 *  - a focused text field: the keyboard belongs to it;
 *  - scale ≈ 1: a pinch-zoomed viewport is also "shorter" and must not pin
 *    (the 16px inputs keep iOS from zooming on focus, see theme.css);
 *  - the visual viewport clearly shorter than the layout: a browser that
 *    honours resizes-content shrinks both, and nothing needs pinning there.
 *
 * Scoped to the page that mounts it (ConversationPage), because the shell's
 * other pages scroll inside `.page`, and moving the shell down by the pan
 * would push a field the browser just revealed back under the keyboard.
 * `top`, not `transform`: a transform would make the shell the containing
 * block of the fixed sheet inside it.
 */

// A browser toolbar collapsing changes the height by well under this.
const KEYBOARD_MIN_PX = 120;
const SCALE_TOLERANCE = 0.01;
const SHEET_FIELD_MARGIN = 12;

const NON_TEXT_INPUTS = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

function isTextField(el: Element | null): el is HTMLElement {
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) {
    return !NON_TEXT_INPUTS.has(el.type) && !el.readOnly && !el.disabled;
  }
  return el instanceof HTMLElement && el.isContentEditable;
}

/**
 * A sheet capped at 86% of a keyboard-sized backdrop is short enough to hide
 * its own focused field inside its scroller; scroll only the sheet, never
 * the document, which would start another pan.
 */
function revealInSheet(field: Element) {
  const sheet = field.closest('.sheet');
  if (!(sheet instanceof HTMLElement)) return;
  const f = field.getBoundingClientRect();
  const s = sheet.getBoundingClientRect();
  if (f.bottom > s.bottom - SHEET_FIELD_MARGIN) {
    sheet.scrollTop += f.bottom - s.bottom + SHEET_FIELD_MARGIN;
  } else if (f.top < s.top + SHEET_FIELD_MARGIN) {
    sheet.scrollTop -= s.top + SHEET_FIELD_MARGIN - f.top;
  }
}

export function useKeyboardViewport(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !window.matchMedia('(pointer: coarse)').matches) return;
    const root = document.documentElement;
    let frame = 0;
    let focusLeft = false;
    let pinned: { top: number; height: number; field: Element } | null = null;

    const unpin = () => {
      pinned = null;
      root.removeAttribute('data-keyboard');
      root.style.removeProperty('--vv-top');
      root.style.removeProperty('--vv-height');
    };

    const update = () => {
      frame = 0;
      const field = document.activeElement;
      const typing = isTextField(field);
      const unzoomed = Math.abs(vv.scale - 1) < SCALE_TOLERANCE;
      if (focusLeft) {
        focusLeft = false;
        // iOS 26.0 can leave the visual viewport panned (offsetTop > 0) after
        // the keyboard has closed; scroll back so the unpinned shell is not
        // drawn under a stale offset. A zoomed reader's pan is their own.
        if (!typing && unzoomed && (vv.offsetTop > 0 || window.scrollY > 0)) {
          window.scrollTo(0, 0);
        }
      }
      if (!typing || !unzoomed || root.clientHeight - vv.height <= KEYBOARD_MIN_PX) {
        if (pinned) unpin();
        return;
      }
      if (
        pinned &&
        pinned.top === vv.offsetTop &&
        pinned.height === vv.height &&
        pinned.field === field
      ) {
        return;
      }
      pinned = { top: vv.offsetTop, height: vv.height, field };
      root.style.setProperty('--vv-top', `${vv.offsetTop}px`);
      root.style.setProperty('--vv-height', `${vv.height}px`);
      root.setAttribute('data-keyboard', '');
      revealInSheet(field);
    };

    // Resize and scroll arrive many times per frame during the keyboard's
    // animation and a pan; one measurement per frame is enough.
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onFocusOut = () => {
      focusLeft = true;
      schedule();
    };

    vv.addEventListener('resize', schedule);
    vv.addEventListener('scroll', schedule);
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      vv.removeEventListener('resize', schedule);
      vv.removeEventListener('scroll', schedule);
      document.removeEventListener('focusin', schedule);
      document.removeEventListener('focusout', onFocusOut);
      unpin();
    };
  }, []);
}
