const { v2: cloudinary } = require("cloudinary");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env"), quiet: true });

const realValue = (value) => (value && !/^your_/i.test(String(value).trim()) ? value : undefined);

const config = {
  secure: true,
  cloud_name: realValue(process.env.CLOUDINARY_CLOUD_NAME),
  api_key: realValue(process.env.CLOUDINARY_API_KEY),
  api_secret: realValue(process.env.CLOUDINARY_API_SECRET),
};

console.log("Cloudinary active:", Boolean(config.cloud_name && config.api_key && config.api_secret));

cloudinary.config(config);

module.exports = cloudinary;
