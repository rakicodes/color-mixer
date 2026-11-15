import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/errors', () => ({ reportError: vi.fn(), setErrorContext: vi.fn(), initErrorReporting: vi.fn() }));

import { colorField, h, swatch, toast, withErrors } from '../src/dom';
import { reportError } from '../src/errors';
import { flush, typeInto } from './helpers';

beforeEach(() => document.body.replaceChildren());
afterEach(() => vi.useRealTimers());

describe('h()', () => {
  it('sets class, style, properties, attributes and listeners; skips empty values', () => {
    const onclick = vi.fn();
    const el = h(
      'button',
      { class: 'primary', style: { color: 'red' }, disabled: true, 'aria-label': 'Go', onclick, title: undefined, hidden: false },
      'Go',
      null,
      false,
      undefined,
      3,
    );
    expect(el.className).toBe('primary');
    expect(el.style.color).toBe('red');
    expect(el.disabled).toBe(true);
    expect(el.getAttribute('aria-label')).toBe('Go');
    expect(el.hasAttribute('title')).toBe(false);
    expect(el.hidden).toBe(false);
    expect(el.textContent).toBe('Go3');
    el.disabled = false;
    el.click();
    expect(onclick).toHaveBeenCalledOnce();
  });
});

describe('ERR-01: toast', () => {
  it('ERR-01: shows one alert at a time', () => {
    toast('first');
    toast('second', 'info');
    const toasts = document.querySelectorAll('.toast');
    expect(toasts).toHaveLength(1);
    expect(toasts[0].textContent).toBe('second');
    expect(toasts[0].getAttribute('role')).toBe('alert');
    expect(toasts[0].classList.contains('info')).toBe(true);
  });

  it('ERR-01: defaults to the error style and disappears after 5 seconds', () => {
    vi.useFakeTimers();
    toast('oops');
    expect(document.querySelector('.toast.error')).not.toBeNull();
    vi.advanceTimersByTime(4999);
    expect(document.querySelector('.toast')).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(document.querySelector('.toast')).toBeNull();
  });
});

describe('ERR-01: withErrors', () => {
  it('ERR-01: shows the error message as a toast and reports it', async () => {
    const btn = h('button', { onclick: withErrors(async () => { throw new Error('Disk full'); }) }, 'Save');
    document.body.append(btn);
    btn.click();
    await flush();
    expect(document.querySelector('.toast')?.textContent).toBe('Disk full');
    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Disk full' }));
  });

  it('ERR-01: shows non-Error throws as text', async () => {
    const btn = h('button', { onclick: withErrors(async () => { throw 'plain string'; }) }, 'Save');
    document.body.append(btn);
    btn.click();
    await flush();
    expect(document.querySelector('.toast')?.textContent).toBe('plain string');
  });

  it('ERR-01: disables the button while running, so double taps do nothing', async () => {
    let release!: () => void;
    const fn = vi.fn(() => new Promise<void>((r) => (release = r)));
    const handler = withErrors(fn);
    const btn = h('button', { onclick: handler }, 'Save');
    document.body.append(btn);
    btn.click();
    expect(btn.disabled).toBe(true);
    // A second tap that races in before the browser blocks it.
    await handler({ currentTarget: btn } as unknown as Event);
    expect(fn).toHaveBeenCalledOnce();
    release();
    await flush();
    expect(btn.disabled).toBe(false);
  });

  it('ERR-01: disables a form\'s submit button while submitting', async () => {
    let release!: () => void;
    const submit = h('button', { type: 'submit' }, 'Add');
    const form = h('form', { onsubmit: withErrors((e: Event) => { e.preventDefault(); return new Promise<void>((r) => (release = r)); }) }, submit);
    document.body.append(form);
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(submit.disabled).toBe(true);
    release();
    await flush();
    expect(submit.disabled).toBe(false);
  });
});

describe('COL: colorField', () => {
  it('COL: picker changes update the text box and notify', () => {
    const onChange = vi.fn();
    const f = colorField('#1f3fa8', onChange);
    const [picker, textBox] = f.el.querySelectorAll('input');
    typeInto(picker, '#c2185b');
    expect(textBox.value).toBe('#c2185b');
    expect(f.value).toBe('#c2185b');
    expect(onChange).toHaveBeenCalledWith('#c2185b');
  });

  it.each(['c2185b', '#C2185B', ' c2185b '])('COL: typed hex %j is accepted', (typed) => {
    const onChange = vi.fn();
    const f = colorField('#1f3fa8', onChange);
    const textBox = f.el.querySelectorAll('input')[1];
    typeInto(textBox, typed);
    expect(f.value).toBe('#c2185b');
    expect(onChange).toHaveBeenLastCalledWith('#c2185b');
  });

  it.each(['#c218', 'blue', '#gggggg'])('COL: invalid typed hex %j is ignored', (typed) => {
    const onChange = vi.fn();
    const f = colorField('#1f3fa8', onChange);
    typeInto(f.el.querySelectorAll('input')[1], typed);
    expect(f.value).toBe('#1f3fa8');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('COL: hex box is limited to 7 characters and labelled', () => {
    const textBox = colorField('#1f3fa8').el.querySelectorAll('input')[1];
    expect(textBox.maxLength).toBe(7);
    expect(textBox.getAttribute('aria-label')).toBe('Hex color');
  });

  it('COL: set() updates both inputs and notifies', () => {
    const onChange = vi.fn();
    const f = colorField('#1f3fa8', onChange);
    f.set('#123456');
    const [picker, textBox] = f.el.querySelectorAll('input');
    expect([picker.value, textBox.value]).toEqual(['#123456', '#123456']);
    expect(onChange).toHaveBeenCalledWith('#123456');
  });
});

describe('swatch', () => {
  it('shows the color with an optional label and hex', () => {
    const s = swatch('#123456', 'Target');
    expect((s.querySelector('.chip') as HTMLElement).title).toBe('#123456');
    expect(s.querySelector('figcaption')?.textContent).toBe('Target#123456');
    expect(swatch('#123456').querySelector('figcaption')).toBeNull();
  });
});
