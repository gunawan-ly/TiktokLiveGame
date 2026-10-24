// Bingkai kartu tier Emas berbasis SVG (hasil AI lain, dikoreksi Lyra).
// File SVG adalah sumber kebenaran tunggal; modul ini hanya memuat dan
// memasangkannya. Nama pengirim TIDAK PERNAH lewat innerHTML: teks nickname
// di dalam SVG selalu diisi lewat textContent.

export const GOLD_FRAME_URL = new URL(
  "../frames/frame-card-gold.svg",
  import.meta.url,
);

// Memuat teks SVG sekali saat startup. Mengembalikan null bila gagal
// (mis. dibuka lewat file://) supaya pemanggil jatuh kembali ke ring CSS.
export async function loadGoldFrameSvg() {
  try {
    const response = await fetch(GOLD_FRAME_URL, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    const text = await response.text();
    return text.includes("<svg") ? text : null;
  } catch {
    return null;
  }
}

// Mengurai teks SVG tepercaya menjadi elemen <svg> dan mengisi nickname.
// instanceId dipakai untuk memberi akhiran unik pada semua id di dalam SVG
// (gradasi, filter, nickname) supaya beberapa kartu emas di satu lembar
// tidak saling berebut id yang sama. Mengembalikan null bila parsing gagal.
export function createGoldFrameElement(svgText, displayName, instanceId = "") {
  if (typeof svgText !== "string" || !svgText.includes("<svg")) {
    return null;
  }
  let source = svgText;
  if (instanceId) {
    source = source.split("card-gold-").join(`card-gold-${instanceId}-`);
    source = source.replace('id="nickname"', `id="nickname-${instanceId}"`);
  }
  const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
  const svg = parsed.querySelector("svg");
  if (!svg) {
    return null;
  }
  const nickname = svg.querySelector(
    instanceId ? `#nickname-${instanceId}` : "#nickname",
  );
  if (nickname) {
    nickname.textContent = String(displayName || "");
  }
  return svg;
}
