import stampSquare from '../assets/characters/shapes/01-coral-square.svg';
import stampCyan from '../assets/characters/shapes/02-cyan-circle.svg';
import stampStar from '../assets/characters/shapes/05-coral-star.svg';
import stampPenguin from '../assets/characters/aquarium/01-penguin.svg';
import stampFish from '../assets/characters/aquarium/02-clownfish.svg';
import stampOctopus from '../assets/characters/aquarium/05-octopus.svg';

export default function createPreview() {
  return {
    className: 'stamp-preview',
    html: [
      stampSquare,
      stampCyan,
      stampStar,
      stampPenguin,
      stampFish,
      stampOctopus,
    ]
      .map((src) => `<img src="${src}" alt="" loading="lazy">`)
      .join(''),
  };
}
