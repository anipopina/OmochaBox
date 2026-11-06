import meadow from '../kurutto-ehon/assets/meadow.webp';
export default function createPreview() {
  return {
    className: 'ehon-preview',
    html: `<div style="position:relative;width:190px;height:142px;margin:18px auto;border:7px solid #fff8e5;border-radius:12px;box-shadow:0 7px 0 #be7544;transform:rotate(-5deg);overflow:hidden"><img src="${meadow}" alt="" style="width:100%;height:100%;object-fit:cover"/><div style="position:absolute;right:0;bottom:0;width:0;height:0;border-top:36px solid transparent;border-right:36px solid #fff8e5"></div></div>`,
  };
}
