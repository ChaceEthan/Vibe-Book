const {
  uploadFiles,
  uploadImages,
  uploadSingleImage,
  uploadVideos,
} = require("./uploadMiddleware");

module.exports = uploadFiles;
module.exports.uploadFiles = uploadFiles;
module.exports.uploadImages = uploadImages;
module.exports.uploadSingleImage = uploadSingleImage;
module.exports.uploadVideos = uploadVideos;
