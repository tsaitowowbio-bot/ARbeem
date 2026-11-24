import numpy as np, sys
from PIL import Image, ImageDraw
def render(V, T, ax, size=260, bbox=None):
    # ax: (横, 縦, 奥行き) の軸番号と符号
    P = np.stack([V[:, abs(a) - 1] * (1 if a > 0 else -1) for a in ax], 1)
    lo, hi = bbox
    sc = (size - 16) / max(hi[0] - lo[0], hi[1] - lo[1]); c = (lo + hi) / 2
    X = (P[:, 0] - c[0]) * sc + size / 2; Y = size / 2 - (P[:, 1] - c[1]) * sc
    im = Image.new('RGB', (size, size), (20, 24, 34)); d = ImageDraw.Draw(im)
    tri = P[T]; n = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]); ln = np.linalg.norm(n, axis=1) + 1e-9; n /= ln[:, None]
    order = np.argsort(tri[:, :, 2].mean(1))
    L = np.array([0.4, 0.5, 0.77])
    for i in order:
        s = abs(n[i] @ L); col = int(60 + 180 * s)
        d.polygon([(X[j], Y[j]) for j in T[i]], fill=(col, col, int(col * 0.9)), outline=(30, 40, 60))
    return im
def bbox_of(Vall, ax):
    P = np.stack([Vall[..., abs(a) - 1] * (1 if a > 0 else -1) for a in ax], -1).reshape(-1, 3)
    return P.min(0), P.max(0)
if __name__ == '__main__':
    out = sys.argv[1]; rows = []
    for spec in sys.argv[2:]:
        name, fr = spec.split(':'); d = np.load(name); V, T = d['V'], d['T']; fr = [int(x) for x in fr.split(',')]
        views = [(1, 2, 3), (1, 3, -2), (2, 3, 1)]   # 上から・前から(-y)・横から
        row = []
        for ax in views:
            bb = bbox_of(V, ax)
            for f in fr: row.append(render(V[f], T, ax, bbox=bb))
        rows.append(row)
    W = max(len(r) for r in rows) * 260
    im = Image.new('RGB', (W, 260 * len(rows)))
    for y, r in enumerate(rows):
        for x, t in enumerate(r): im.paste(t, (x * 260, y * 260))
    im.save(out); print(im.size)
