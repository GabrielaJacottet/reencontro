/* Gera a "impressão visual" (vetor de 384 números) de uma foto, no próprio aparelho.
   Rede: DINOv2 small (Meta, licença Apache 2.0), pesos em 8 bits, rodando com o ONNX Runtime Web (Microsoft, licença MIT). */
'use strict';
const PASTA = 'modelo/', ARQ = 'dinov2-small-q8.onnx', TAM = 224;
const MEDIA = [0.485, 0.456, 0.406], DESVIO = [0.229, 0.224, 0.225];
let sessao = null, pronto = null, fila = Promise.resolve();

async function carregar() {
  if (typeof ort === 'undefined') {
    try { importScripts(PASTA + 'ort/ort.wasm.min.js'); } catch (_) { throw new Error('modelo_ausente:ort/ort.wasm.min.js'); }
  }
  ort.env.wasm.wasmPaths = new URL(PASTA + 'ort/', location.href).href;
  ort.env.wasm.numThreads = 1; // o GitHub Pages não libera várias threads (falta isolamento de origem)
  let r = null; try { r = await fetch(PASTA + ARQ); } catch (_) {}
  if (!r || !r.ok) throw new Error('modelo_ausente:' + ARQ);
  const buf = await r.arrayBuffer();
  if (buf.byteLength < 24000000) throw new Error('modelo_incompleto');
  sessao = await ort.InferenceSession.create(new Uint8Array(buf), { executionProviders: ['wasm'] });
}
const load = () => pronto || (pronto = carregar().catch(e => { pronto = null; throw e; }));

// entrada: 224x224 RGB (0–1); saída: token CLS normalizado
async function rodar(pixels) {
  const n = TAM * TAM, t = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) t[c * n + i] = (pixels[i * 3 + c] - MEDIA[c]) / DESVIO[c];
  const out = await sessao.run({ [sessao.inputNames[0]]: new ort.Tensor('float32', t, [1, 3, TAM, TAM]) });
  const h = out[sessao.outputNames[0]], C = h.dims[2], f = new Float32Array(C);
  let s = 0; for (let c = 0; c < C; c++) { f[c] = h.data[c]; s += f[c] * f[c]; }
  s = Math.sqrt(s) || 1; for (let c = 0; c < C; c++) f[c] /= s;
  return f;
}
// uma foto por vez na mesma sessão
function embed(pixels) { const p = fila.then(() => rodar(pixels)); fila = p.catch(() => {}); return p; }

self.onmessage = async ev => {
  const { id, pixels, ping } = ev.data || {};
  try {
    await load();
    if (ping) { postMessage({ id, ok: true }); return; }
    const f = await embed(new Float32Array(pixels));
    postMessage({ id, emb: f.buffer }, [f.buffer]);
  } catch (e) {
    postMessage({ id, error: String((e && e.message) || e) });
  }
};
