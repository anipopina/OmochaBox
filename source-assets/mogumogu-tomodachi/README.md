# もぐもぐともだち — 素材記録

参照: オーナー提供の [さいしょの６案.png](https://drive.google.com/file/d/1ajVv2YI_84W0nKctK_jYaOwtZbDe9LHc/view) と [メモ](https://drive.google.com/file/d/1wbo-tsw3UAUMhd5js01xDBQXoStcx89o/view)。2026-10-27にDrive経由で画像を取得し、右下のもぐもぐともだちを視認しました。

素材は親スレッド提供の[生成素材パック](https://drive.google.com/file/d/1RHzBfFrjmlUXlle7oEbaJjgqZSsPABDJ/view)から取得。身体768×768と食べ物256×256の透過WebP（合計84,034 bytes）を再エンコードせず同梱。`friend-body.webp`のみ`body.webp`へ改名。生成原本は`source/`、納品時の生成指示・座標・変換記録は[asset-pack.md](asset-pack.md)、SHA-256は[sha256.json](sha256.json)に保存。

4枚のWebPを実装環境で視認し、最終ビルドのスクリーンショットで透過輪郭・表情の位置・食べ物の視認性を確認しました。耳・腕・足は身体に焼き込まれ、顔と頬の動きは別のSVGレイヤーです。

## 2026-11-08 くま・おばけ追加

[素材パック](https://drive.google.com/file/d/1p217zwyC8Zg6LMsYypuFV60Eo5-nf2Iz/view)を実装環境へダウンロードし、透過WebP2枚と確認画像を視認。原本PNG・出典・生成指示・変換手順・SHA-256・確認画像を [friends-v2](friends-v2/README.md) に保持。配信用768角WebP（くま53,060 bytes、おばけ54,978 bytes）は再エンコードせずsrcへ同梱。共通500角SVGの目・頬・口を重ね、口のクリップと食事の飛行座標を維持。

## 2026-11-09 くまの輪郭改善

[新くま素材パック](https://drive.google.com/file/d/1Sk6uRlY0sk3VM2Xe-Z-k1QwclJ8YRjb-/view)の実物WebPと確認画像を視認し採用。大きな丸耳・内耳・頭と胴の区別・淡色マズルを持つテディベア。原本と生成指示要旨、検証記録は [bear-v3](bear-v3/README.md)。768角透過WebP 62,698 bytesを再変換せず配信。旧原本は保持。くまだけSVGの目を40座標上へ移動し、マズル上部に鼻を追加。丸耳が収まるよう、くまの画像と顔の共通枠を他2体より少し小さく表示。共通の口・クリップ・給餌座標を維持。
