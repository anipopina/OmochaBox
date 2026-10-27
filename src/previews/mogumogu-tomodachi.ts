import body from '../mogumogu-tomodachi/assets/body.webp';
import strawberry from '../mogumogu-tomodachi/assets/strawberry.webp';
import banana from '../mogumogu-tomodachi/assets/banana.webp';
import carrot from '../mogumogu-tomodachi/assets/carrot.webp';
export default function createPreview() {
  return {
    className: 'mogu-preview',
    html: `<img class="mogu-body" src="${body}" alt="" loading="lazy"><svg viewBox="0 0 500 500" aria-hidden="true"><ellipse cx="193" cy="205" rx="23" ry="28" fill="#fff9e4"/><ellipse cx="307" cy="205" rx="23" ry="28" fill="#fff9e4"/><ellipse cx="197" cy="208" rx="12" ry="17" fill="#34312e"/><ellipse cx="303" cy="208" rx="12" ry="17" fill="#34312e"/><ellipse cx="148" cy="270" rx="24" ry="18" fill="#ff9b9c"/><ellipse cx="352" cy="270" rx="24" ry="18" fill="#ff9b9c"/><path d="M220 273Q250 311 280 273" fill="none" stroke="#633e34" stroke-width="9" stroke-linecap="round"/></svg><div><img src="${strawberry}" alt="" loading="lazy"><img src="${banana}" alt="" loading="lazy"><img src="${carrot}" alt="" loading="lazy"></div>`,
  };
}
