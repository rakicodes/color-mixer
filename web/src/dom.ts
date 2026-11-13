type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown> & { class?: string };

/** Tiny element helper: h('button', { class: 'primary', onclick }, 'Go'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = String(value);
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2), value as EventListener);
    } else if (key in el) (el as unknown as Record<string, unknown>)[key] = value;
    else el.setAttribute(key, String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

/** Brief message at the bottom of the screen. */
export function toast(message: string, kind: 'error' | 'info' = 'error'): void {
  document.querySelector('.toast')?.remove();
  const el = h('div', { class: `toast ${kind}`, role: 'alert' }, message);
  document.body.append(el);
  setTimeout(() => el.remove(), 5000);
}

/**
 * Wraps an async event handler so failures show a message instead of
 * disappearing as unhandled rejections. While it runs, the button that
 * triggered it (if any) is disabled, so double taps don't repeat the action.
 */
export function withErrors<E extends Event>(fn: (e: E) => Promise<unknown> | unknown) {
  return async (e: E) => {
    const btn =
      e.currentTarget instanceof HTMLButtonElement
        ? e.currentTarget
        : e.currentTarget instanceof HTMLFormElement
          ? e.currentTarget.querySelector<HTMLButtonElement>('button[type="submit"]')
          : null;
    if (btn?.disabled) return;
    if (btn) btn.disabled = true;
    try {
      await fn(e);
    } catch (err) {
      console.error(err);
      toast(err instanceof Error ? err.message : String(err));
    } finally {
      if (btn) btn.disabled = false;
    }
  };
}

/** Native color picker plus a hex text box, kept in sync. */
export function colorField(initial: string, onChange?: (hex: string) => void) {
  const picker = h('input', { type: 'color', value: initial, class: 'color-input' });
  const text = h('input', {
    type: 'text',
    value: initial,
    class: 'hex-input',
    maxLength: 7,
    spellcheck: false,
    autocapitalize: 'off',
    'aria-label': 'Hex color',
  });
  const set = (hex: string) => {
    picker.value = hex;
    text.value = hex;
    onChange?.(hex);
  };
  picker.addEventListener('input', () => set(picker.value));
  text.addEventListener('input', () => {
    const v = text.value.trim();
    const hex = v.startsWith('#') ? v : `#${v}`;
    if (/^#[0-9a-f]{6}$/i.test(hex)) {
      picker.value = hex.toLowerCase();
      onChange?.(hex.toLowerCase());
    }
  });
  return {
    el: h('div', { class: 'color-field' }, picker, text),
    get value() {
      return picker.value;
    },
    set,
  };
}

export function swatch(hex: string, label?: string, size: 'sm' | 'lg' = 'lg'): HTMLElement {
  return h(
    'figure',
    { class: `swatch swatch-${size}` },
    h('div', { class: 'chip', style: { background: hex }, title: hex }),
    label ? h('figcaption', {}, label, h('small', {}, hex)) : null,
  );
}
