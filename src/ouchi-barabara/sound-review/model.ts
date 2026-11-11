import { SCENES, CURRENT, type SceneId, type CandidateId } from './registry';
export { SCENES, CURRENT, type SceneId, type CandidateId } from './registry';
export const CATALOG = 'ouchi-barabara-audio-fixed-v1';
export const STORAGE_KEY = 'ouchi-barabara:sound-review:fixed-v1';
export const LEGACY_STORAGE_KEYS = [
  'ouchi-barabara:sound-review:v2',
  'ouchi-barabara:sound-review:v1',
];
export type Choice = CandidateId | 'pending' | 'redo' | 'none';
export interface Decision {
  choice: Choice;
  note: string;
  singleConfirmed: boolean;
  gameConfirmed: boolean;
}
export interface Review {
  format: 'omochabox-sound-review';
  version: 2;
  toy: 'ouchi-barabara';
  catalog: typeof CATALOG;
  updatedAt: string;
  scenes: Record<SceneId, Decision>;
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
export function isCandidate(
  scene: SceneId,
  value: unknown,
): value is CandidateId {
  return SCENES.find((entry) => entry.id === scene)!.candidates.some(
    (candidate) => value === `${scene}-${candidate.letter}`,
  );
}
export function blankReview(): Review {
  return {
    format: 'omochabox-sound-review',
    version: 2,
    toy: 'ouchi-barabara',
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
    ) as Review['scenes'],
  };
}

export function initialReview(): Review {
  const result = blankReview();
  result.scenes.hit.choice = CURRENT.hit!;
  result.scenes.rubble.choice = CURRENT.rubble!;
  result.scenes.drive.choice = CURRENT.drive!;
  result.scenes.collapse.choice = CURRENT.collapse!;
  result.scenes.crumble.choice = 'none';
  return result;
}

/** Migrate only the two issued catalogues; their letters had different meanings.
 * Remove after their saved drafts/exports have been migrated (date undecided). */
function normalizePreviousReview(
  data: Record<string, unknown>,
): Record<string, unknown> {
  if (
    !data ||
    data.format !== 'omochabox-sound-review' ||
    data.toy !== 'ouchi-barabara'
  )
    return data;
  const first =
    data.catalog === 'ouchi-barabara-audio-2026-11-11-v1' && data.version === 1;
  const second =
    data.catalog === 'ouchi-barabara-audio-2026-11-11-v2' && data.version === 2;
  if (!first && !second) return data;
  if (!data.scenes || typeof data.scenes !== 'object')
    throw new Error('以前の選定内容が不正です。');
  const remap: Record<string, CandidateId> = {
    'collapse-b': 'collapse-d',
    'collapse-c': 'collapse-e',
    'rubble-b': 'rubble-d',
    'rubble-c': 'rubble-e',
    'drive-a': 'drive-c',
    'drive-b': 'drive-a',
    'drive-c': 'drive-b',
  };
  const scenes = Object.fromEntries(
    Object.entries(data.scenes).map(([id, value]) => {
      if (!['hit', 'collapse', 'rubble', 'drive'].includes(id))
        throw new Error('以前の形式に存在しない場面です。');
      if (!value || typeof value !== 'object')
        throw new Error('以前の選定内容が不正です。');
      const decision = value as Record<string, unknown>;
      const choice = decision.choice;
      if (
        typeof choice !== 'string' ||
        !['pending', 'redo', 'none', `${id}-a`, `${id}-b`, `${id}-c`].includes(
          choice,
        )
      )
        throw new Error('以前の候補IDが不正です。');
      return [
        id,
        { ...decision, choice: second ? (remap[choice] ?? choice) : choice },
      ];
    }),
  );
  return {
    ...data,
    catalog: CATALOG,
    version: 2,
    scenes,
    additions: first ? [] : data.additions,
  };
}

/** Only the current catalogue's IDs are accepted, never file paths or URLs. */
export function parseReview(text: string): Review {
  const data = normalizePreviousReview(
    JSON.parse(text) as Record<string, unknown>,
  );
  if (
    !data ||
    data.format !== 'omochabox-sound-review' ||
    data.version !== 2 ||
    data.toy !== 'ouchi-barabara' ||
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
    // The issued four-scene exports precede the requested intermediate collapse.
    // Keep their decisions intact and leave this new scene unselected.
    if (id === 'crumble' && !Object.hasOwn(scenes, id)) continue;
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
      throw new Error('選定内容が不正です。候補と確認状態を確かめてください。');
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
