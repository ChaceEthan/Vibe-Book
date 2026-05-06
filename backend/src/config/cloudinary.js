// @ts-nocheck
const { v2: cloudinary } = require("cloudinary");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env"), quiet: true });

const realValue = (value) => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed && !/^your_/i.test(trimmed) ? trimmed : undefined;
};

const cloudinaryUrl = realValue(process.env.CLOUDINARY_URL);
const fallbackConfig = {
  secure: true,
  cloud_name: realValue(process.env.CLOUDINARY_CLOUD_NAME),
  api_key: realValue(process.env.CLOUDINARY_API_KEY),
  api_secret: realValue(process.env.CLOUDINARY_API_SECRET),
};
const active = Boolean(cloudinaryUrl || (fallbackConfig.cloud_name && fallbackConfig.api_key && fallbackConfig.api_secret));

console.log("Cloudinary active:", active);

if (cloudinaryUrl) {
  process.env.CLOUDINARY_URL = cloudinaryUrl;
  cloudinary.config(true);
  cloudinary.config({ secure: true });
} else {
  cloudinary.config(fallbackConfig);
}

module.exports = cloudinary;
