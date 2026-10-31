import train from '../kotokoto-kisha/assets/train.webp';
export default function createPreview() {
  return {
    className: 'train-preview',
    html: `<img src="${train}" alt="" style="width:95%;height:155px;object-fit:contain" />`,
  };
}
