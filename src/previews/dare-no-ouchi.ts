import house from '../dare-no-ouchi/assets/house.webp';
export default function createPreview() {
  return {
    className: 'house-preview',
    html: `<img src="${house}" alt="" style="width:95%;height:155px;object-fit:contain" />`,
  };
}
