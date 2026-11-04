import jelly from '../biyoon-jelly/assets/jelly.webp';
export default function createPreview() {
  return {
    className: 'jelly-preview',
    html: `<div style="position:relative;width:170px;height:180px;margin:auto"><span style="position:absolute;width:160px;height:42px;border:5px solid #61bac2;border-radius:50%;background:#fffdf1;bottom:0;left:5px"></span><img src="${jelly}" alt="" style="position:absolute;bottom:12px;left:28px;width:114px;height:156px;transform:skewX(-9deg);transform-origin:50% 100%"/></div>`,
  };
}
