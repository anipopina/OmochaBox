# みずたまりの効果音

水面に触れたときの短い水音を、2026-11-26にStable Audio Open 1.0で3案生成しました。短い「ぽちょっ」、丸い「ぽちょん」、軽い「ぽちょっ」を比較できます。[生成条件、切り出し、音量、ハッシュの記録](review/round-1.json)

各候補から水音を1回分切り出し、低域と耳に刺さりやすい高域を抑え、前後をフェードしてモノラルのMP3に圧縮しました。生成原本のWAVは `tmp/audio-originals/mizutamari/generated/` に保管します。

水面に触れたときと、ドラッグ中の一部の波紋には、ユーザー修正版2のWAVから作ったF案を使います。配信用MP3は試聴用と同一で、再生時に速度を変えます。[選定結果](review/selections/2026-11-27-f.json) · [配信ファイルとの対応](adopted.json) · [加工記録](review/round-4-user-edit.json)

D案はC案の原本WAVを使い、鳴り始めの高域を中心に抑えました。切り出し位置と音の長さを揃え、C案と聴き比べられるようにしています。[加工・測定記録](review/round-2-soft-onset.json)

モデルにはStability AI Community License Agreement（2024-07-05版）が適用されます。出力の扱いに基づき、非商用の試作・評価として生成音のみを加工・同梱し、選定後はWeb配信に使えます。音源固有の帰属表示は求められていません。商用目的でモデルを使用する場合は登録と収益条件を確認します。[使用リビジョンのライセンス原文](../../ouchi-barabara/audio/MODEL-LICENSE.md) · [利用条件の記録](../../ouchi-barabara/audio/README.md#利用条件)
