export interface LogoAsset {
  data: Buffer;
  type: "png" | "jpg" | "gif";
  width: number;
  height: number;
}

/** Read intrinsic dimensions so the logo keeps its aspect ratio in Word. */
function readSize(
  buf: Buffer
): { type: LogoAsset["type"]; width: number; height: number } | null {
  // PNG: 8-byte signature, then IHDR with width/height as big-endian uint32.
  if (buf.length > 24 && buf.toString("hex", 0, 8) === "89504e470d0a1a0a") {
    return { type: "png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  // GIF: "GIF8", then little-endian uint16 width/height.
  if (buf.length > 10 && buf.toString("ascii", 0, 4) === "GIF8") {
    return { type: "gif", width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }

  // JPEG: walk the marker segments to the start-of-frame.
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buf[offset + 1];
      // SOF0-SOF15, excluding the non-frame markers DHT/JPG/DAC.
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      ) {
        return {
          type: "jpg",
          height: buf.readUInt16BE(offset + 5),
          width: buf.readUInt16BE(offset + 7),
        };
      }
      offset += 2 + buf.readUInt16BE(offset + 2);
    }
  }

  return null;
}

const MAX_W = 150;
const MAX_H = 70;

/** Fetch an institution logo and scale it to fit the letterhead. */
export async function fetchLogo(url: string | null): Promise<LogoAsset | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > 4 * 1024 * 1024) return null;

    const size = readSize(buf);
    if (!size) return null;

    const scale = Math.min(MAX_W / size.width, MAX_H / size.height, 1);
    return {
      data: buf,
      type: size.type,
      width: Math.max(1, Math.round(size.width * scale)),
      height: Math.max(1, Math.round(size.height * scale)),
    };
  } catch {
    return null;
  }
}
