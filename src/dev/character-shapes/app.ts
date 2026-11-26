import Matter from 'matter-js';
import type {
  Body as RigidBody,
  Constraint as DragConstraint,
  Vector,
} from 'matter-js';
import { characterCollisions } from '../../assets/characters/collision-data';
import type { CharacterId } from '../../assets/characters/collision-data';
import {
  createCharacterBody,
  drawCharacterArtwork,
} from '../../shared/character-physics';
import type { CharacterBody } from '../../shared/character-physics';
import { requireContext2d, requireElement } from '../../shared/dom';

const { Bodies, Body, Composite, Constraint, Engine, Query } = Matter;
const canvas = requireElement('#board', HTMLCanvasElement);
const character = requireElement('#character', HTMLSelectElement);
const outline = requireElement('#outline', HTMLInputElement);
const status = requireElement('#status', HTMLParagraphElement);
const context = requireContext2d(canvas);
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const artwork = import.meta.glob<string>('../../assets/characters/*/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});
const images = new Map<CharacterId, HTMLImageElement>();
const engine = Engine.create();
engine.gravity.scale = 0;
const characters: (CharacterBody & { image: HTMLImageElement })[] = [];
const initial: CharacterId[] = [
  'shapes/02-cyan-circle',
  'shapes/04-yellow-triangle',
  'aquarium/01-penguin-a',
  'aquarium/05-octopus',
];
const controller = new AbortController();
const { signal } = controller;
const STEP = 1000 / 60;
const MAX_CHARACTERS = 16;
const resistance = () => (motion.matches ? 0.1 : 0.025);
let width = 0;
let height = 0;
let walls: RigidBody[] = [];
let drag: { pointer: number; constraint: DragConstraint } | null = null;
let frame = 0;
let lastTime: number | null = null;
let elapsed = 0;

for (const id of Object.keys(characterCollisions) as CharacterId[]) {
  character.add(new Option(characterCollisions[id].name, id));
}

function add(id: CharacterId, position: Vector) {
  const size = Math.min(104, width / 3.6, height / 3);
  const item = createCharacterBody(id, position, size, {
    restitution: 0.78,
    friction: 0.1,
    frictionAir: resistance(),
  });
  let image = images.get(id);
  if (!image) {
    image = new Image();
    image.src = artwork[`../../assets/characters/${id}.svg`];
    images.set(id, image);
  }
  characters.push({ ...item, image });
  Composite.add(engine.world, item.body);
}

function endDrag() {
  if (!drag) return;
  const { pointer, constraint } = drag;
  drag = null;
  Composite.remove(engine.world, constraint);
  if (canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
}

function reset() {
  endDrag();
  for (const { body } of characters.splice(0))
    Composite.remove(engine.world, body);
  initial.forEach((id, index) =>
    add(id, {
      x: width * (index % 2 === 0 ? 0.27 : 0.73),
      y: height * (index < 2 ? 0.3 : 0.7),
    }),
  );
  status.textContent = '';
}

function addSelected() {
  if (characters.length >= MAX_CHARACTERS) {
    status.textContent = 'リセットすると、また追加できます。';
    return;
  }
  const id = character.value as CharacterId;
  const positions = [0.15, 0.38, 0.62, 0.85].flatMap((y) =>
    [0.18, 0.39, 0.61, 0.82].map((x) => ({ x: width * x, y: height * y })),
  );
  const distance = (point: Vector) =>
    Math.min(
      ...characters.map(({ body }) =>
        Math.hypot(point.x - body.position.x, point.y - body.position.y),
      ),
    );
  const position = positions.reduce((best, next) =>
    distance(next) > distance(best) ? next : best,
  );
  add(id, position);
  status.textContent = `${characterCollisions[id].name}を追加しました。`;
}

function draw() {
  context.clearRect(0, 0, width, height);
  for (const item of characters) {
    if (item.image.complete && item.image.naturalWidth) {
      drawCharacterArtwork(context, item, item.image);
    }
  }
  if (!outline.checked) return;
  context.fillStyle = '#00e7ff42';
  context.strokeStyle = '#007080';
  context.lineWidth = 2.5;
  for (const { body } of characters) {
    const parts = body.parts.length === 1 ? body.parts : body.parts.slice(1);
    for (const part of parts) {
      context.beginPath();
      context.moveTo(part.vertices[0].x, part.vertices[0].y);
      for (const { x, y } of part.vertices.slice(1)) context.lineTo(x, y);
      context.closePath();
      context.fill();
      context.stroke();
    }
  }
}

function resize() {
  endDrag();
  const previousWidth = width;
  const previousHeight = height;
  width = canvas.clientWidth;
  height = canvas.clientHeight;
  const ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  for (const wall of walls) Composite.remove(engine.world, wall);
  const t = 80;
  const wall = (x: number, y: number, w: number, h: number) =>
    Bodies.rectangle(x, y, w, h, { isStatic: true, restitution: 0.72 });
  walls = [
    wall(width / 2, -t / 2, width + 2 * t, t),
    wall(width / 2, height + t / 2, width + 2 * t, t),
    wall(-t / 2, height / 2, t, height + 2 * t),
    wall(width + t / 2, height / 2, t, height + 2 * t),
  ];
  Composite.add(engine.world, walls);
  for (const { body } of characters) {
    Body.setPosition(body, {
      x: (body.position.x / previousWidth) * width,
      y: (body.position.y / previousHeight) * height,
    });
    Body.translate(body, {
      x:
        Math.max(0, -body.bounds.min.x) -
        Math.max(0, body.bounds.max.x - width),
      y:
        Math.max(0, -body.bounds.min.y) -
        Math.max(0, body.bounds.max.y - height),
    });
  }
  draw();
}

function pointerPosition(e: PointerEvent) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: Math.max(
      0,
      Math.min(width, e.clientX - bounds.left - canvas.clientLeft),
    ),
    y: Math.max(0, Math.min(height, e.clientY - bounds.top - canvas.clientTop)),
  };
}

