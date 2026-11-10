// Card art: a game screenshot (see source-assets/ouchi-barabara/README.md).
import cardUrl from '../assets/previews/ouchi-barabara.webp';

export default function createPreview() {
  return {
    className: 'barabara-preview',
    html: `<img src="${cardUrl}" alt="" loading="lazy">`,
  };
}
