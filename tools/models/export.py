# 焼いた頂点を、向きと大きさをそろえて（前＝+x、上＝+y、体の長さ＝1）、js/models.js に書き出す
# 使い方：bake.py の出力（wolf.npz など）のあるフォルダで、python export.py <出力する models.js の場所>
#         確認用の画像（横から・上から）が、<出力>.png にできる
import numpy as np, base64, json, sys
from preview import render, bbox_of
from PIL import Image
CFG = {   # fwd・up：Blender の軸（符号つき 1〜3）。frames：使うコマ。rate：1 秒にくり返す回数の目安
  'wolf':   dict(src='wolf.npz',   fwd=1,  up=3, frames=list(range(0, 40, 4)), eye=(0.39, 0.2, 0.04)),
  'bird':   dict(src='eagle.npz',  fwd=2, up=3, frames=list(range(0, 30, 3)), eye=(0.42, 0.03, 0.035)),
  'fish':   dict(src='fish.npz',   fwd=-2, up=3, frames=list(range(0, 39, 3)), eye=(0.36, 0.06, 0.1)),
  'dragon': dict(src='dragon.npz', fwd=-2, up=3, frames=list(range(0, 12, 1)), eye=(0.45, 0.06, 0.02), fat=1.6),
}
def axis(a): v = np.zeros(3); v[abs(a) - 1] = 1 if a > 0 else -1; return v
out = {}; rows = []
for name, c in CFG.items():
    if len(sys.argv) > 2 and name not in sys.argv[2:]: pass
    d = np.load(c['src']); V = d['V'][c['frames']].astype(np.float64); T = d['T'].astype(np.int64)
    f, u = axis(c['fwd']), axis(c['up']); r = np.cross(f, u)
    R = np.stack([f, u, r])                       # 行＝新しい軸。右手系のまま回すだけ
    V = V @ R.T
    # 動かない足場に置く：前後のずれを消す（上下のゆれは残す）
    V[:, :, 0] -= (V[:, :, 0].mean(1) - V[:, :, 0].mean())[:, None]
    lo, hi = V.reshape(-1, 3).min(0), V.reshape(-1, 3).max(0)
    L = hi[0] - lo[0]
    V[:, :, 0] -= (lo[0] + hi[0]) / 2; V[:, :, 2] -= V[:, :, 2].mean()
    tri = V[0][T]; area = np.linalg.norm(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), axis=1)
    cy = (tri[:, :, 1].mean(1) * area).sum() / area.sum(); V[:, :, 1] -= cy      # 上下の中心＝面の重心
    V /= L
    if c.get('fat'):                             # 細すぎる胴・首・尾を、背骨のまわりに太らせる（つばさは、そのまま）
        w = np.clip((0.09 - np.abs(V[0][:, 2])) / 0.06, 0, 1); k = 1 + (c['fat'] - 1) * w
        for fr in V:
            body = w > 0.5; yc = np.array([fr[body & (np.abs(fr[:, 0] - x) < 0.05), 1].mean() if (body & (np.abs(fr[:, 0] - x) < 0.05)).any() else y for x, y in zip(fr[:, 0], fr[:, 1])])
            fr[:, 1] = yc + (fr[:, 1] - yc) * k; fr[:, 2] *= k
    vol = (np.einsum('ij,ij->i', V[0][T][:, 0], np.cross(V[0][T][:, 1], V[0][T][:, 2]))).sum() / 6
    if vol < 0: T = T[:, ::-1]
    # 使っていない頂点を外す
    used = np.unique(T); remap = -np.ones(V.shape[1], dtype=np.int64); remap[used] = np.arange(len(used)); V = V[:, used]; T = remap[T]
    eyes = [int(np.argmin(np.linalg.norm(V[0] - np.array([c['eye'][0], c['eye'][1], sg * c['eye'][2]]), axis=1))) for sg in (1, -1)]
    print('  eyes', eyes, V[0][eyes].round(3))
    q = np.round(V * 16000).astype('<i2')
    out[name] = dict(f=len(V), n=V.shape[1], e=eyes, t=T.reshape(-1).tolist(), v=base64.b64encode(q.tobytes()).decode())
    print(name, 'frames', len(V), 'verts', V.shape[1], 'tris', len(T), 'vol', round(vol, 4), 'bbox', V.reshape(-1, 3).min(0).round(2), V.reshape(-1, 3).max(0).round(2))
    row = []
    for ax in [(1, 2, 3), (1, -3, 2)]:           # 横から（頭が右）・上から
        bb = bbox_of(V, ax)
        for k in range(0, len(V), max(1, len(V) // 4))[:4]: row.append(render(V[k], T, ax, bbox=bb))
    rows.append(row)
im = Image.new('RGB', (260 * 8, 260 * len(rows)))
for y, r in enumerate(rows):
    for x, t in enumerate(r): im.paste(t, (x * 260, y * 260))
im.save(sys.argv[1] + '.png')
js = "'use strict';\n// ---- 生き物の形のデータ（3D モデルから作った、動きつきのポリゴン）----\n" \
     "// もとのモデル（どれも CC0＝著作権の放棄）：狼・鳥・魚＝Quaternius「Animal Pack Vol.2」、竜＝xTerryx「Low Poly Ice Dragon」（OpenGameArt）。\n" \
     "// 向きと大きさをそろえてある：前＝+x、上＝+y、体の長さ＝1。面の数を減らし、動きのひと回りを数コマにして入れた。\n" \
     "// f：コマの数、n：頂点の数、e：目のあたりの頂点（左右）、t：三角形（頂点の番号 3 つずつ）、v：頂点の位置（コマ × 頂点 × xyz。16 ビットの整数を base64 にしたもの。16000 で 1）\n" \
     "const CR_MODEL_DATA = {\n" + ",\n".join(f"  {k}: {{ f: {m['f']}, n: {m['n']}, e: {json.dumps(m['e'])}, t: {json.dumps(m['t'], separators=(',', ':'))},\n    v: '{m['v']}' }}" for k, m in out.items()) + "\n};\n"
open(sys.argv[1], 'w').write(js); print('bytes', len(js))
