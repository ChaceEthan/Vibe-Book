const fs = require("fs/promises");

const removeFiles = async (files = []) => {
  await Promise.all(
    files.map(async (file) => {
      try {
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
