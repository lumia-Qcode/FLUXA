/**
 * Warm the browser cache with a deck's images so slides appear instantly in present mode.
 *
 * Slide images come from Wikimedia and take 1-3 s each on slow connections; without this, every
 * slide waited for its picture the moment it was shown. Requests use the same CORS mode as the
 * slide's <img> (crossOrigin="anonymous"), otherwise the browser caches them separately.
 */

const started = new Set<string>();
const kept: HTMLImageElement[] = [];

function resolve(asset: string): string {
  if (!asset) return "";
  if (/^(https?:|data:|blob:|\/)/.test(asset)) return asset;
  return `/api/assets/${asset}`;
}

/** Image URLs a slide will show: photos, and 3D models' still thumbnails. */
export function slideImageUrls(slide: any): string[] {
  const blocks = slide?.blocks || slide?.spec?.blocks || [];
  const urls: string[] = [];
  for (const b of blocks) {
    if (b?.type !== "image") continue;
    const asset = b.assetId || b.props?.assetId || b.props?.url || b.url;
    if (typeof asset === "string" && asset) urls.push(resolve(asset));
    const sf = b.sketchfab || b.props?.sketchfab;
    if (sf?.thumbnail) urls.push(sf.thumbnail);
  }
  return urls;
}

export function preloadImages(urls: string[], concurrency = 4): void {
  const queue = urls.filter((u) => u && !started.has(u));
  queue.forEach((u) => started.add(u));
  let active = 0;
  const next = () => {
    while (active < concurrency && queue.length) {
      const url = queue.shift()!;
      const img = new Image();
      if (/^https?:/.test(url) && !url.startsWith(window.location.origin)) {
        img.crossOrigin = "anonymous";
        img.referrerPolicy = "no-referrer";
      }
      img.decoding = "async";
      active++;
      const done = () => {
        active--;
        next();
      };
      img.onload = done;
      img.onerror = done;
      img.src = url;
      kept.push(img);
      if (kept.length > 200) kept.shift();
    }
  };
  next();
}

/** Preload a deck, starting with the slide at `fromIndex` and the ones after it. */
export function preloadDeck(slides: any[], fromIndex = 0): void {
  const ordered = [...slides.slice(fromIndex), ...slides.slice(0, fromIndex)];
  preloadImages(ordered.flatMap(slideImageUrls));
}
