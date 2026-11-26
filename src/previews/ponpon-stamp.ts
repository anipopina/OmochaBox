import cardUrl from '../assets/previews/ponpon-stamp.webp';

export default function createPreview() {
  return {
    className: 'stamp-preview',
    html: `<img src="${cardUrl}" width="1200" height="600" alt="" loading="lazy">`,
  };
}
