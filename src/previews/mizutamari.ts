import cardUrl from '../assets/previews/mizutamari.webp';

export default function createPreview() {
  return {
    className: 'pond-preview',
    html: `<img src="${cardUrl}" width="1200" height="600" alt="" loading="lazy">`,
  };
}
