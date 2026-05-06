const fs = require("fs/promises");

const isRemotePath = (value) => /^https?:\/\//i.test(value || "");

const readUInt64BE = (buffer, offset) => {
  const high = buffer.readUInt32BE(offset);
  const low = buffer.readUInt32BE(offset + 4);
  return high * 2 ** 32 + low;
};

const readBoxHeader = (buffer, offset, end) => {
  if (offset + 8 > end) {
    return null;
  }

  let size = buffer.readUInt32BE(offset);
  const type = buffer.toString("ascii", offset + 4, offset + 8);
  let headerSize = 8;

  if (size === 1) {
    if (offset + 16 > end) {
      return null;
    }

    size = readUInt64BE(buffer, offset + 8);
    headerSize = 16;
  }

  if (size === 0) {
    size = end - offset;
  }

  if (size < headerSize || offset + size > end) {
    return null;
  }

  return {
    type,
    start: offset,
    end: offset + size,
    contentStart: offset + headerSize,
  };
};

const findMvhdBox = (buffer, start, end) => {
  let offset = start;

  while (offset + 8 <= end) {
    const box = readBoxHeader(buffer, offset, end);

    if (!box) {
      return null;
    }

    if (box.type === "mvhd") {
      return box;
    }

    if (["moov", "trak", "mdia"].includes(box.type)) {
      const nestedBox = findMvhdBox(buffer, box.contentStart, box.end);
      if (nestedBox) {
        return nestedBox;
      }
    }

    offset = box.end;
  }

  return null;
};

const getMp4DurationSeconds = async (filePath) => {
  if (!filePath || isRemotePath(filePath)) {
    return null;
  }

  const buffer = await fs.readFile(filePath);
  const mvhd = findMvhdBox(buffer, 0, buffer.length);

  if (!mvhd) {
    return null;
  }

  const version = buffer.readUInt8(mvhd.contentStart);
  const baseOffset = mvhd.contentStart + 4;
  const timescaleOffset = version === 1 ? baseOffset + 16 : baseOffset + 8;
  const durationOffset = timescaleOffset + 4;
  const timescale = buffer.readUInt32BE(timescaleOffset);
  const duration = version === 1 ? readUInt64BE(buffer, durationOffset) : buffer.readUInt32BE(durationOffset);

  if (!timescale || !Number.isFinite(duration)) {
    return null;
  }

  return duration / timescale;
};

const getUploadedVideoDurationSeconds = async (file) => {
  const cloudinaryDuration = Number(file?.cloudinary?.duration || file?.duration || 0);

  if (Number.isFinite(cloudinaryDuration) && cloudinaryDuration > 0) {
    return cloudinaryDuration;
  }

  try {
    return await getMp4DurationSeconds(file?.path);
  } catch {
    return null;
  }
};

module.exports = {
  getMp4DurationSeconds,
  getUploadedVideoDurationSeconds,
};
