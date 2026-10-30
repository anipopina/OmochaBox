import guitar from '../poron-guitar/assets/guitar.webp';
export default function createPreview() {
  return {
    className: 'guitar-preview',
    html: `<img src="${guitar}" alt="" style="height:150px;width:110px;object-fit:contain;transform:rotate(30deg)" />`,
  };
}
