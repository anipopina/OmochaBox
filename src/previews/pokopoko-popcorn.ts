import kernel from '../pokopoko-popcorn/assets/kernel.webp';
import popcorn from '../pokopoko-popcorn/assets/popcorn.webp';
export default function createPreview() {
  return {
    className: 'popcorn-preview',
    html: `<img src="${kernel}" alt="" style="width:30%;height:110px;object-fit:contain" /><img src="${popcorn}" alt="" style="width:50%;height:150px;object-fit:contain" />`,
  };
}
