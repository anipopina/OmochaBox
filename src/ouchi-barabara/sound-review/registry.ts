const sample = (
  letter: string,
  name: string,
  file: string,
  seconds: number,
  round = 1,
) => ({ letter, name, file, seconds, round });

// Candidate letters and files are permanent. Append new samples; adoption never
// changes a candidate's identity or points its file at a different recording.
export const SCENES = [
  {
    id: 'hit',
    title: '家をたたく',
    symbol: '🔨',
    timing: 'バケットが家に当たる瞬間',
    duration: '0.7秒',
    interval: 0.95,
    candidates: [
      sample('a', '木のおもちゃの打撃', 'hit-original.mp3', 0.7),
      sample('b', '低く空洞に響く木の音', 'hit-b.mp3', 0.7),
      sample('c', '弾むプラスチックの音', 'hit-c.mp3', 0.7),
    ],
  },
  {
    id: 'collapse',
    title: '最後にくずれる',
    symbol: '🏠',
    timing: '最後の打撃で家が全壊するとき',
    duration: '0.9〜2.1秒',
    interval: 2.8,
    candidates: [
      sample('a', '積み木が落ち着く音', 'collapse-original.mp3', 2.1),
      sample('b', 'まとまって倒れる木の音', 'collapse-b.mp3', 2.1),
      sample('c', '軽いプラスチックの崩れ', 'collapse-c.mp3', 2.1),
      sample('d', 'Aの音色・短く、前半から減衰', 'collapse-d.mp3', 1.14, 2),
      sample('e', 'Aの音色・さらに短く、早く減衰', 'collapse-e.mp3', 0.9, 2),
      sample('f', 'Aの序盤から、2秒で落ち着く', 'collapse-f.mp3', 2, 3),
      sample('g', 'Aの序盤から、2秒でやわらかく減衰', 'collapse-g.mp3', 2, 3),
      sample('h', '軽い木の積み木が一斉に崩れる', 'collapse-h.mp3', 2, 4),
      sample('i', '小さな積み木がさらっと崩れる', 'collapse-i.mp3', 2, 4),
      sample('j', '軽い木の塔が横へ崩れる', 'collapse-j.mp3', 2, 4),
      sample('k', 'Cを参考に・木製ブロック', 'collapse-k.mp3', 2, 5),
      sample('l', 'Cのコンセプトで・木製ブロック', 'collapse-l.mp3', 2, 5),
      sample('m', 'Cを参考に・厚みのある木製ブロック', 'collapse-m.mp3', 2, 5),
    ],
  },
  {
    id: 'rubble',
    title: 'がれきをつつく',
    symbol: '🧱',
    timing: '全壊後、瓦礫や地面に当たる瞬間',
    duration: '0.65〜0.9秒',
    interval: 0.95,
    candidates: [
      sample('a', '木片をつついて転がす音', 'rubble-original.mp3', 0.65),
      sample('b', '小さな木のころんとした音', 'rubble-b.mp3', 0.65),
      sample('c', '小さなブロックが弾む音', 'rubble-c.mp3', 0.65),
      sample('d', 'Bを少し重く・かすかな余韻', 'rubble-d.mp3', 0.811, 2),
      sample('e', 'Bをもう少し低く・長めの余韻', 'rubble-e.mp3', 0.902, 2),
    ],
  },
  {
    id: 'drive',
    title: '次の家へはしる',
    symbol: '🚜',
    timing: '走り始めから次の家に着くまで',
    duration: '6秒',
    interval: 6.5,
    candidates: [
      sample('a', '玩具モーターとキャタピラ', 'drive-original.mp3', 6),
      sample('b', '低めでやわらかいモーター', 'drive-b.mp3', 6),
      sample('c', '軽い歯車とキャタピラ', 'drive-c.mp3', 6),
    ],
  },
  {
    id: 'crumble',
    title: '途中がくずれる',
    symbol: '🧩',
    timing: '最後以外のアタック直後に、打撃音と重ねる',
    duration: '1.5秒',
    interval: 1.8,
    candidates: [
      sample('a', 'A系の木の崩れ・1.5秒で落ち着く', 'crumble-a.mp3', 1.5, 3),
      sample('b', 'A系の木の崩れ・1.5秒で早めに減衰', 'crumble-b.mp3', 1.5, 3),
      sample('c', '少量の軽い積み木が崩れる', 'crumble-c.mp3', 1.5, 4),
      sample('d', '軽い木片が一度にこぼれる', 'crumble-d.mp3', 1.5, 4),
      sample('e', '小さな木の塔の一部が崩れる', 'crumble-e.mp3', 1.5, 4),
      sample('f', 'Dの崩れ方・少し重い木片', 'crumble-f.mp3', 1.5, 5),
      sample('g', 'Dの崩れ方・少し低めで重い木片', 'crumble-g.mp3', 1.5, 5),
      sample('h', 'Dを参考に・重めの木片を再生成', 'crumble-h.mp3', 1.5, 5),
    ],
  },
] as const;

export type SceneId = (typeof SCENES)[number]['id'];
export type CandidateId = `${SceneId}-${string}`;
export const CURRENT: Record<SceneId, CandidateId | null> = {
  hit: 'hit-a',
  collapse: 'collapse-m',
  rubble: 'rubble-e',
  drive: 'drive-c',
  crumble: null,
};

/** A…Z, AA…; the sequence continues without reusing earlier letters. */
export function letterAt(index: number): string {
  if (!Number.isSafeInteger(index) || index < 0)
    throw new Error('Invalid candidate index');
  let result = '';
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26))
    result = String.fromCharCode(97 + ((value - 1) % 26)) + result;
  return result;
}
for (const scene of SCENES) {
  for (const [index, candidate] of scene.candidates.entries())
    if (candidate.letter !== letterAt(index))
      throw new Error(`Candidate order changed: ${scene.id}`);
  if (
    CURRENT[scene.id] !== null &&
    !scene.candidates.some(
      (candidate) => `${scene.id}-${candidate.letter}` === CURRENT[scene.id],
    )
  )
    throw new Error(`Adopted candidate missing: ${scene.id}`);
}
