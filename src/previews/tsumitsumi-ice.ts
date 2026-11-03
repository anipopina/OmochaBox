import cone from '../tsumitsumi-ice/assets/cone.webp';
import strawberry from '../tsumitsumi-ice/assets/strawberry.webp';
import vanilla from '../tsumitsumi-ice/assets/vanilla.webp';
export default function createPreview() {
  return {
    className: 'ice-preview',
    html: `<div style="position:relative;width:150px;height:180px;margin:auto"><img src="${cone}" alt="" style="position:absolute;bottom:0;left:35px;width:80px;height:95px;object-fit:contain"/><img src="${vanilla}" alt="" style="position:absolute;bottom:65px;left:15px;width:120px;height:75px;object-fit:contain"/><img src="${strawberry}" alt="" style="position:absolute;bottom:110px;left:15px;width:120px;height:75px;object-fit:contain"/></div>`,
  };
}
