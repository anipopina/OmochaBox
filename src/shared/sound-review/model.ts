import { validateConfig, type ReviewConfig } from './catalogue';
export type Choice = string | 'pending' | 'redo' | 'none';
export interface Decision {
  choice: Choice;
  note: string;
  singleConfirmed: boolean;
  gameConfirmed: boolean;
}
export interface Review<S extends string = string> {
  format: 'omochabox-sound-review';
  version: 2;
  toy: string;
  catalog: string;
  updatedAt: string;
  scenes: Record<S, Decision>;
  additions: SoundRequest[];
}
export interface SoundRequest {
  id: string;
  scene: string;
  timing: string;
  sound: string;
  note: string;
}
export const MAX_REQUESTS = 20;

export function createReviewModel<S extends string>(
  config: ReviewConfig<S>,
  options: {
    normalize?: (data: Record<string, unknown>) => Record<string, unknown>;
    allowMissingScenes?: S[];
  } = {},
) {
  validateConfig(config);
  const SCENES = config.scenes;
  const CURRENT = config.current;
  const CATALOG = config.catalog;
  const normalize = options.normalize ?? ((data) => data);
  const allowMissingScenes = options.allowMissingScenes ?? [];
  function isCandidate(scene: S, value: unknown): value is string {
    return SCENES.find((entry) => entry.id === scene)!.candidates.some(
      (candidate) => value === `${scene}-${candidate.letter}`,
    );
  }
  function blankReview(): Review<S> {
    return {
      format: 'omochabox-sound-review',
      version: 2,
      toy: config.toy,
      catalog: CATALOG,
      updatedAt: new Date().toISOString(),
      additions: [],
      scenes: Object.fromEntries(
        SCENES.map(({ id }) => [
          id,
          {
            choice: 'pending',
            note: '',
            singleConfirmed: false,
            gameConfirmed: false,
          },
        ]),
      ) as Review<S>['scenes'],
    };
  }

  function initialReview(): Review<S> {
    const result = blankReview();
    for (const { id } of SCENES)
      result.scenes[id].choice =
        config.initialChoices?.[id] ?? CURRENT[id] ?? 'pending';
    return result;
  }

  /** Only the current catalogue's IDs are accepted, never file paths or URLs. */
  function parseReview(text: string): Review<S> {
    const data = normalize(JSON.parse(text) as Record<string, unknown>);
    if (
      !data ||
      data.format !== 'omochabox-sound-review' ||
      data.version !== 2 ||
      data.toy !== config.toy ||
      data.catalog !== CATALOG ||
      typeof data.updatedAt !== 'string' ||
      !Number.isFinite(Date.parse(data.updatedAt)) ||
      !data.scenes ||
      typeof data.scenes !== 'object' ||
      !Array.isArray(data.additions) ||
      data.additions.length > MAX_REQUESTS
    )
      throw new Error('この比較画面で書き出したJSONを選んでください。');
    const result = blankReview();
    result.updatedAt = data.updatedAt;
    const scenes = data.scenes as Record<string, unknown>;
    if (
      Object.keys(scenes).some((id) => !SCENES.some((scene) => scene.id === id))
    )
      throw new Error('未登録の場面が含まれています。');
    for (const { id } of SCENES) {
      if (allowMissingScenes.includes(id) && !Object.hasOwn(scenes, id))
        continue;
      const decision = scenes[id] as Record<string, unknown> | null;
      if (
        !decision ||
        typeof decision.choice !== 'string' ||
        (!['pending', 'redo', 'none'].includes(decision.choice) &&
          !isCandidate(id, decision.choice)) ||
        typeof decision.note !== 'string' ||
        decision.note.length > 2000 ||
        typeof decision.singleConfirmed !== 'boolean' ||
        typeof decision.gameConfirmed !== 'boolean' ||
        (!isCandidate(id, decision.choice) && decision.singleConfirmed) ||
        (!isCandidate(id, decision.choice) &&
          decision.choice !== 'none' &&
          decision.gameConfirmed)
      )
        throw new Error(
          '選定内容が不正です。候補と確認状態を確かめてください。',
        );
      result.scenes[id] = {
        choice: decision.choice as Choice,
        note: decision.note,
        singleConfirmed: decision.singleConfirmed,
        gameConfirmed: decision.gameConfirmed,
      };
    }
    const ids = new Set<string>();
    for (const entry of data.additions as unknown[]) {
      if (!entry || typeof entry !== 'object')
        throw new Error('追加リクエストが不正です。');
      const request = entry as Record<string, unknown>;
      if (
        typeof request.id !== 'string' ||
        !/^[a-zA-Z0-9-]{1,80}$/.test(request.id) ||
        ids.has(request.id)
      )
        throw new Error('追加リクエストのIDが不正です。');
      for (const [key, limit] of [
        ['scene', 400],
        ['timing', 400],
        ['sound', 1000],
        ['note', 2000],
      ] as const)
        if (typeof request[key] !== 'string' || request[key].length > limit)
          throw new Error('追加リクエストの文章を確認してください。');
      ids.add(request.id);
      result.additions.push({
        id: request.id,
        scene: request.scene as string,
        timing: request.timing as string,
        sound: request.sound as string,
        note: request.note as string,
      });
    }
    return result;
  }

  return { blankReview, initialReview, parseReview, isCandidate };
}
