/* Gera a "impressão visual" (vetor de 1024 números) de uma foto, no próprio aparelho.
   Rede: DarkNet Reference (ml5.js, licença MIT), com BatchNorm incorporada e pesos em int8. */
'use strict';
let layers = null;

async function load() {
  if (layers) return;
  const [meta, buf] = await Promise.all([
    fetch('modelo/darknet-int8.json').then(r => r.json()),
    fetch('modelo/darknet-int8.bin').then(r => r.arrayBuffer()),
  ]);
  layers = meta.layers.map(m => {
    const { cin, cout, off } = m;
    const scale = new Float32Array(buf.slice(off, off + 4 * cout));
    const bias = new Float32Array(buf.slice(off + 4 * cout, off + 8 * cout));
    const q = new Int8Array(buf, off + 8 * cout, 9 * cin * cout);
    const w = new Float32Array(q.length);
    for (let i = 0; i < q.length; i++) w[i] = q[i] * scale[i % cout];
    return { cin, cout, w, bias };
  });
}

function conv3(inp, H, W, L) {
  const { cin, cout, w, bias } = L;
  const out = new Float32Array(H * W * cout);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ob = (y * W + x) * cout;
      out.set(bias, ob);
      for (let ky = 0; ky < 3; ky++) {
        const iy = y + ky - 1; if (iy < 0 || iy >= H) continue;
        for (let kx = 0; kx < 3; kx++) {
          const ix = x + kx - 1; if (ix < 0 || ix >= W) continue;
          const ib = (iy * W + ix) * cin, wb0 = (ky * 3 + kx) * cin * cout;
          for (let c = 0; c < cin; c++) {
            const v = inp[ib + c]; if (v === 0) continue;
            const wb = wb0 + c * cout;
            for (let o = 0; o < cout; o++) out[ob + o] += v * w[wb + o];
          }
        }
      }
      for (let o = 0; o < cout; o++) { const v = out[ob + o]; if (v < 0) out[ob + o] = v * 0.1; }
    }
  }
  return out;
}
function pool2(inp, H, W, C) {
  const h = H >> 1, w = W >> 1, out = new Float32Array(h * w * C);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < C; c++) {
    const a = inp[((2 * y) * W + 2 * x) * C + c], b = inp[((2 * y) * W + 2 * x + 1) * C + c];
    const d = inp[((2 * y + 1) * W + 2 * x) * C + c], e = inp[((2 * y + 1) * W + 2 * x + 1) * C + c];
    out[(y * w + x) * C + c] = Math.max(a, b, d, e);
  }
  return out;
}
function embed(pixels) {
  let a = pixels, s = 256;
  layers.forEach((L, i) => {
    a = conv3(a, s, s, L);
    if (i < layers.length - 1) { a = pool2(a, s, s, L.cout); s >>= 1; }
  });
  const C = layers[layers.length - 1].cout, f = new Float32Array(C);
  for (let p = 0; p < s * s; p++) for (let c = 0; c < C; c++) f[c] += a[p * C + c];
  let n = 0; for (let c = 0; c < C; c++) n += f[c] * f[c];
  n = Math.sqrt(n) || 1; for (let c = 0; c < C; c++) f[c] /= n;
  return f;
}

self.onmessage = async ev => {
  const { id, pixels } = ev.data || {};
  try {
    await load();
    const f = embed(new Float32Array(pixels));
    postMessage({ id, emb: f.buffer }, [f.buffer]);
  } catch (e) {
    postMessage({ id, error: String((e && e.message) || e) });
  }
};
