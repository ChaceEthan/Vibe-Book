const { v2: cloudinary } = require("cloudinary");

const config = {
  secure: true,
};

if (!process.env.CLOUDINARY_URL) {
  config.cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  config.api_key = process.env.CLOUDINARY_API_KEY;
  config.api_secret = process.env.CLOUDINARY_API_SECRET;
}

cloudinary.config(config);

module.exports = cloudinary;
