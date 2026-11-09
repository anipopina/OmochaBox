// Hand-drawn card art: a yellow excavator swinging its bucket at a toy house
// whose blocks are already flying apart.
const art = `<svg viewBox="0 0 320 180" width="100%" height="160" aria-hidden="true">
  <rect x="0" y="138" width="320" height="42" fill="#74d14c"/>
  <ellipse cx="170" cy="146" rx="150" ry="16" fill="#e9bb7d"/>
  <g stroke="#17396b" stroke-width="4" stroke-linejoin="round">
    <rect x="196" y="78" width="92" height="64" fill="#ff6f9c"/>
    <rect x="212" y="92" width="22" height="22" fill="#7fdcff"/>
    <rect x="250" y="104" width="22" height="38" fill="#ffd23f"/>
    <path d="M186 80 L242 44 L298 80 Z" fill="#2f73e0"/>
    <rect x="178" y="36" width="20" height="16" fill="#ff8db1" transform="rotate(-24 188 44)"/>
    <rect x="200" y="20" width="16" height="12" fill="#4189f5" transform="rotate(30 208 26)"/>
    <rect x="164" y="60" width="14" height="10" fill="#ffd23f" transform="rotate(12 171 65)"/>
    <rect x="22" y="118" width="104" height="26" rx="13" fill="#2c303a"/>
    <circle cx="40" cy="131" r="8" fill="#ffc414"/>
    <circle cx="74" cy="131" r="8" fill="#ffc414"/>
    <circle cx="108" cy="131" r="8" fill="#ffc414"/>
    <rect x="30" y="84" width="88" height="32" rx="6" fill="#ffc414"/>
    <rect x="70" y="52" width="40" height="34" rx="4" fill="#ffc414"/>
    <rect x="80" y="58" width="24" height="20" fill="#8fe3ff"/>
    <path d="M112 92 L150 34 L164 40 L124 98 Z" fill="#ffc414"/>
    <path d="M150 34 L188 52 L182 64 L146 46 Z" fill="#ffc414"/>
    <path d="M178 50 C200 52 206 72 192 84 L180 66 Z" fill="#e59a00"/>
  </g>
</svg>`;
export default function createPreview() {
  return { className: 'barabara-preview', html: art };
}
