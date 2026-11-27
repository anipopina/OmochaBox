import Matter from 'matter-js';
import type {
  Body as RigidBody,
  Constraint as DragConstraint,
} from 'matter-js';
import { characterCollisions } from '../assets/characters/collision-data';
import coralSquare from '../assets/characters/shapes/01-coral-square.svg';
import coralStar from '../assets/characters/shapes/05-coral-star.svg';
import cyanCircle from '../assets/characters/shapes/02-cyan-circle.svg';
import mintRectangle from '../assets/characters/shapes/06-mint-rectangle.svg';
import purpleCircle from '../assets/characters/shapes/03-purple-circle.svg';
import yellowTriangle from '../assets/characters/shapes/04-yellow-triangle.svg';
import { createCharacterBody } from '../shared/character-physics';
import type { CharacterBody } from '../shared/character-physics';
import { createShapeDebug } from './shape-debug';

const { Bodies, Body, Composite, Constraint, Engine, Sleeping } = Matter;
const characters = [
  { id: 'shapes/01-coral-square', url: coralSquare },
  { id: 'shapes/02-cyan-circle', url: cyanCircle },
  { id: 'shapes/03-purple-circle', url: purpleCircle },
  { id: 'shapes/04-yellow-triangle', url: yellowTriangle },
  { id: 'shapes/05-coral-star', url: coralStar },
  { id: 'shapes/06-mint-rectangle', url: mintRectangle },
] as const;
const STEP = 1000 / 60;
const MAX_CHARACTERS = 12;
const MAX_EXITING = 18;
const WALL_INSET = 8;

export function bubbleCharacter(diameter: number) {
  if (Math.random() >= 1 / 3) return;
  const { id, url } = characters[Math.floor(Math.random() * characters.length)];
  const image = new Image();
  const size = Math.round(diameter * 0.66);
  image.src = url;
  image.alt = '';
  image.draggable = false;
  image.width = size;
  const { name, viewBox } = characterCollisions[id];
  image.height = Math.round((size * viewBox[3]) / viewBox[2]);
  return { id, image, size, name };
}

type Passenger = NonNullable<ReturnType<typeof bubbleCharacter>>;
type Character = CharacterBody & { element: HTMLSpanElement };

