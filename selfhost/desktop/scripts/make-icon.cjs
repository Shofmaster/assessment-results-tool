/**
 * Generate AeroGap.ico from the app's own brand mark.
 *
 * WHY IT IS GENERATED RATHER THAN DRAWN
 * The icon has to be the SAME artwork as the web app's favicon, or the desktop
 * build looks like a different product. public/favicon.svg is the source of
 * truth, so this rasterizes that file rather than reproducing it by hand -
 * which would drift the moment anyone touched the brand.
 *
 * WHY ELECTRON DOES THE RASTERIZING
 * The project has no image library, and adding sharp/resvg for one build-time
 * asset would pull a native toolchain into every developer's install. Electron
 * is already a dependency here and contains Chromium, which renders SVG better
 * than any library we could add. The window is offscreen and never shown.
 *
 * Run once when the brand changes; the .ico is committed.
 *
 *     npx electron scripts/make-icon.cjs
 */
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SVG_SOURCE = path.resolve(__dirname, '..', '..', '..', 'public', 'favicon.svg');
const OUTPUT = path.resolve(__dirname, '..', 'build', 'AeroGap.ico');

/**
 * Sizes Windows actually asks for.
 *   16  tray, title bar, small list views
 *   32  taskbar, alt-tab
 *   48  medium icons in Explorer
 *   64  some HiDPI title bars
 *   128 large icons
 *   256 extra-large icons, and the one the installer shows
 */
const SIZES = [16, 32, 48, 64, 128, 256];

/**
 * Pack 32-bit BGRA pixels as an ICO "BMP" entry.
 *
 * The format is a BITMAPINFOHEADER whose HEIGHT IS DOUBLED - the second half
 * describes a 1-bit AND (transparency) mask that predates alpha channels. The
 * mask is still required even for 32-bit icons: omitting it produces an icon
 * that renders correctly in some Windows surfaces and as garbage in others.
 * Rows are bottom-up, which is why the loop below walks y backwards.
 */
function bmpEntry(bgra, size) {
  const headerSize = 40;
  const pixelBytes = size * size * 4;
  // AND mask rows are padded to a 4-byte boundary.
  const maskRowBytes = Math.ceil(size / 32) * 4;
  const maskBytes = maskRowBytes * size;

  const buffer = Buffer.alloc(headerSize + pixelBytes + maskBytes);
  let o = 0;
  buffer.writeUInt32LE(headerSize, o); o += 4;      // biSize
  buffer.writeInt32LE(size, o); o += 4;             // biWidth
  buffer.writeInt32LE(size * 2, o); o += 4;         // biHeight (doubled: XOR + AND)
  buffer.writeUInt16LE(1, o); o += 2;               // biPlanes
  buffer.writeUInt16LE(32, o); o += 2;              // biBitCount
  buffer.writeUInt32LE(0, o); o += 4;               // biCompression = BI_RGB
  buffer.writeUInt32LE(pixelBytes + maskBytes, o); o += 4;
  o += 16;                                          // resolution + palette fields stay zero

  // Bottom-up rows.
  for (let y = size - 1; y >= 0; y -= 1) {
    const rowStart = y * size * 4;
    bgra.copy(buffer, o, rowStart, rowStart + size * 4);
    o += size * 4;
  }

  // AND mask: all zero means "use the alpha channel", which is what we want.
  return buffer;
}

/** Assemble the ICO container. */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(images.length, 4);

  const directory = Buffer.alloc(16 * images.length);
  let offset = header.length + directory.length;
  const bodies = [];

  images.forEach((image, index) => {
    const d = index * 16;
    // 256 is encoded as 0 - the field is a single byte.
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, d + 0);
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, d + 1);
    directory.writeUInt8(0, d + 2);  // palette entries
    directory.writeUInt8(0, d + 3);  // reserved
    directory.writeUInt16LE(1, d + 4);   // colour planes
    directory.writeUInt16LE(32, d + 6);  // bits per pixel
    directory.writeUInt32LE(image.data.length, d + 8);
    directory.writeUInt32LE(offset, d + 12);
    offset += image.data.length;
    bodies.push(image.data);
  });

  return Buffer.concat([header, directory, ...bodies]);
}

/**
 * Render the SVG once at the largest size and return that NativeImage.
 *
 * An earlier version created a fresh transparent offscreen window per size.
 * The 16px render succeeded and the very next one failed the data-URL load with
 * ERR_FAILED - repeatedly creating transparent offscreen windows is not
 * reliable. Rendering once and downscaling is both more robust and what every
 * icon toolchain does anyway; the mark is bold enough to survive it.
 *
 * The HTML goes to a temp FILE rather than a data: URL. A long data URL was the
 * thing that failed, and a file load has no length limit to worry about.
 */
async function renderLargest(svgText, size) {
  const win = new BrowserWindow({
    width: size,
    height: size,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: true, nodeIntegration: false, contextIsolation: true },
  });

  const html = `<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;padding:0;width:${size}px;height:${size}px;background:transparent;overflow:hidden}
  svg{display:block;width:${size}px;height:${size}px}
</style>
${svgText}`;

  const tmpFile = path.join(os.tmpdir(), `aerogap-icon-${process.pid}.html`);
  fs.writeFileSync(tmpFile, html, 'utf8');

  try {
    await win.loadFile(tmpFile);
    // One frame to settle. capturePage before paint yields a blank bitmap.
    await new Promise((r) => setTimeout(r, 400));
    const image = await win.webContents.capturePage();
    return image;
  } finally {
    win.destroy();
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      /* best effort */
    }
  }
}

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  try {
    const svgText = fs.readFileSync(SVG_SOURCE, 'utf8');
    const largest = Math.max(...SIZES);
    const master = await renderLargest(svgText, largest);
    console.log(`  rendered master at ${largest}x${largest}`);

    // ALWAYS resize, including to the master's own nominal size. capturePage
    // honours the display's scale factor, so a 256px window on a HiDPI screen
    // returns a 512x512 bitmap - useful extra detail to downscale from, but it
    // means the master is never safe to use as-is.
    console.log(`  captured ${master.getSize().width}x${master.getSize().height} (device pixel ratio applied)`);

    const images = [];
    for (const size of SIZES) {
      const scaled = master.resize({ width: size, height: size, quality: 'best' });
      const bgra = scaled.toBitmap();
      if (bgra.length !== size * size * 4) {
        throw new Error(`Expected ${size * size * 4} bytes at ${size}px, got ${bgra.length}`);
      }
      images.push({ size, data: bmpEntry(bgra, size) });
      console.log(`  packed ${size}x${size}`);
    }

    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    const ico = buildIco(images);
    fs.writeFileSync(OUTPUT, ico);
    console.log(`\nWrote ${OUTPUT} (${ico.length} bytes, ${images.length} sizes)`);
    app.exit(0);
  } catch (err) {
    console.error('Icon generation failed:', err);
    app.exit(1);
  }
});
