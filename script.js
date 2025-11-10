// ===== Element refs =====
const fileInput = document.getElementById('fileInput');
const dropZone  = document.getElementById('dropZone');
const btnEqual  = document.getElementById('btnEqualize');
const btnDown   = document.getElementById('btnDownload');
const btnSave   = document.getElementById('btnSaveServer');
const msg       = document.getElementById('messages');
const cnvOrig   = document.getElementById('canvasOriginal');
const cnvEnh    = document.getElementById('canvasEnhanced');

const modeSel   = document.getElementById('mode');
const clipInp   = document.getElementById('clipLimit');
const clipVal   = document.getElementById('clipVal');
const tileInp   = document.getElementById('tileSize');
const strengthInp = document.getElementById('strength');
const strengthVal = document.getElementById('strengthVal');
const strengthFill = document.getElementById('strengthFill');
const strengthIndicator = document.getElementById('strengthIndicator');
const strengthTrend = document.getElementById('strengthTrend');

const recipesBody = document.getElementById('recipesBody');

let enhancedReady = false;
let prevStrength = parseFloat(strengthInp.value);

// ===== Utils =====
function setMessage(t){ msg.textContent = t || ''; }
function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
function fitSize(w, h, maxW=1600, maxH=1600){
  const r = Math.min(maxW / w, maxH / h, 1);
  return { w: Math.round(w*r), h: Math.round(h*r) };
}
function drawImageToCanvas(img, canvas){
  const fit = fitSize(img.width, img.height);
  canvas.width = fit.w; canvas.height = fit.h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, fit.w, fit.h);
}
function downloadCanvasPNG(canvas, filename='enhanced_equalized.png'){
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = filename; a.click();
}

// ===== Strength UI =====
function updateStrengthScale(){
  const val = parseFloat(strengthInp.value);
  const pct = Math.round(val * 100);
  strengthVal.textContent = pct + '%';
  strengthFill.style.width = pct + '%';
  strengthIndicator.style.left = pct + '%';

  if (val > prevStrength){ strengthTrend.textContent = '▲'; strengthTrend.className = 'trend up'; }
  else if (val < prevStrength){ strengthTrend.textContent = '▼'; strengthTrend.className = 'trend down'; }
  else { strengthTrend.textContent = '•'; strengthTrend.className = 'trend neutral'; }
  prevStrength = val;
}
strengthInp.addEventListener('input', updateStrengthScale);
updateStrengthScale(); // init
clipInp.addEventListener('input', ()=> clipVal.textContent = parseFloat(clipInp.value).toFixed(1));
clipVal.textContent = parseFloat(clipInp.value).toFixed(1);