export function createCharacterField(
  field: HTMLElement,
  layer: HTMLElement,
  reduced: MediaQueryList,
  wake: () => void,
) {
  const engine = Engine.create({ enableSleeping: true });
  const items: Character[] = [];
  const debug =
    new URLSearchParams(location.search).get('debug') === 'shapes'
      ? createShapeDebug(field, WALL_INSET)
      : undefined;
  const exiting = new Set<HTMLElement>();
  const controller = new AbortController();
  const { signal } = controller;
  let walls: RigidBody[] = [];
  let width = 0;
  let height = 0;
  let elapsed = 0;
  let drag: { pointer: number; constraint: DragConstraint } | undefined;

  function draw({ element, body, artwork }: Character) {
    element.style.transform =
      `translate(${body.position.x}px, ${body.position.y}px) ` +
      `rotate(${body.angle}rad) translate(${artwork.x}px, ${artwork.y}px)`;
  }

  function endDrag() {
    if (!drag) return;
    const { pointer, constraint } = drag;
    drag = undefined;
    Composite.remove(engine.world, constraint);
    if (layer.hasPointerCapture(pointer)) layer.releasePointerCapture(pointer);
  }

  function pointerPosition(event: PointerEvent) {
    const { left, top } = field.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(width, event.clientX - left)),
      y: Math.max(0, Math.min(height, event.clientY - top)),
    };
  }

  function retire({ body, element }: Character) {
    if (drag?.constraint.bodyB === body) endDrag();
    Composite.remove(engine.world, body);
    if (exiting.size === MAX_EXITING) {
      const oldest = exiting.values().next().value!;
      oldest.remove();
      exiting.delete(oldest);
    }
    exiting.add(element);
    element.classList.add('leaving');
    element.addEventListener(
      'animationend',
      () => {
        exiting.delete(element);
        element.remove();
      },
      { once: true },
    );
  }

  function release(passenger: Passenger, x: number, y: number) {
    if (items.length === MAX_CHARACTERS) retire(items.shift()!);
    const { id, image, size } = passenger;
    const item = createCharacterBody(id, { x, y }, size, {
      restitution: reduced.matches ? 0 : 0.35,
      frictionAir: reduced.matches ? 0.09 : 0.035,
    });
    const { body, artwork } = item;
    Body.translate(body, {
      x: -artwork.x - artwork.width / 2,
      y: -artwork.y - artwork.height / 2,
    });
    const element = document.createElement('span');
    element.className = 'shabon-character';
    element.style.width = `${artwork.width}px`;
    element.style.height = `${artwork.height}px`;
    element.append(image);
    const character = { ...item, element };
    draw(character);
    layer.append(element);
    items.push(character);
    Composite.add(engine.world, body);
    debug?.draw(items);
    element.addEventListener('pointerdown', (event) => {
      if (drag || event.button !== 0 || field.classList.contains('paused'))
        return;
      event.preventDefault();
      const point = pointerPosition(event);
      layer.setPointerCapture(event.pointerId);
      Sleeping.set(body, false);
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
      wake();
    });
    wake();
  }

  layer.addEventListener(
    'pointermove',
    (event) => {
      if (drag?.pointer === event.pointerId)
        drag.constraint.pointA = pointerPosition(event);
    },
    { signal },
  );
  for (const type of [
    'pointerup',
    'pointercancel',
    'lostpointercapture',
  ] as const) {
    layer.addEventListener(
      type,
      (event) => {
        if (drag?.pointer === (event as PointerEvent).pointerId) endDrag();
      },
      { signal },
    );
  }

  function resize() {
    endDrag();
    const oldWidth = width;
    const oldHeight = height;
    width = field.clientWidth;
    height = field.clientHeight;
    debug?.resize(width, height);
    Composite.remove(engine.world, walls);
    const t = 80;
    const wall = (x: number, y: number, w: number, h: number) =>
      Bodies.rectangle(x, y, w, h, { isStatic: true });
    walls = [
      wall(width / 2, WALL_INSET - t / 2, width + 2 * t, t),
      wall(width / 2, height - WALL_INSET + t / 2, width + 2 * t, t),
      wall(WALL_INSET - t / 2, height / 2, t, height),
      wall(width - WALL_INSET + t / 2, height / 2, t, height),
    ];
    Composite.add(engine.world, walls);
    for (const item of items) {
      const { body } = item;
      Body.setPosition(body, {
        x: (body.position.x / oldWidth) * width,
        y: (body.position.y / oldHeight) * height,
      });
      draw(item);
      Sleeping.set(body, false);
    }
    debug?.draw(items);
    if (items.length) wake();
  }

  function update(delta: number) {
    if (!drag && items.every(({ body }) => body.isSleeping)) {
      elapsed = 0;
      return false;
    }
    elapsed += delta;
    while (elapsed >= STEP) {
      Engine.update(engine, STEP);
      elapsed -= STEP;
    }
    for (const item of items) draw(item);
    debug?.draw(items);
    return true;
  }

  function gravity(x: number, y: number) {
    if (Math.hypot(x - engine.gravity.x, y - engine.gravity.y) < 0.04) return;
    engine.gravity.x = x;
    engine.gravity.y = y;
    for (const { body } of items) Sleeping.set(body, false);
    if (items.length) wake();
  }

  function pause() {
    elapsed = 0;
    endDrag();
  }

  reduced.addEventListener(
    'change',
    () => {
      for (const { body } of items) {
        body.restitution = reduced.matches ? 0 : 0.35;
        body.frictionAir = reduced.matches ? 0.09 : 0.035;
      }
    },
    { signal },
  );
  resize();
  return {
    release,
    resize,
    update,
    gravity,
    pause,
    destroy() {
      pause();
      controller.abort();
      Composite.clear(engine.world, false);
      Engine.clear(engine);
      items.length = 0;
      exiting.clear();
      layer.replaceChildren();
      debug?.destroy();
    },
  };
}
