import './play-media.css';

function preventNativeMediaAction(event: Event): void {
  if (
    event.target instanceof Element &&
    event.target.closest('canvas, img, svg image')
  ) {
    event.preventDefault();
  }
}

// ゲーム中に追加される画像にも、要素ごとの登録なしで適用する。
document.addEventListener('contextmenu', preventNativeMediaAction, true);
document.addEventListener('dragstart', preventNativeMediaAction, true);
