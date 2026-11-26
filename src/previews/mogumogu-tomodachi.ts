import cardUrl from '../assets/previews/mogumogu-tomodachi.webp';

export default function createPreview() {
  return {
    className: 'mogu-preview',
    html: `<img src="${cardUrl}" width="1200" height="600" alt="" loading="lazy">`,
  };
}
