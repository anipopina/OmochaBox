import cardUrl from '../assets/previews/pukupuku-shabon.webp';

export default function createPreview() {
  return {
    className: 'bubble-preview',
    html: `<img src="${cardUrl}" width="1200" height="600" alt="" loading="lazy">`,
  };
}
