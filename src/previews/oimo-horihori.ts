import potato from '../oimo-horihori/assets/sweet-potato.webp';
export default function createPreview() {
  return {
    className: 'oimo-preview',
    html: `<div style="height:180px;background:#bc7a43;border-radius:28px;position:relative;overflow:hidden"><img src="${potato}" alt="" style="width:85%;height:90%;object-fit:contain;margin:5% 7%"/><div style="position:absolute;inset:65% -5% -15%;background:#d79b5c;border-radius:50%"></div></div>`,
  };
}
