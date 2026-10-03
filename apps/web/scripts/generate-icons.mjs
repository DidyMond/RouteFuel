// Genera le icone della PWA da assets/logo.svg (unica sorgente) in apps/web/public.
// Uso: pnpm --filter @routefuel/web generate:icons   (i PNG generati sono committati: la build non dipende da sharp)
//
//   pwa-192x192.png, pwa-512x512.png      icone «any»: il logo com'è (angoli arrotondati trasparenti)
//   pwa-maskable-512x512.png              «maskable»: fondo a tutto campo + logo entro la zona sicura (80%)
//   apple-touch-icon.png (180x180)        iOS non ammette trasparenza: fondo a tutto campo, il sistema arrotonda
//   favicon.ico                           32x32 (PNG dentro un contenitore ICO)
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, "../../../assets/logo.svg");
const out = resolve(here, "../public");

const svg = await readFile(source, "utf8");

// Il logo è un quadrato 200x200 con un rect arrotondato di sfondo (gradiente) e i segni sopra.
const BACKGROUND_RECT = /<rect width="200" height="200" rx="44" fill="url\(#rf-grad\)"\/>/;
if (!BACKGROUND_RECT.test(svg)) throw new Error("assets/logo.svg è cambiato: aggiorna BACKGROUND_RECT in generate-icons.mjs");
const defs = svg.match(/<defs>[\s\S]*?<\/defs>/)[0];
const marks = svg.replace(/^[\s\S]*?<\/defs>/, "").replace(BACKGROUND_RECT, "").replace(/<\/svg>\s*$/, "");

/** Stesso logo ma con fondo a tutto campo e un margine attorno ai segni (`padding` in unità del logo, su 200). */
const fullBleed = (padding) => {
  const start = -padding;
  const size = 200 + padding * 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${start} ${start} ${size} ${size}" width="${size}" height="${size}">` +
    `${defs}<rect x="${start}" y="${start}" width="${size}" height="${size}" fill="url(#rf-grad)"/>${marks}</svg>`
  );
};

const png = (markup, size) => sharp(Buffer.from(markup)).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

/** ICO con una sola immagine PNG (supportato da tutti i browser moderni). */
function ico(pngBuffer, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // riservato
  header.writeUInt16LE(1, 2); // tipo: icona
  header.writeUInt16LE(1, 4); // una immagine
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size, 0); // larghezza
  entry.writeUInt8(size, 1); // altezza
  entry.writeUInt16LE(1, 4); // piani
  entry.writeUInt16LE(32, 6); // bit per pixel
  entry.writeUInt32LE(pngBuffer.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);
  return Buffer.concat([header, entry, pngBuffer]);
}

await mkdir(out, { recursive: true });
const files = {
  "pwa-192x192.png": await png(svg, 192),
  "pwa-512x512.png": await png(svg, 512),
  "pwa-maskable-512x512.png": await png(fullBleed(28), 512), // 200/256 = 78% < 80% della zona sicura
  "apple-touch-icon.png": await png(fullBleed(8), 180),
  "favicon.ico": ico(await png(svg, 32), 32),
};
for (const [name, data] of Object.entries(files)) {
  await writeFile(resolve(out, name), data);
  console.log(`${name}  ${data.length} byte`);
}
