import windowPreviewUrl from '../assets/previews/fukifuki-mado.webp';

export default function createPreview() {
  return {
    className: 'window-preview',
    html: `<img src="${windowPreviewUrl}" alt="" loading="lazy"><span>ふきふき ✦</span>`,
  };
}
