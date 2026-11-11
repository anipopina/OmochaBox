import './style.css';
import { ReviewPlayer } from './player';
import type { Candidate, ReviewConfig } from './catalogue';
import { MAX_REQUESTS, type Review, type createReviewModel } from './model';

/** Development-only UI. The caller owns disposal when replacing the page. */
export function mountSoundReview<S extends string>({
  config,
  candidates,
  model,
  legacyStorageKeys = [],
}: {
  config: ReviewConfig<S>;
  candidates: Record<string, Candidate>;
  model: ReturnType<typeof createReviewModel<S>>;
  legacyStorageKeys?: string[];
}) {
  const SCENES = config.scenes;
  const STORAGE_KEY = config.storageKey;
  const LEGACY_STORAGE_KEYS = legacyStorageKeys;
  const { initialReview, parseReview, isCandidate } = model;
  type SceneId = S;
  type CandidateId = string;
  const originalTitle = document.title;
  document.title = `${config.title}｜おもちゃボックス`;
  const listeners = new AbortController();
  const listen = (
    target: EventTarget,
    type: string,
    handler: (event: Event) => void,
  ) => target.addEventListener(type, handler, { signal: listeners.signal });
  const escape = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (char) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[char]!,
    );
  document.documentElement.classList.add('sound-review');
  const main = document.createElement('main');
  main.className = 'review';
  main.innerHTML = `
  <header class="review-header">
    <a class="game-link" href="/${config.toy}/">← 遊びにもどる</a>
    <div class="heading"><span aria-hidden="true">${escape(config.symbol)}</span><div>
      <h1>${escape(config.title)}</h1>
      <p>${escape(config.subtitle)}</p>
    </div></div>
    <p class="intro">記号は音源ごとに固定です。新しい候補は次の記号で追加し、以前の候補も残します。<br>
    ${config.intro.map(escape).join('<br>')}<br>
    以前の候補も固定記号のまま聴き比べられます。選定済みの音は「採用中」と表示します。<br>
    まず1回、つぎに3回続けて聴いてみてください。<br>
    名前は生成・加工でねらった印象です。気に入らなければ「作り直す」「音なし」も選べます。</p>
  </header>
  <nav class="new-candidates" aria-label="比較する音へ移動">${config.links.map((link) => `<a class="game-link" href="#candidate-${link.candidate}">${escape(link.label)}</a>`).join('')}</nav>
  <div class="transport"><button type="button" id="stop" disabled>■ 再生を止める</button>
    <p id="playback" role="status" aria-live="polite">ボタンを押すと音が鳴ります。</p></div>
  <div class="review-toolbar">
    <p id="progress"></p><p id="storage" role="status"></p>
    <button type="button" data-preview>選んだ音で遊ぶ</button>
    <button type="button" id="copy">選定結果をコピー</button>
    <button type="button" id="export">選定結果を書き出す</button>
    <button type="button" id="import">JSONを読み戻す</button>
    <input id="file" type="file" accept="application/json,.json" hidden>
  </div>
  <p id="notice" role="status" aria-live="polite"></p>
  <div id="manual-copy" hidden>
    <label for="copy-text">選定結果のJSON（選択してコピー）</label>
    <textarea id="copy-text" readonly rows="8"></textarea>
    <button type="button" id="select-copy">全文を選択</button>
  </div>
  <div class="scenes">${SCENES.map(
    (scene) => `
    <section class="review-scene" data-scene="${scene.id}" aria-labelledby="title-${scene.id}">
      <div class="scene-heading"><span aria-hidden="true">${escape(scene.symbol)}</span><div>
        <h2 id="title-${scene.id}">${escape(scene.title)}</h2><p>${escape(scene.timing)} ／ ${escape(scene.duration)}</p>
      </div></div>
      <div class="candidates">${scene.candidates
        .map((sample) => {
          const candidate = candidates[`${scene.id}-${sample.letter}`];
          return `<article id="candidate-${candidate.id}" class="candidate" data-candidate="${candidate.id}">
          <div class="candidate-heading"><span class="letter">${candidate.letter}</span>
            <span>${candidate.current ? '採用中' : candidate.round === 1 ? '初回候補' : '比較候補'}</span><span class="audition-status"></span></div>
          <h3>${escape(candidate.name)}</h3><p class="candidate-duration">${candidate.duration}</p>
          <button class="play" type="button" data-play="${candidate.id}" data-count="1"
            aria-label="${escape(scene.title)}・候補${candidate.letter}を1回聴く">▶ 1回聴く</button>
          <button type="button" data-play="${candidate.id}" data-count="3"
            aria-label="${escape(scene.title)}・候補${candidate.letter}を3回続けて聴く">▶▶ 3回聴く</button>
          <label class="choice"><input type="radio" name="${scene.id}" value="${candidate.id}">この音にする</label>
        </article>`;
        })
        .join('')}</div>
      <fieldset class="other-choices"><legend>ほかの選び方</legend>
        <label class="choice"><input type="radio" name="${scene.id}" value="redo">作り直す</label>
        <label class="choice"><input type="radio" name="${scene.id}" value="none">今回は音なし</label>
        <label class="choice"><input type="radio" name="${scene.id}" value="pending">まだ選ばない</label>
      </fieldset>
      <div class="scene-notes"><label for="note-${scene.id}">音のメモ</label>
        <textarea id="note-${scene.id}" data-note="${scene.id}" maxlength="2000" rows="2"
          placeholder="例：Bの音色が好き。もう少し短くしたい。"></textarea>
        <div class="confirmations">
          <label class="choice"><input type="checkbox" data-confirm="singleConfirmed" data-id="${scene.id}">単音で確認した</label>
          <label class="choice"><input type="checkbox" data-confirm="gameConfirmed" data-id="${scene.id}">遊びの中でも確認した</label>
        </div>
      </div>
    </section>`,
  ).join('')}</div>
  <section class="requests" aria-labelledby="requests-title">
    <h2 id="requests-title">追加したい音</h2>
    <p>候補一覧以外にも、音を付けたいところがあれば教えてください。選定結果と一緒にJSONに入ります。途中の記入でも保存できます。</p>
    <div id="request-list"></div>
    <button type="button" id="add-request">＋ 音の追加をリクエスト</button>
    <p id="request-count" role="status"></p>
  </section>
  <footer class="review-footer">
    <h2>選んだ音で、遊んでみる</h2>
    <p>別のタブで今回の組み合わせを試せます。「作り直す」「音なし」の場面は鳴らしません。未選定の場面は今の音を使います。<br>
    操作とのタイミングや重なりを確かめたら、この画面の「遊びの中でも確認した」にチェックしてください。</p>
    <button type="button" id="preview" data-preview>▶ 選んだ音で遊ぶ</button>
    <p>試しただけでは通常の遊びの音は変わりません。選定ができたらJSONを書き出して渡してください。<br>
    選定途中の内容はこのブラウザーに保存します。別の端末やブラウザーには自動で引き継がれません。</p>
  </footer>`;
  document.body.replaceChildren(main);
  const element = <T extends Element>(selector: string) => {
    const found = main.querySelector<T>(selector);
    if (!found) throw new Error(`Missing review element: ${selector}`);
    return found;
  };
  const notice = element<HTMLElement>('#notice');
  const storage = element<HTMLElement>('#storage');
  let review = initialReview();
  storage.textContent = '選ぶと、このブラウザーに自動保存します';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      review = parseReview(saved);
      storage.textContent = '保存した選定を読み戻しました';
    } else {
      for (const key of LEGACY_STORAGE_KEYS) {
        const previous = localStorage.getItem(key);
        if (!previous) continue;
        review = parseReview(previous);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(review));
          storage.textContent =
            '以前の選定とメモを、同じ音源の固定記号へ引き継ぎました';
        } catch {
          storage.textContent =
            '選定は引き継ぎましたが保存できません。JSONを書き出して控えてください。';
        }
        break;
      }
    }
  } catch {
    notice.textContent =
      '保存内容を読み戻せませんでした。必要なら書き出したJSONを読み戻してください。';
  }

  const player = new ReviewPlayer((message, active) => {
    element('#playback').textContent = message;
    element<HTMLButtonElement>('#stop').disabled = active === null;
    for (const card of main.querySelectorAll<HTMLElement>('[data-candidate]')) {
      const playing = card.dataset.candidate === active;
      card.classList.toggle('playing', playing);
      card.querySelector('.audition-status')!.textContent = playing
        ? '♪ 再生中'
        : '';
    }
  }, config.playback);

  function summary() {
    const decisions = SCENES.map(({ id }) => review.scenes[id]);
    const chosen = SCENES.filter(
      ({ id }) =>
        isCandidate(id, review.scenes[id].choice) ||
        review.scenes[id].choice === 'none',
    ).length;
    const checked = decisions.filter(
      (decision) => decision.gameConfirmed,
    ).length;
    element('#progress').textContent =
      `${chosen} / ${SCENES.length} 場面を選定 ・ 遊びで確認 ${checked} / ${SCENES.length} ・ 追加 ${review.additions.length}件`;
  }

  function persist() {
    copyGeneration++;
    element<HTMLElement>('#manual-copy').hidden = true;
    review.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(review));
      storage.textContent = 'このブラウザーに保存済み';
    } catch {
      storage.textContent = '保存できません。JSONを書き出して控えてください。';
    }
    summary();
  }

  function renderRequests() {
    const list = element('#request-list');
    list.replaceChildren();
    for (const [index, request] of review.additions.entries()) {
      const card = document.createElement('article');
      card.className = 'request-card';
      card.dataset.requestId = request.id;
      card.innerHTML = `<div class="request-heading"><h3>追加リクエスト ${index + 1}</h3>
      <button type="button" data-remove-request="${request.id}" aria-label="追加リクエスト${index + 1}を削除">削除する</button></div>
      <div class="request-fields">
      <label>音を付けたい場面<input type="text" data-request-field="scene" maxlength="400" placeholder="例：操作を始めるとき"></label>
      <label>鳴らすタイミング<input type="text" data-request-field="timing" maxlength="400" placeholder="例：動き始めた瞬間"></label>
      <label>希望する音<textarea data-request-field="sound" maxlength="1000" rows="2" placeholder="例：短い、やわらかい機械音"></textarea></label>
      <label>補足メモ（任意）<textarea data-request-field="note" maxlength="2000" rows="2" placeholder="長さや強さ、避けたい音など"></textarea></label>
      </div>`;
      for (const input of card.querySelectorAll<
        HTMLInputElement | HTMLTextAreaElement
      >('[data-request-field]'))
        input.value =
          request[
            input.dataset.requestField as 'scene' | 'timing' | 'sound' | 'note'
          ];
      list.append(card);
    }
    element<HTMLButtonElement>('#add-request').disabled =
      review.additions.length >= MAX_REQUESTS;
    element('#request-count').textContent = review.additions.length
      ? `${review.additions.length}件の追加リクエスト`
      : '追加リクエストはまだありません。';
  }
  listen(element('#add-request'), 'click', () => {
    if (review.additions.length >= MAX_REQUESTS) return;
    review.additions.push({
      id: crypto.randomUUID(),
      scene: '',
      timing: '',
      sound: '',
      note: '',
    });
    renderRequests();
    persist();
    main
      .querySelector<HTMLInputElement>('.request-card:last-child input')
      ?.focus();
  });
  listen(main, 'click', (event) => {
    const button =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-remove-request]')
        : null;
    if (!button) return;
    review.additions = review.additions.filter(
      (request) => request.id !== button.dataset.removeRequest,
    );
    renderRequests();
    persist();
    element<HTMLButtonElement>('#add-request').focus();
  });

  function renderState() {
    for (const { id } of SCENES) {
      const decision = review.scenes[id];
      for (const input of main.querySelectorAll<HTMLInputElement>(
        `input[name="${id}"]`,
      ))
        input.checked = input.value === decision.choice;
      element<HTMLTextAreaElement>(`#note-${id}`).value = decision.note;
      for (const key of ['singleConfirmed', 'gameConfirmed'] as const) {
        const input = element<HTMLInputElement>(
          `[data-confirm="${key}"][data-id="${id}"]`,
        );
        input.checked = decision[key];
        input.disabled =
          !isCandidate(id, decision.choice) &&
          !(key === 'gameConfirmed' && decision.choice === 'none');
      }
      for (const card of main.querySelectorAll<HTMLElement>(
        `[data-scene="${id}"] .candidate`,
      ))
        card.classList.toggle(
          'selected',
          card.dataset.candidate === decision.choice,
        );
    }
    summary();
  }

  listen(main, 'click', (event) => {
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>('[data-play]')
        : null;
    if (!target) return;
    const candidate = candidates[target.dataset.play as CandidateId];
    void player.play(
      candidate.id,
      candidate.url,
      `候補${candidate.letter}「${escape(candidate.name)}」`,
      Number(target.dataset.count),
      candidate.interval,
    );
  });
  listen(main, 'change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.type === 'radio') {
      const decision = review.scenes[target.name as SceneId];
      decision.choice = target.value as Review<S>['scenes'][SceneId]['choice'];
      decision.singleConfirmed = false;
      decision.gameConfirmed = false;
      renderState();
      persist();
    } else if (target.dataset.confirm) {
      review.scenes[target.dataset.id as SceneId][
        target.dataset.confirm as 'singleConfirmed' | 'gameConfirmed'
      ] = target.checked;
      persist();
    }
  });
  listen(main, 'input', (event) => {
    const target = event.target;
    if (
      (target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement) &&
      target.dataset.requestField
    ) {
      const id =
        target.closest<HTMLElement>('[data-request-id]')?.dataset.requestId;
      const request = review.additions.find((request) => request.id === id);
      if (request) {
        request[
          target.dataset.requestField as 'scene' | 'timing' | 'sound' | 'note'
        ] = target.value;
        persist();
      }
      return;
    }
    if (target instanceof HTMLTextAreaElement && target.dataset.note) {
      review.scenes[target.dataset.note as SceneId].note = target.value;
      persist();
    }
  });
  listen(element('#stop'), 'click', () => player.stop());
  for (const button of main.querySelectorAll('[data-preview]'))
    listen(button, 'click', () => {
      player.stop();
      const choices = SCENES.map(({ id }) => review.scenes[id].choice);
      window.open(
        `/${config.toy}/?sound-preview=${choices.join(',')}`,
        '_blank',
        'noopener',
      );
    });

  const downloads = new Map<ReturnType<typeof setTimeout>, string>();
  const reviewJson = () => JSON.stringify(review, null, 2) + '\n';
  let copyGeneration = 0;
  listen(element('#copy'), 'click', () => {
    const generation = ++copyGeneration;
    const text = reviewJson();
    const fallback = () => {
      if (generation !== copyGeneration) return;
      element<HTMLElement>('#manual-copy').hidden = false;
      const output = element<HTMLTextAreaElement>('#copy-text');
      output.value = text;
      output.focus();
      output.select();
      notice.textContent =
        '自動コピーできませんでした。選択されたJSONを手動でコピーしてください。';
    };
    try {
      void navigator.clipboard.writeText(text).then(() => {
        if (generation !== copyGeneration) return;
        element<HTMLElement>('#manual-copy').hidden = true;
        notice.textContent =
          '選定結果をコピーしました。チャットにそのまま貼り付けられます。';
      }, fallback);
    } catch {
      fallback();
    }
  });
  listen(element('#select-copy'), 'click', () => {
    const output = element<HTMLTextAreaElement>('#copy-text');
    output.focus();
    output.select();
  });
  listen(element('#export'), 'click', () => {
    const url = URL.createObjectURL(
      new Blob([reviewJson()], {
        type: 'application/json',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${config.toy}-sound-review.json`;
    document.body.append(link);
    link.click();
    link.remove();
    const timer = setTimeout(() => {
      URL.revokeObjectURL(url);
      downloads.delete(timer);
    }, 1000);
    downloads.set(timer, url);
    notice.textContent =
      '選定結果をJSONで書き出しました。途中の状態でも読み戻せます。';
  });
  const fileInput = element<HTMLInputElement>('#file');
  let importGeneration = 0;
  listen(element('#import'), 'click', () => fileInput.click());
  listen(fileInput, 'change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    const generation = ++importGeneration;
    if (file.size > 512_000) {
      notice.textContent =
        'ファイルが大きすぎます。選定結果のJSONを選んでください。';
      return;
    }
    void file.text().then(
      (text) => {
        if (generation !== importGeneration) return;
        try {
          const imported = parseReview(text);
          player.stop();
          review = imported;
          renderState();
          renderRequests();
          persist();
          notice.textContent = '選定結果とメモを読み戻しました。';
        } catch {
          notice.textContent =
            '読み戻せませんでした。この候補セットのJSONを選んでください。今の選定内容は保持しています。';
        }
      },
      () => {
        notice.textContent =
          'ファイルを読めませんでした。もう一度選んでください。';
      },
    );
  });
  listen(document, 'visibilitychange', () => {
    if (document.hidden) player.stop();
  });
  listen(window, 'blur', () => player.stop());
  listen(window, 'pagehide', () => {
    copyGeneration++;
    importGeneration++;
    player.dispose();
    for (const [timer, url] of downloads) {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
    }
    downloads.clear();
  });
  renderState();
  renderRequests();
  main.dataset.ready = 'true';

  return () => {
    listeners.abort();
    copyGeneration++;
    importGeneration++;
    player.dispose();
    for (const [timer, url] of downloads) {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
    }
    downloads.clear();
    main.remove();
    document.documentElement.classList.remove('sound-review');
    document.title = originalTitle;
  };
}
