const processedBgCache = new Map<string, string>();
const inFlightPromises = new Map<string, Promise<string>>();

function loadImageElement(src: string, useCors: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (useCors && !src.startsWith('data:') && !src.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

async function getCanvasSafeImage(imageUrl: string): Promise<HTMLImageElement> {
  try {
    const img = await loadImageElement(imageUrl, true);
    const testCanvas = document.createElement('canvas');
    testCanvas.width = 2;
    testCanvas.height = 2;
    const ctx = testCanvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(img, 0, 0, 2, 2);
      ctx.getImageData(0, 0, 1, 1);
    }
    return img;
  } catch {
    // Fallback to /api/media/proxy to bypass CORS restrictions on R2/external URLs
    const proxyRes = await fetch(`/api/media/proxy?url=${encodeURIComponent(imageUrl)}`);
    if (!proxyRes.ok) {
      throw new Error(`Proxy failed with status ${proxyRes.status}`);
    }
    const json = await proxyRes.json();
    if (!json?.success || !json?.dataUrl) {
      throw new Error('Proxy did not return a valid dataUrl');
    }
    return loadImageElement(json.dataUrl, false);
  }
}

function colorDistSq(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number
): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  // Perceptually weighted RGB distance squared
  return dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
}

/**
 * Automatically removes studio/solid/textured backgrounds from a couple portrait or event thumbnail
 * using border-seeded flood-fill matting, Sobel edge barrier protection, and soft alpha feathering.
 */
