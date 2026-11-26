import cardUrl from '../assets/previews/pukapuka-fusen.webp';

export default function createPreview() {
  return {
    className: 'balloon-preview',
    html: `<img src="${cardUrl}" width="1200" height="600" alt="" loading="lazy">`,
  };
}
