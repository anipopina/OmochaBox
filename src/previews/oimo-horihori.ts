import cardUrl from '../assets/previews/oimo-horihori.webp';

export default function createPreview() {
  return {
    className: 'oimo-preview',
    html: `<img src="${cardUrl}" width="1200" height="800" alt="" loading="lazy">`,
  };
}
