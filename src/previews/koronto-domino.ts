import concept from '../koronto-domino/assets/concept.webp';
export default function createPreview() {
  return {
    className: 'domino-preview',
    html: `<img src="${concept}" alt="" style="width:100%;height:180px;object-fit:cover;border-radius:24px" />`,
  };
}
