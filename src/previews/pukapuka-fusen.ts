import balloonCyan from '../pukapuka-fusen/assets/cyan.svg';
import balloonStar from '../pukapuka-fusen/assets/star.svg';
import balloonTriangle from '../pukapuka-fusen/assets/triangle.svg';

export default function createPreview() {
  return {
    className: 'balloon-preview',
    html: `<img src="${balloonCyan}" alt="" loading="lazy"><img src="${balloonStar}" alt="" loading="lazy"><img src="${balloonTriangle}" alt="" loading="lazy">`,
  };
}
