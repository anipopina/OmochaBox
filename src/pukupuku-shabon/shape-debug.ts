import type { Body } from 'matter-js';

export function createShapeDebug(field: HTMLElement, wallInset: number) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return;
  canvas.className = 'shabon-shape-debug';
  canvas.setAttribute('aria-hidden', 'true');
  field.append(canvas);
  let width = 0;
  let height = 0;

  return {
    resize(fieldWidth: number, fieldHeight: number) {
      width = fieldWidth;
      height = fieldHeight;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    },
    draw(characters: readonly { body: Body }[]) {
      context.clearRect(0, 0, width, height);
      context.lineWidth = 2;
      context.strokeStyle = '#173b55';
      context.strokeRect(
        wallInset,
        wallInset,
        width - 2 * wallInset,
        height - 2 * wallInset,
      );

      context.beginPath();
      for (const { body } of characters) {
        // The parent of a compound body is a hull. Its parts are the colliders.
        const parts =
          body.parts.length === 1 ? body.parts : body.parts.slice(1);
        for (const { vertices } of parts) {
          context.moveTo(vertices[0].x, vertices[0].y);
          for (const { x, y } of vertices.slice(1)) context.lineTo(x, y);
          context.closePath();
        }
      }
      context.fillStyle = '#13fde647';
      context.fill();
      context.lineWidth = 4;
      context.strokeStyle = '#104650';
      context.stroke();
      context.lineWidth = 2;
      context.strokeStyle = '#38ffe7';
      context.stroke();
    },
    destroy() {
      canvas.remove();
    },
  };
}
