const toUploadPath = (file, folder) => `/uploads/${folder}/${file.filename}`;

module.exports = {
  toUploadPath,
};
