import ball from '../munyutto-nendo/assets/clay-ball.webp';
export default function createPreview() {
  return {
    className: 'clay-preview',
    html: `<div style="display:grid;place-items:center;height:180px"><img src="${ball}" alt="" style="width:190px;height:190px;object-fit:contain"/></div>`,
  };
}
