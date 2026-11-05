import magnet from '../pitatto-magnet/assets/magnet.webp';
import star from '../pitatto-magnet/assets/star.webp';
import fish from '../pitatto-magnet/assets/fish.webp';
export default function createPreview() {
  return {
    className: 'magnet-preview',
    html: `<div style="position:relative;width:190px;height:180px;margin:auto"><img src="${magnet}" alt="" style="position:absolute;bottom:5px;left:35px;width:120px;height:120px;object-fit:contain;transform:rotate(-12deg)"/><img src="${star}" alt="" style="position:absolute;top:3px;left:26px;width:64px;height:64px;object-fit:contain"/><img src="${fish}" alt="" style="position:absolute;top:10px;right:14px;width:62px;height:62px;object-fit:contain"/></div>`,
  };
}
