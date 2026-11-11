import rabbit from '../kage-asobi/assets/rabbit.webp';
export default function createPreview() {
  return {
    className: 'shadow-preview',
    html: `<div style="height:180px;position:relative;overflow:hidden;border-radius:24px;background:#ffe077"><img src="${rabbit}" alt="" style="position:absolute;height:140px;left:47%;top:12px;transform:rotate(36deg) scaleY(1.15);filter:brightness(0);opacity:.65;transform-origin:bottom" /><img src="${rabbit}" alt="" style="position:absolute;height:125px;left:28%;top:33px" /><span style="position:absolute;left:15%;bottom:10px;font-size:40px;color:#b65500">☀</span></div>`,
  };
}
