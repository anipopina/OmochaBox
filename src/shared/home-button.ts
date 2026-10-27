import homeIcon from './icons/home.svg?raw';
import './home-button.css';

/** Enhance a native link so navigation and existing click handlers stay native. */
export function initHomeButton(anchor: HTMLAnchorElement): void {
  anchor.classList.add('home-button');
  anchor.setAttribute('aria-label', 'おもちゃボックスにもどる');
  anchor.innerHTML = homeIcon;
  const icon = anchor.querySelector('svg')!;
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('focusable', 'false');
}

document
  .querySelectorAll<HTMLAnchorElement>('a[data-home-button]')
  .forEach(initHomeButton);
