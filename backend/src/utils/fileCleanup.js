const fs = require("fs/promises");

const cloudinary = require("../config/cloudinary");

const isRemotePath = (value) => /^https?:\/\//i.test(value || "");
const resourceTypeFor = (file) =>
  file?.cloudinary?.resource_type || file?.resource_type || (file?.mimetype?.startsWith("video/") ? "video" : "image");

const removeCloudinaryFile = async (file) => {
  if (!file?.filename) {
    return false;
  }

  await cloudinary.uploader.destroy(file.filename, {
    resource_type: resourceTypeFor(file),
    invalidate: true,
  });

  return true;
};

const removeFiles = async (files = []) => {
  await Promise.all(
    files.map(async (file) => {
      try {
        if (file?.cloudinary || isRemotePath(file?.path)) {
          await removeCloudinaryFile(file);
          return;
        }

        if (!file?.path) {
          return;
        }

        await fs.unlink(file.path);
      } catch (error) {
        if (error.code !== "ENOENT") {
          console.error(`Upload cleanup failed: ${error.message}`);
        }
      }
    })
  );
};

module.exports = {
  removeFiles,
};
