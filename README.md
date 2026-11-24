# ARbeem

かまえると魔法陣が描かれて装填され、まわりに浮かぶ的に照準を合わせて、ボタンか声でビームを撃つ、ブラウザで動く試作。

- 本体は `index.html` と `js/` のファイル（外部の読み込みなし）。
- カメラとセンサーを使うため、HTTPS か `localhost` で開く。
- パソコンでは、マウスで向きを変え、スペースキーで発射する。
- 詠唱（文字か声）を入れると、ことばに合った魔法が、ビームの代わりに出る。通信はしない（声の聞き取りだけ、ブラウザの音声認識を使う）。
- 公開先：https://tsaitowowbio-bot.github.io/ARbeem/

調整用の値は、次の 4 か所の冒頭にある。

- 全体（装填の速さ、点火の間隔、当たる範囲など）：`js/config.js`
- 魔法陣の描き方：`js/circles.js`
- カメラ映像の暗さ・光・命中の一瞬：`js/backdrop.js`
- 音：`js/audio.js`

## ファイルの役割

| ファイル | 役割 |
|---|---|
| `js/config.js` | 調整用の値、画面、位置の計算 |
| `js/state.js` | 状態と、演出の時計 |
| `js/fx.js` | 光の部品（粒・衝撃波・閃光・破片・残像・光の筋） |
| `js/circles.js` | 魔法陣（形・装填・回転・描画） |
| `js/audio.js` | 音 |
| `js/beam.js` | ビームと弾 |
| `js/aim.js` | 向き、的と当たり判定、照準、声での発射 |
| `js/backdrop.js` | カメラ映像の側の演出 |
| `js/lexicon.js` | 詠唱のことばの表（どのことばが、どの属性・姿・動きを指すか） |
| `js/chant.js` | 詠唱の判定（属性・姿・動きを決める。見つからなければ外れ） |
| `js/models.js` | 生き物の形のデータ（3D モデルから作った、動きつきのポリゴン） |
| `js/creature.js` | 詠唱で出る生き物（動き・属性の気配・蛇と玉の描画） |
| `js/mesh.js` | ポリゴンの生き物の描画（竜・鳥・狼・魚。面と稜線で描く） |
| `js/chantui.js` | 詠唱の入力（文字・声） |
| `js/main.js` | 発射の合図、段取り、毎フレームの処理、開始 |

どのファイルも同じ名前空間を共有している（モジュールではない）。演出の時間は `now()` で読み、`performance.now()` は直接使わない。

## 生き物の形のもと

竜・鳥・狼・魚の形は、著作権が放棄された（CC0）3D モデルから作っている。面の数を減らし、動きのひと回りを数コマにして `js/models.js` に入れた。

| 姿 | もとのモデル | 作者 |
|---|---|---|
| 狼・鳥・魚 | [Animated Animales Low Poly（Animal Pack Vol.2）](https://opengameart.org/content/animated-animales-low-poly) | Quaternius |
| 竜 | [Low Poly Ice Dragon](https://opengameart.org/content/low-poly-ice-dragon) | xTerryx |

作り直すときは `tools/models/` を使う（Blender の Python モジュール `bpy` と、numpy・Pillow が要る）。

1. `bake.py`：モデルを開き、面を減らし、動きの各コマの頂点を書き出す。
2. `export.py`：向きと大きさをそろえ（前＝+x、上＝+y、体の長さ＝1）、`models.js` にする。確認用の画像も出る。
