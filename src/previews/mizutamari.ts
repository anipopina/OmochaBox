import pondGreen from '../mizutamari/assets/leaf-green.webp';
import pondTeal from '../mizutamari/assets/leaf-teal.webp';

export default function createPreview() {
  return {
    className: 'pond-preview',
    html: `<i></i><img src="${pondGreen}" alt="" loading="lazy"><img src="${pondTeal}" alt="" loading="lazy">`,
  };
}
