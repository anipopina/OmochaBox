import square from '../assets/characters/shapes/01-coral-square.svg';
import cyan from '../assets/characters/shapes/02-cyan-circle.svg';
import purple from '../assets/characters/shapes/03-purple-circle.svg';
import triangle from '../assets/characters/shapes/04-yellow-triangle.svg';
import star from '../assets/characters/shapes/05-coral-star.svg';
import mint from '../assets/characters/shapes/06-mint-rectangle.svg';

import sea0 from '../assets/characters/aquarium/01-penguin.svg';
import sea1 from '../assets/characters/aquarium/02-clownfish.svg';
import sea2 from '../assets/characters/aquarium/03-ray.svg';
import sea3 from '../assets/characters/aquarium/04-jellyfish.svg';
import sea4 from '../assets/characters/aquarium/05-octopus.svg';
import sea5 from '../assets/characters/aquarium/06-crab.svg';
import sea6 from '../assets/characters/aquarium/07-dolphin.svg';
import sea7 from '../assets/characters/aquarium/08-sea-star.svg';

export type StampItem = { id: string; name: string; src: string };
export type StampSet = {
  id: string;
  name: string;
  icon: string;
  items: readonly StampItem[];
};
export const stampSets: readonly StampSet[] = [
  {
    id: 'shapes',
    name: 'ずけい',
    icon: square,
    items: [
      { id: 'shapes/coral-square', name: 'あかい しかく', src: square },
      { id: 'shapes/cyan-circle', name: 'あおい まる', src: cyan },
      { id: 'shapes/purple-circle', name: 'むらさきの まる', src: purple },
      {
        id: 'shapes/yellow-triangle',
        name: 'きいろい さんかく',
        src: triangle,
      },
      { id: 'shapes/coral-star', name: 'あかい ほし', src: star },
      { id: 'shapes/mint-rectangle', name: 'みどりの しかく', src: mint },
    ],
  },
  {
    id: 'aquarium',
    name: 'すいぞくかん',
    icon: sea0,
    items: [
      { id: 'aquarium/penguin', name: 'ペンギン', src: sea0 },
      { id: 'aquarium/clownfish', name: 'クマノミ', src: sea1 },
      { id: 'aquarium/ray', name: 'エイ', src: sea2 },
      { id: 'aquarium/jellyfish', name: 'クラゲ', src: sea3 },
      { id: 'aquarium/octopus', name: 'タコ', src: sea4 },
      { id: 'aquarium/crab', name: 'カニ', src: sea5 },
      { id: 'aquarium/dolphin', name: 'イルカ', src: sea6 },
      { id: 'aquarium/sea-star', name: 'ヒトデ', src: sea7 },
    ],
  },
];
