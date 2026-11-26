# キャラクターSVG

| シリーズ               | ディレクトリ           | 点数 |
| ---------------------- | ---------------------- | ---- |
| 図形のなかま           | [shapes/](shapes/)     | 6    |
| 水族館（ユーザー提供） | [aquarium/](aquarium/) | 10   |

原本の形・色・顔・手足・編集情報を保持しています。再利用時は必要なSVGだけをimportしてください。「ぽんぽんスタンプ」では図形・水族館の絵柄をまとめてページ送りで選べます。各おもちゃの画風・素材選択は個別に決めます。

出典とハッシュは [素材記録](../../../source-assets/characters/README.md) にあります。

## Matter.jsの当たり判定

[collision-data.ts](collision-data.ts) が共有データです。キーはSVGのシリーズ名とファイル名をつないだ `aquarium/01-penguin-a` のようなIDです。`viewBox` は元のSVGと同じ値を記録します。中央座標や頂点はその座標系で指定し、`angle` は度で指定します。円は縦横の半径が同じ楕円で表します。多角形は頂点を外周順に並べた凸形状を使います。

形は胴体を中心に1〜2個に収めます。細い手足・ひれ・触手は、遊びを妨げる空白の当たり判定を減らすため省けます。凹形の外周をそのまま登録するとMatter.jsが凸包を作るため、凹みが重要なら形を分けます。

遊び側は必要なSVGを個別にimportし、[共通ファクトリー](../../shared/character-physics.ts) の `createCharacterBody(id, position, width, options)` で剛体を作ります。`position` は重心の位置、`width` はSVG全体の表示幅です。`body` をMatter.jsのワールドに追加し、描画には `artwork` の重心からのオフセットを使います。Canvasでは `drawCharacterArtwork(context, character, image)` がオフセットと回転を適用します。表示サイズを変えるときは同じ幅で剛体を作り直します。

遊びのスクリプトからは次のように使えます。

```ts
import Matter from 'matter-js';
import penguinUrl from '../assets/characters/aquarium/01-penguin-a.svg';
import {
  createCharacterBody,
  drawCharacterArtwork,
} from '../shared/character-physics';

const engine = Matter.Engine.create();
const penguin = createCharacterBody(
  'aquarium/01-penguin-a',
  { x: 150, y: 120 },
  96,
);
Matter.Composite.add(engine.world, penguin.body);
const image = new Image();
image.src = penguinUrl;

function draw(context: CanvasRenderingContext2D) {
  if (image.complete && image.naturalWidth) {
    drawCharacterArtwork(context, penguin, image);
  }
}
```

### SVGを追加するとき

1. 元のSVGを `src/assets/characters/<series>/` に置き、出典・利用条件・SHA-256を[素材記録](../../../source-assets/characters/README.md)に追加します。
2. [collision-data.ts](collision-data.ts) に同じID、表示名、`viewBox` と1〜2個の形を追加します。
3. 開発サーバーの `/dev/character-shapes/` で追加したキャラクターを選び、輪郭と衝突を確認します。`node tests/characters.mjs` と `node --import tsx tests/character-physics-model.mjs` で原本の一致、全SVGとの対応、Matter.jsでの衝突を検査できます。
