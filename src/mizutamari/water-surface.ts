import { requireContext2d } from '../shared/dom';
import { RIPPLE_LIFE } from './model';
import type { Pond, Ripple } from './model';

const MAX_REFRACTING_RIPPLES = 10;
const START_RADIUS = 16;
const MAX_REACH = 200;
const refractionBand = (radius: number) => 12 + radius * 0.047;
const maxRadius = START_RADIUS + MAX_REACH;
const patchSize = Math.ceil(2 * (maxRadius + refractionBand(maxRadius))) + 2;
const patch = requireContext2d(document.createElement('canvas'));
patch.canvas.width = patch.canvas.height = patchSize;

function refract(
  ctx: CanvasRenderingContext2D,
  gravel: HTMLImageElement,
  { x, y }: Ripple,
  radius: number,
  strength: number,
  width: number,
  height: number,
) {
  // Match object-fit: cover so the stretched stones meet the still background.
  const cover = Math.max(
    width / gravel.naturalWidth,
    height / gravel.naturalHeight,
  );
  const w = gravel.naturalWidth * cover;
  const h = gravel.naturalHeight * cover;
  const stretch = 1 + (9.5 * strength) / radius;
  const band = refractionBand(radius);
  const outer = radius + band;
  const left = Math.max(0, Math.floor(x - outer));
  const top = Math.max(0, Math.floor(y - outer));
  const patchWidth = Math.min(Math.ceil(width), Math.ceil(x + outer)) - left;
  const patchHeight = Math.min(Math.ceil(height), Math.ceil(y + outer)) - top;
  const localX = x - left;
  const localY = y - top;

  // Feather both sides of the refraction so there is no visible cut in the gravel.
  const mask = patch.createRadialGradient(
    localX,
    localY,
    radius - band,
    localX,
    localY,
    outer,
  );
  mask.addColorStop(0, 'transparent');
  mask.addColorStop(0.25, `rgba(0,0,0,${0.38 * strength})`);
  mask.addColorStop(0.5, `rgba(0,0,0,${0.94 * strength})`);
  mask.addColorStop(0.75, `rgba(0,0,0,${0.38 * strength})`);
  mask.addColorStop(1, 'transparent');
  patch.clearRect(0, 0, patchWidth, patchHeight);
  patch.fillStyle = mask;
  patch.fillRect(0, 0, patchWidth, patchHeight);
  patch.globalCompositeOperation = 'source-in';
  const sourceScale = cover * stretch;
  const sourceLeft = localX + ((width - w) / 2 - x) * stretch;
  const sourceTop = localY + ((height - h) / 2 - y) * stretch;
  patch.drawImage(
    gravel,
    -sourceLeft / sourceScale,
    -sourceTop / sourceScale,
    patchWidth / sourceScale,
    patchHeight / sourceScale,
    0,
    0,
    patchWidth,
    patchHeight,
  );
  patch.globalCompositeOperation = 'source-over';
  ctx.drawImage(
    patch.canvas,
    0,
    0,
    patchWidth,
    patchHeight,
    left,
    top,
    patchWidth,
    patchHeight,
  );
}

function drawWaveLight(
  ctx: CanvasRenderingContext2D,
  { x, y }: Ripple,
  radius: number,
  opacity: number,
) {
  const band = 11 + radius * 0.055;
  const outer = radius + band;
  const sheen = ctx.createRadialGradient(
    x,
    y,
    Math.max(0, radius - band),
    x,
    y,
    outer,
  );
  sheen.addColorStop(0, 'transparent');
  sheen.addColorStop(0.28, `rgba(237,254,247,${opacity * 0.4})`);
  sheen.addColorStop(0.46, `rgba(225,253,246,${opacity * 0.14})`);
  sheen.addColorStop(0.64, `rgba(24,77,86,${opacity * 0.36})`);
  sheen.addColorStop(0.8, `rgba(25,85,93,${opacity * 0.15})`);
  sheen.addColorStop(1, 'transparent');
  ctx.fillStyle = sheen;
  ctx.fillRect(x - outer, y - outer, outer * 2, outer * 2);
}

export function drawWaterSurface(
  ctx: CanvasRenderingContext2D,
  refraction: CanvasRenderingContext2D,
  gravel: HTMLImageElement,
  { width, height, ripples, reduced }: Pond,
  now: number,
) {
  refraction.clearRect(0, 0, width, height);
  const reach = Math.min(MAX_REACH, Math.min(width, height) * 0.48);
  const canRefract = gravel.complete && gravel.naturalWidth > 0;
  const firstRefracted = ripples.length - MAX_REFRACTING_RIPPLES;

  for (const [index, ripple] of ripples.entries()) {
    const age = Math.max(0, now - ripple.born);
    const progress = age / (reduced ? 500 : RIPPLE_LIFE);
    const opacity = Math.max(0, 1 - progress);
    if (!opacity) continue;
    const radius = reduced ? 48 : START_RADIUS + Math.sqrt(progress) * reach;
    if (!reduced && canRefract && index >= firstRefracted) {
      refract(refraction, gravel, ripple, radius, opacity, width, height);
    }
    drawWaveLight(ctx, ripple, radius, opacity);
    if (!reduced) drawWaveLight(ctx, ripple, radius * 0.7, opacity * 0.36);
  }
}