canvas.addEventListener(
  'pointerdown',
  (event) => {
    if (drag || event.button !== 0) return;
    const point = pointerPosition(event);
    const body = Query.point(
      characters.map((item) => item.body),
      point,
    ).at(-1);
    if (!body) return;
    canvas.setPointerCapture(event.pointerId);
    const constraint = Constraint.create({
      pointA: point,
      bodyB: body,
      pointB: { x: point.x - body.position.x, y: point.y - body.position.y },
      length: 0,
      stiffness: 0.24,
      damping: 0.18,
    });
    drag = { pointer: event.pointerId, constraint };
    Composite.add(engine.world, constraint);
  },
  { signal },
);
canvas.addEventListener(
  'pointermove',
  (event) => {
    if (drag?.pointer === event.pointerId)
      drag.constraint.pointA = pointerPosition(event);
  },
  { signal },
);
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  canvas.addEventListener(
    type,
    (event) => {
      if (drag?.pointer === (event as PointerEvent).pointerId) endDrag();
    },
    { signal },
  );
}

function tick(now: number) {
  elapsed += Math.min(now - (lastTime ?? now), STEP * 4);
  lastTime = now;
  while (elapsed >= STEP) {
    Engine.update(engine, STEP);
    elapsed -= STEP;
  }
  draw();
  frame = requestAnimationFrame(tick);
}

function stop() {
  cancelAnimationFrame(frame);
  frame = 0;
  elapsed = 0;
  lastTime = null;
  endDrag();
}

function start() {
  if (!frame && !document.hidden) frame = requestAnimationFrame(tick);
}

requireElement('#add', HTMLButtonElement).addEventListener(
  'click',
  addSelected,
  { signal },
);
requireElement('#reset', HTMLButtonElement).addEventListener('click', reset, {
  signal,
});
motion.addEventListener(
  'change',
  () => {
    for (const { body } of characters) body.frictionAir = resistance();
  },
  { signal },
);
window.addEventListener('blur', endDrag, { signal });
document.addEventListener(
  'visibilitychange',
  () => {
    if (document.hidden) stop();
    else start();
  },
  { signal },
);
window.addEventListener('pageshow', start, { signal });
const observer = new ResizeObserver(resize);
window.addEventListener(
  'pagehide',
  (event) => {
    stop();
    if (!event.persisted) {
      observer.disconnect();
      controller.abort();
    }
  },
  { signal },
);

resize();
reset();
observer.observe(canvas);
start();
