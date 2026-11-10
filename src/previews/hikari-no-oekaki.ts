import cardUrl from '../assets/previews/hikari-no-oekaki.webp';

export default function createPreview() {
  return {
    className: 'garden-preview',
    html: `<img src="${cardUrl}" width="1200" height="600" alt="" loading="lazy">`,
  };
}
