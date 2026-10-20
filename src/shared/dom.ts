export function requireElement<T extends Element>(
  selector: string,
  elementType: new () => T,
  root: ParentNode = document,
): T {
  const element = root.querySelector(selector);
  if (!(element instanceof elementType)) {
    throw new Error(`Required element missing or invalid: ${selector}`);
  }
  return element;
}

export function requireContext2d(
  canvas: HTMLCanvasElement,
  options?: CanvasRenderingContext2DSettings,
): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', options);
  if (!context) throw new Error('Canvas 2D is unavailable');
  return context;
}