export async function autoRemoveImageBackground(imageUrl: string): Promise<string> {
  const cleanUrl = (imageUrl || '').trim();
  if (!cleanUrl || typeof document === 'undefined') return cleanUrl;

  const cached = processedBgCache.get(cleanUrl);
  if (cached) return cached;

  const existingPromise = inFlightPromises.get(cleanUrl);
  if (existingPromise) return existingPromise;

  const promise = (async (): Promise<string> => {
    try {
      const img = await getCanvasSafeImage(cleanUrl);
      const natW = img.naturalWidth || img.width || 400;
      const natH = img.naturalHeight || img.height || 500;

      const maxDim = 600;
      const scale = Math.min(1, maxDim / Math.max(natW, natH));
      const W = Math.max(32, Math.round(natW * scale));
      const H = Math.max(32, Math.round(natH * scale));

      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return cleanUrl;

      ctx.drawImage(img, 0, 0, W, H);
      const imgData = ctx.getImageData(0, 0, W, H);
      const data = imgData.data;

      // 1. Check if image already has a transparent background
      let transparentBorderCount = 0;
      let totalBorderSampled = 0;
      for (let x = 0; x < W; x += 2) {
        totalBorderSampled++;
        if (data[(x * 4) + 3] < 180) transparentBorderCount++;
      }
      for (let y = 0; y < Math.floor(H * 0.7); y += 2) {
        totalBorderSampled += 2;
        if (data[(y * W * 4) + 3] < 180) transparentBorderCount++;
        if (data[((y * W + (W - 1)) * 4) + 3] < 180) transparentBorderCount++;
      }
      if (totalBorderSampled > 0 && transparentBorderCount / totalBorderSampled > 0.12) {
        processedBgCache.set(cleanUrl, cleanUrl);
        return cleanUrl;
      }

      // 2. Collect background color seeds along top, left, and right outer margins
      const seeds: Array<{ r: number; g: number; b: number }> = [];
      const samplePatch = (cx: number, cy: number) => {
        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let count = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const x = Math.min(W - 1, Math.max(0, cx + dx));
            const y = Math.min(H - 1, Math.max(0, cy + dy));
            const idx = (y * W + x) * 4;
            rSum += data[idx];
            gSum += data[idx + 1];
            bSum += data[idx + 2];
            count++;
          }
        }
        if (count > 0) {
          seeds.push({
            r: rSum / count,
            g: gSum / count,
            b: bSum / count,
          });
        }
      };

      const topMarginY = Math.max(2, Math.floor(H * 0.03));
      for (let i = 0; i <= 10; i++) {
        const x = Math.min(W - 3, Math.max(2, Math.floor((W * i) / 10)));
        samplePatch(x, topMarginY);
      }
      const sideMaxY = Math.floor(H * 0.72);
      const leftMarginX = Math.max(2, Math.floor(W * 0.03));
      const rightMarginX = Math.min(W - 3, Math.floor(W * 0.97));
      for (let i = 1; i <= 7; i++) {
        const y = Math.floor((sideMaxY * i) / 7);
        samplePatch(leftMarginX, y);
        samplePatch(rightMarginX, y);
      }

      // Compute local variance among adjacent border seeds to adapt to textured studio backdrops
      let adjDiffSum = 0;
      for (let i = 1; i < seeds.length; i++) {
        adjDiffSum += Math.sqrt(
          colorDistSq(
            seeds[i].r,
            seeds[i].g,
            seeds[i].b,
            seeds[i - 1].r,
            seeds[i - 1].g,
            seeds[i - 1].b
          )
        );
      }
      const avgSeedDiff = seeds.length > 1 ? adjDiffSum / (seeds.length - 1) : 10;
      // Adaptive global & step thresholds
      const globalTol = Math.min(56, Math.max(28, 32 + avgSeedDiff * 0.85));
      const globalTolSq = globalTol * globalTol;
      const stepTol = Math.min(26, Math.max(13, 14 + avgSeedDiff * 0.35));
      const stepTolSq = stepTol * stepTol;

      // 3. Compute luminance & Sobel gradient magnitude to stop flood-fill at subject boundaries
      const lum = new Float32Array(W * H);
      for (let i = 0, p = 0; i < W * H; i++, p += 4) {
        lum[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
      }

      const grad = new Float32Array(W * H);
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const gx =
            -lum[(y - 1) * W + (x - 1)] +
            lum[(y - 1) * W + (x + 1)] -
            2 * lum[y * W + (x - 1)] +
            2 * lum[y * W + (x + 1)] -
            lum[(y + 1) * W + (x - 1)] +
            lum[(y + 1) * W + (x + 1)];
          const gy =
            -lum[(y - 1) * W + (x - 1)] -
            2 * lum[(y - 1) * W + x] -
            lum[(y - 1) * W + (x + 1)] +
            lum[(y + 1) * W + (x - 1)] +
            2 * lum[(y + 1) * W + x] +
            lum[(y + 1) * W + (x + 1)];
          grad[y * W + x] = Math.sqrt(gx * gx + gy * gy) * 0.25;
        }
      }

      const minSeedDistSq = (r: number, g: number, b: number): number => {
        let best = Infinity;
        for (let i = 0; i < seeds.length; i++) {
          const d = colorDistSq(r, g, b, seeds[i].r, seeds[i].g, seeds[i].b);
          if (d < best) best = d;
        }
        return best;
      };

      // 4. Region-growing BFS flood-fill from outer borders
      // 0 = unvisited/foreground, 1 = background
      const isBg = new Uint8Array(W * H);
      const queue = new Int32Array(W * H);
      let qHead = 0;
      let qTail = 0;

      const tryEnqueueBorder = (x: number, y: number) => {
        const idx = y * W + x;
        if (isBg[idx]) return;
        const p = idx * 4;
        if (minSeedDistSq(data[p], data[p + 1], data[p + 2]) <= globalTolSq * 1.35) {
          isBg[idx] = 1;
          queue[qTail++] = idx;
        }
      };

      for (let x = 0; x < W; x++) {
        tryEnqueueBorder(x, 0);
      }
      const maxBorderSeedY = Math.floor(H * 0.88);
      for (let y = 1; y < maxBorderSeedY; y++) {
        tryEnqueueBorder(0, y);
        tryEnqueueBorder(W - 1, y);
      }

      // Subject core protection zone (center-bottom ellipse where couple bodies/faces are)
      const coreCx = W * 0.5;
      const coreCy = H * 0.62;
      const coreRx = W * 0.27;
      const coreRy = H * 0.36;

      const dirs = [-1, 1, -W, W];
      while (qHead < qTail) {
        const curr = queue[qHead++];
        const cx = curr % W;
        const cy = (curr - cx) / W;
        const cp = curr * 4;
        const cr = data[cp];
        const cg = data[cp + 1];
        const cb = data[cp + 2];

        for (let d = 0; d < 4; d++) {
          const next = curr + dirs[d];
          if (next < 0 || next >= W * H || isBg[next]) continue;
          const nx = next % W;
          const ny = (next - nx) / W;
          if (Math.abs(nx - cx) + Math.abs(ny - cy) !== 1) continue;

          // Check if inside inner core subject zone
          const normDx = (nx - coreCx) / coreRx;
          const normDy = (ny - coreCy) / coreRy;
          const inCore = normDx * normDx + normDy * normDy < 1.0;

          // Strong edge barrier stops flood fill
          const edgeThreshold = inCore ? 14 : 26;
          if (grad[next] > edgeThreshold) continue;

          const np = next * 4;
          const nr = data[np];
          const ng = data[np + 1];
          const nb = data[np + 2];

          const stepDist = colorDistSq(cr, cg, cb, nr, ng, nb);
          const localStepMax = inCore ? stepTolSq * 0.55 : stepTolSq;
          if (stepDist > localStepMax) continue;

          const seedDist = minSeedDistSq(nr, ng, nb);
          const localGlobalMax = inCore ? globalTolSq * 0.55 : globalTolSq;
          if (seedDist <= localGlobalMax) {
            isBg[next] = 1;
            queue[qTail++] = next;
          }
        }
      }

      // 5. Build floating-point alpha map (0..255) with soft color-distance ramp at boundaries
      const alpha = new Float32Array(W * H);
      for (let i = 0; i < W * H; i++) {
        if (isBg[i]) {
          alpha[i] = 0;
        } else {
          // Check if adjacent to background for soft ramp
          const x = i % W;
          const y = (i - x) / W;
          let touchesBg = false;
          if (x > 0 && isBg[i - 1]) touchesBg = true;
          else if (x < W - 1 && isBg[i + 1]) touchesBg = true;
          else if (y > 0 && isBg[i - W]) touchesBg = true;
          else if (y < H - 1 && isBg[i + W]) touchesBg = true;

          if (touchesBg) {
            const p = i * 4;
            const d = Math.sqrt(minSeedDistSq(data[p], data[p + 1], data[p + 2]));
            const ratio = Math.min(1, Math.max(0.15, (d - globalTol * 0.5) / (globalTol * 0.7)));
            alpha[i] = ratio * 255;
          } else {
            alpha[i] = 255;
          }
        }
      }

      // 6. 2-pass separable box blur (radius 2) on alpha channel for smooth anti-aliased hair/shoulder edges
      const tempAlpha = new Float32Array(W * H);
      const radius = 2;
      // Horizontal pass
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          let sum = 0;
          let cnt = 0;
          for (let k = -radius; k <= radius; k++) {
            const nx = x + k;
            if (nx >= 0 && nx < W) {
              sum += alpha[y * W + nx];
              cnt++;
            }
          }
          tempAlpha[y * W + x] = sum / cnt;
        }
      }
      // Vertical pass + apply to imageData
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          let sum = 0;
          let cnt = 0;
          for (let k = -radius; k <= radius; k++) {
            const ny = y + k;
            if (ny >= 0 && ny < H) {
              sum += tempAlpha[ny * W + x];
              cnt++;
            }
          }
          let finalA = sum / cnt;
          // Push near-zero alpha to 0 and near-opaque alpha to 255 for crisp foreground & clean transparency
          if (finalA < 22) finalA = 0;
          else if (finalA > 238) finalA = 255;

          data[(y * W + x) * 4 + 3] = Math.round(finalA);
        }
      }

      ctx.putImageData(imgData, 0, 0);
      const resultDataUrl = canvas.toDataURL('image/png');
      processedBgCache.set(cleanUrl, resultDataUrl);
      return resultDataUrl;
    } catch (err) {
      console.warn('Auto Remove BG fallback to original image:', err);
      return cleanUrl;
    } finally {
      inFlightPromises.delete(cleanUrl);
    }
  })();

  inFlightPromises.set(cleanUrl, promise);
  return promise;
}
