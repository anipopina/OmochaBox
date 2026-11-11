import { SCENES, CURRENT, type CandidateId } from './registry';

const files = import.meta.glob<string>('./assets/*.mp3', {
  eager: true,
  query: '?url',
  import: 'default',
});
export const candidates = Object.fromEntries(
  SCENES.flatMap((scene) =>
    scene.candidates.map((candidate) => {
      const id: CandidateId = `${scene.id}-${candidate.letter}`;
      const url = files[`./assets/${candidate.file}`];
      if (!url) throw new Error(`Missing comparison sample: ${id}`);
      return [
        id,
        {
          id,
          url,
          name: candidate.name,
          letter: candidate.letter.toUpperCase(),
          duration: `${candidate.seconds}秒`,
          interval: scene.interval,
          current: id === CURRENT[scene.id],
          round: candidate.round,
        },
      ];
    }),
  ),
) as Record<
  CandidateId,
  {
    id: CandidateId;
    url: string;
    name: string;
    letter: string;
    duration: string;
    interval: number;
    current: boolean;
    round: number;
  }
>;