// ===== RGB <-> HSV =====
function rgbToHsv(r, g, b){
  r/=255; g/=255; b/=255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  const d = max - min;
  let h = 0;
  if(d !== 0){
    switch(max){
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h = Math.round(h * 60);
    if(h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return [h, s, v];
}
function hsvToRgb(h, s, v){
  const c = v * s;
  const x = c * (1 - Math.abs((h/60) % 2 - 1));
  const m = v - c;
  let rp, gp, bp;
  if (h < 60){ rp=c; gp=x; bp=0; }
  else if (h < 120){ rp=x; gp=c; bp=0; }
  else if (h < 180){ rp=0; gp=c; bp=x; }
  else if (h < 240){ rp=0; gp=x; bp=c; }
  else if (h < 300){ rp=x; gp=0; bp=c; }
  else { rp=c; gp=0; bp=x; }
  return [Math.round((rp+m)*255), Math.round((gp+m)*255), Math.round((bp+m)*255)];
}

// ===== Global HE (HSV-V) =====
function histogramEqualizeCanvas(srcCanvas, destCanvas){
  const w = srcCanvas.width, h = srcCanvas.height;
  destCanvas.width = w; destCanvas.height = h;

  const ctxS = srcCanvas.getContext('2d');
  const ctxD = destCanvas.getContext('2d');

  const img = ctxS.getImageData(0,0,w,h);
  const data = img.data;
  const n = w*h;

  const hist = new Uint32Array(256);
  const H = new Uint16Array(n);
  const S = new Float32Array(n);
  const V = new Uint8Array(n);

  for (let p=0,i=0;p<n;p++,i+=4){
    const [hue, s, v] = rgbToHsv(data[i], data[i+1], data[i+2]);
    H[p]=hue; S[p]=s; const vi = clamp(Math.round(v*255),0,255); V[p]=vi; hist[vi]++;
  }

  let cum=0, minCdf=-1;
  const cdf = new Uint32Array(256);
  for (let k=0;k<256;k++){
    cum += hist[k]; cdf[k]=cum;
    if(minCdf===-1 && hist[k]>0) minCdf=cum;
  }
  if(minCdf<0) minCdf=0;
  const denom = Math.max(n - minCdf, 1);

  const map = new Uint8Array(256);
  for (let k=0;k<256;k++){
    map[k] = clamp(Math.round(((cdf[k]-minCdf)/denom)*255),0,255);
  }

  const out = ctxD.createImageData(w,h);
  const o = out.data;

  for (let p=0,i=0;p<n;p++,i+=4){
    const newV = map[V[p]]/255;
    const [r,g,b] = hsvToRgb(H[p], S[p], newV);
    o[i]=r; o[i+1]=g; o[i+2]=b; o[i+3]=255;
  }
  ctxD.putImageData(out, 0, 0);
}

// ===== CLAHE (tile-based, luminance) =====
function claheEqualizeCanvas(srcCanvas, destCanvas, { tileSize=64, clipLimit=2.5, strength=1 }={}){
  const w = srcCanvas.width, h = srcCanvas.height;
  destCanvas.width = w; destCanvas.height = h;

  const ctxS = srcCanvas.getContext('2d');
  const ctxD = destCanvas.getContext('2d');
  const src = ctxS.getImageData(0,0,w,h);
  const sdata = src.data;
  const n = w*h;

  const H = new Uint16Array(n);
  const S = new Float32Array(n);
  const V = new Uint8Array(n);

  for (let p=0,i=0;p<n;p++,i+=4){
    const [hue, s, v] = rgbToHsv(sdata[i], sdata[i+1], sdata[i+2]);
    H[p]=hue; S[p]=s; V[p]=clamp(Math.round(v*255),0,255);
  }

  const tW = tileSize, tH = tileSize;
  const tx = Math.ceil(w / tW), ty = Math.ceil(h / tH);

  const hists = Array.from({length:ty}, ()=> Array.from({length:tx}, ()=> new Uint32Array(256)));

  for (let y=0,p=0;y<h;y++){
    const j = Math.floor(y/tH);
    for (let x=0;x<w;x++,p++){
      const i = Math.floor(x/tW);
      hists[j][i][ V[p] ]++;
    }
  }

  const maps = Array.from({length:ty}, ()=> Array(tx));
  for (let j=0;j<ty;j++){
    for (let i=0;i<tx;i++){
      const hist = hists[j][i];
      const tileWidth = Math.min(tW, w - i*tW);
      const tileHeight = Math.min(tH, h - j*tH);
      const area = Math.max(1, tileWidth * tileHeight);

      const limit = Math.max(1, Math.floor(clipLimit * area / 256));

      let excess = 0;
      for (let k=0;k<256;k++){
        if (hist[k] > limit){ excess += (hist[k]-limit); hist[k]=limit; }
      }
      const addAll = Math.floor(excess/256);
      const rem = excess % 256;
      for (let k=0;k<256;k++) hist[k]+=addAll;
      for (let k=0;k<rem;k++) hist[k]++;

      const map = new Uint8Array(256);
      let c=0;
      for (let k=0;k<256;k++){
        c += hist[k];
        map[k] = clamp(Math.round((c*255)/area), 0, 255);
      }
      maps[j][i]=map;
    }
  }

  const out = ctxD.createImageData(w,h);
  const o = out.data;
  const alpha = parseFloat(strengthInp.value);

  for (let y=0,p=0;y<h;y++){
    const yf = y/tH, j0 = Math.floor(yf), j1 = Math.min(j0+1, ty-1), v = yf - j0;
    for (let x=0;x<w;x++,p++){
      const xf = x/tW, i0 = Math.floor(xf), i1 = Math.min(i0+1, tx-1), u = xf - i0;

      const v0 = V[p];
      const m00 = maps[j0][i0][v0];
      const m10 = maps[j0][i1][v0];
      const m01 = maps[j1][i0][v0];
      const m11 = maps[j1][i1][v0];
      const mapped = Math.round((1-u)*(1-v)*m00 + u*(1-v)*m10 + (1-u)*v*m01 + u*v*m11);

      const newV = ((1 - alpha) * v0 + alpha * mapped) / 255;
      const [r,g,b] = hsvToRgb(H[p], S[p], newV);

      const i = (y*w + x) << 2;
      o[i]=r; o[i+1]=g; o[i+2]=b; o[i+3]=255;
    }
  }
  ctxD.putImageData(out, 0, 0);
}

// ===== Blend helper (for Global HE strength) =====
function blendInto(canvasA, canvasB, outCanvas, alpha){
  const w = canvasA.width, h = canvasA.height;
  outCanvas.width = w; outCanvas.height = h;
  const a = canvasA.getContext('2d').getImageData(0,0,w,h).data;
  const bImg = canvasB.getContext('2d').getImageData(0,0,w,h);
  const b = bImg.data;

  const outCtx = outCanvas.getContext('2d');
  const outImg = outCtx.createImageData(w,h);
  const o = outImg.data;

  for (let i=0;i<o.length;i+=4){
    o[i  ] = Math.round(a[i  ]*(1-alpha) + b[i  ]*alpha);
    o[i+1] = Math.round(a[i+1]*(1-alpha) + b[i+1]*alpha);
    o[i+2] = Math.round(a[i+2] *(1-alpha) + b[i+2]*alpha);
    o[i+3] = 255;
  }
  outCtx.putImageData(outImg, 0, 0);
}

// ===== Loaders =====
function loadImageFile(file){
  return new Promise((resolve, reject)=>{
    const img = new Image();
    img.onload = ()=> resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
async function loadPdfFirstPageToImageDataURL(file){
  if (!window['pdfjsLib']) throw new Error('PDF.js not loaded');
  const url = URL.createObjectURL(file);
  const pdf = await pdfjsLib.getDocument(url).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const targetWidth = 1200;
  const scale = Math.min(targetWidth / viewport.width, 2);
  const v2 = page.getViewport({ scale });

  const c = document.createElement('canvas');
  const cx = c.getContext('2d');
  c.width = v2.width; c.height = v2.height;
  const renderTask = page.render({ canvasContext: cx, viewport: v2 });
  await renderTask.promise;
  return c.toDataURL('image/png');
}

// ===== File input & DnD =====
fileInput.addEventListener('change', async (e)=>{
  const file = e.target.files && e.target.files[0];
  if (file) await handleFile(file);
});
['dragenter','dragover'].forEach(ev=>{
  dropZone.addEventListener(ev, (e)=>{ e.preventDefault(); e.stopPropagation(); dropZone.classList.add('drag'); });
});
['dragleave','drop'].forEach(ev=>{
  dropZone.addEventListener(ev, (e)=>{
    e.preventDefault(); e.stopPropagation();
    if (ev === 'drop'){
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) handleFile(file);
    }
    dropZone.classList.remove('drag');
  });
});

async function handleFile(file){
  try{
    setMessage('');
    if (file.type.startsWith('image/')){
      const img = await loadImageFile(file);
      drawImageToCanvas(img, cnvOrig);
      cnvEnh.getContext('2d').clearRect(0,0,cnvEnh.width, cnvEnh.height);
      enhancedReady = false; btnEqual.disabled=false; btnDown.disabled=true; btnSave.disabled=true;
      setMessage(`Loaded image: ${file.name} (${Math.round(file.size/1024)} KB)`);
    } else if (file.type === 'application/pdf'){
      const dataUrl = await loadPdfFirstPageToImageDataURL(file);
      const img = new Image();
      img.onload = ()=>{
        drawImageToCanvas(img, cnvOrig);
        cnvEnh.getContext('2d').clearRect(0,0,cnvEnh.width, cnvEnh.height);
        enhancedReady=false; btnEqual.disabled=false; btnDown.disabled=true; btnSave.disabled=true;
        setMessage(`Loaded PDF (page 1): ${file.name}`);
      };
      img.src = dataUrl;
    } else {
      setMessage('Unsupported file type. Please select an image or PDF.');
    }
  }catch(err){
    console.error(err);
    setMessage('Error loading file. (See console)');
  }
}

// ===== Equalize =====
btnEqual.addEventListener('click', ()=>{
  try{
    if (!cnvOrig.width || !cnvOrig.height) return setMessage('No image loaded.');
    const mode = modeSel.value;
    const clip = parseFloat(clipInp.value);
    const tile = Math.max(16, Math.min(256, parseInt(tileInp.value||64,10)));
    const strength = parseFloat(strengthInp.value);

    if (mode === 'clahe'){
      claheEqualizeCanvas(cnvOrig, cnvEnh, { tileSize: tile, clipLimit: clip, strength });
    } else {
      histogramEqualizeCanvas(cnvOrig, cnvEnh);
      if (strength < 1){ blendInto(cnvOrig, cnvEnh, cnvEnh, strength); }
    }
    enhancedReady = true;
    btnDown.disabled = false; btnSave.disabled = false;
    setMessage(mode === 'clahe'
      ? `CLAHE applied (tile=${tile}, clip=${clip.toFixed(1)}, strength=${strength.toFixed(2)})`
      : `Global HE applied (strength=${strength.toFixed(2)})`);
  }catch(err){
    console.error(err);
    setMessage('Equalization failed. (See console)');
  }
});

// ===== Download / Save =====
btnDown.addEventListener('click', ()=> enhancedReady && downloadCanvasPNG(cnvEnh));
btnSave.addEventListener('click', async ()=>{
  if (!enhancedReady) return;
  try{
    const dataURL = cnvEnh.toDataURL('image/png');
    const resp = await fetch('process.php', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ imageData: dataURL })
    });
    const json = await resp.json();
    setMessage(json?.ok ? `Saved on server: ${json.url}` : 'Server save failed.');
  }catch(err){
    console.error(err);
    setMessage('Server save error. (See console)');
  }
});

// ===== Quick Recipes (click to apply) =====
recipesBody.addEventListener('click', (e)=>{
  const tr = e.target.closest('tr.clickable');
  if (!tr) return;
  const name = tr.dataset.name || 'Preset';

  modeSel.value = tr.dataset.mode || 'clahe';
  if (tr.dataset.tile)  tileInp.value = parseInt(tr.dataset.tile,10);
  if (tr.dataset.clip)  { clipInp.value = parseFloat(tr.dataset.clip); clipVal.textContent = parseFloat(clipInp.value).toFixed(1); }
  if (tr.dataset.strength){
    strengthInp.value = parseFloat(tr.dataset.strength);
    strengthInp.dispatchEvent(new Event('input')); // update scale/arrow
  }

  setMessage(`Applied preset: ${name}`);
});
