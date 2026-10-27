import pinwheelRotor from '../kurukuru-kazaguruma/assets/rotor.svg';

export default function createPreview() {
  return {
    className: 'pinwheel-preview',
    html: `<span></span><img src="${pinwheelRotor}" width="640" height="640" alt="" loading="lazy">`,
  };
}
