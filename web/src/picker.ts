import { rgbToHex, sampleRegion, whiteBalance, type Rgb } from '@color-mixer/core';
import { loadImageToCanvas, pickImageFile } from './camera';
import { h } from './dom';

export interface PickResult {
  hex: string;
  /** False when the user skipped the white-paper step. */
  calibrated: boolean;
}

interface Point {
  x: number;
  y: number;
}

/**
 * Asks for a photo, then shows it full screen. Step 1: tap blank white paper.
 * Step 2: tap the color. Resolves with the white-balanced color, or null if
 * the user cancels.
 */
export async function pickColorFromPhoto(title: string): Promise<PickResult | null> {
  const file = await pickImageFile();
  if (!file) return null;
  const canvas = await loadImageToCanvas(file);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const radius = Math.max(4, Math.round(Math.max(canvas.width, canvas.height) / 160));

  return new Promise((resolve) => {
    let step: 'paper' | 'color' = 'paper';
    let paperPt: Point | null = null;
    let paper: Rgb | null = null;
    let colorPt: Point | null = null;
    let result: PickResult | null = null;

    const instruction = h('p', { class: 'picker-instruction' });
    const error = h('p', { class: 'picker-error' });
    const preview = h('div', { class: 'picker-preview' });
    const skipBtn = h('button', { onclick: () => setStep('color') }, 'No white paper in photo');
    const redoBtn = h(
      'button',
      {
        onclick: () => {
          paperPt = paper = colorPt = result = null;
          setStep('paper');
        },
      },
      'Redo paper',
    );
    const useBtn = h('button', { class: 'primary', disabled: true, onclick: () => close(result) }, 'Use this color');
    const cancelBtn = h('button', { onclick: () => close(null) }, 'Cancel');

    const overlay = h(
      'div',
      { class: 'picker' },
      h('div', { class: 'picker-bar' }, h('strong', {}, title), cancelBtn),
      instruction,
      h('div', { class: 'picker-canvas-wrap' }, canvas),
      error,
      h('div', { class: 'picker-actions' }, preview, skipBtn, redoBtn, useBtn),
    );

    function setStep(s: typeof step) {
      step = s;
      instruction.textContent =
        s === 'paper'
          ? '1. Tap a blank patch of white paper. This corrects for the lighting.'
          : '2. Tap the paint color. Tap again to try a different spot.';
      skipBtn.hidden = s !== 'paper';
      redoBtn.hidden = s === 'paper';
      useBtn.disabled = !result;
      if (!result) preview.replaceChildren();
      draw();
    }

    function draw() {
      ctx.putImageData(pixels, 0, 0);
      // Size markers in screen pixels so they stay visible when the photo is scaled down.
      const shown = canvas.getBoundingClientRect().width || canvas.width;
      const px = canvas.width / shown;
      const mark = (p: Point | null, color: string) => {
        if (!p) return;
        ctx.lineWidth = 3 * px;
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(radius, 14 * px), 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1.5 * px;
        ctx.strokeStyle = color;
        ctx.stroke();
      };
      mark(paperPt, '#000000');
      mark(colorPt, '#ff2d55');
    }

    function onTap(e: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      const pt = {
        x: ((e.clientX - rect.left) * canvas.width) / rect.width,
        y: ((e.clientY - rect.top) * canvas.height) / rect.height,
      };
      const rgb = sampleRegion(pixels, pt.x, pt.y, radius);
      error.textContent = '';
      if (step === 'paper') {
        paperPt = pt;
        paper = rgb;
        setStep('color');
        return;
      }
      try {
        const corrected = paper ? whiteBalance(rgb, paper) : rgb;
        colorPt = pt;
        result = { hex: rgbToHex(corrected), calibrated: !!paper };
        preview.replaceChildren(
          h('span', { class: 'chip', style: { background: result.hex } }),
          h('span', {}, result.hex),
        );
        setStep('color');
      } catch (err) {
        error.textContent = err instanceof Error ? err.message : String(err);
        paperPt = paper = null;
        setStep('paper');
      }
    }

    function close(value: PickResult | null) {
      overlay.remove();
      document.body.classList.remove('no-scroll');
      resolve(value);
    }

    canvas.addEventListener('pointerup', onTap);
    document.body.append(overlay);
    document.body.classList.add('no-scroll');
    setStep('paper');
  });
}
