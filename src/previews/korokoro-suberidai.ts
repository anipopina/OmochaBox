import slidePreviewUrl from '../assets/previews/korokoro-suberidai.svg';

export default function createPreview() {
  return {
    className: 'slide-preview',
    html: `<img src="${slidePreviewUrl}" width="480" height="550" alt="" loading="lazy">`,
  };
}
