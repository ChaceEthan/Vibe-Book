const User = require("../models/User");

const publicRoles = User.allowedRoles.filter((role) => role !== "admin");
const allowedGenders = ["male", "female", "mixed", "other"];
const allowedLanguages = ["en", "rw", "sw", "fr", "lg"];
const defaultCategoryByRole = {
  dancer: "Modern Dance",
  dj: "DJs",
  mc: "MCs",
  artist: "Artists",
  crew: "Crew groups",
};

const hasOwn = (source, field) => Object.prototype.hasOwnProperty.call(source, field);

const normalizeText = (value) => {
  return typeof value === "string" ? value.trim() : "";
};

const normalizeLowerText = (value) => normalizeText(value).toLowerCase();

const normalizeEmail = (value) => normalizeLowerText(value);

const normalizeStringArray = (value) => {
  const values = Array.isArray(value) ? value : String(value || "").split(/[\n,]/);

  return values
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .slice(0, 25);
};

const normalizeMediaPath = (value) => {
  const mediaPath = normalizeText(value);

  if (!mediaPath) {
    return "";
  }

  if (mediaPath.startsWith("/uploads/")) {
    return mediaPath;
  }

  try {
    const parsed = new URL(mediaPath);

    if (parsed.pathname.startsWith("/uploads/")) {
      return parsed.pathname;
    }

    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return mediaPath;
    }
  } catch {
    return "";
  }

  return "";
};

const normalizeMediaArray = (value, field) => {
  const values = normalizeStringArray(value).map(normalizeMediaPath).filter(Boolean);

  if (Array.isArray(value) && values.length !== value.filter(Boolean).length) {
    return {
      error: `${field} must contain valid upload URLs`,
    };
  }

  return { value: values };
};

const normalizeDescriptionArray = (value) => {
  const items = Array.isArray(value) ? value : [];

  return items
    .map((item) => {
      const url = normalizeMediaPath(item?.url);
      const description = normalizeText(item?.description).slice(0, 500);
      return url ? { url, description } : null;
    })
    .filter(Boolean);
};

const findAllowedValue = (value, allowedValues) => {
  const normalized = normalizeLowerText(value);
  return allowedValues.find((allowedValue) => allowedValue.toLowerCase() === normalized);
};

const normalizeRole = (value, { allowAdmin = false } = {}) => {
  const role = normalizeLowerText(value);
  const allowedRoles = allowAdmin ? User.allowedRoles : publicRoles;

  if (!allowedRoles.includes(role)) {
    return {
      error: `Role must be one of: ${allowedRoles.join(", ")}`,
    };
  }

  return { value: role };
};

const normalizeType = (value) => {
  const type = normalizeLowerText(value);

  if (!User.allowedTypes.includes(type)) {
    return {
      error: `Type must be one of: ${User.allowedTypes.join(", ")}`,
    };
  }

  return { value: type };
};

const normalizeAccountType = (value) => {
  const accountType = normalizeLowerText(value);

  if (!User.allowedAccountTypes.includes(accountType)) {
    return {
      error: `Account type must be one of: ${User.allowedAccountTypes.join(", ")}`,
    };
  }

  return { value: accountType };
};

const normalizeGender = (value) => {
  const gender = normalizeLowerText(value);

  if (!gender) {
    return { value: "" };
  }

  if (!allowedGenders.includes(gender)) {
    return {
      error: `Gender must be one of: ${allowedGenders.join(", ")}`,
    };
  }

  return { value: gender };
};

const normalizeCategory = (value) => {
  const category = findAllowedValue(value, User.allowedCategories);

  if (!category) {
    return {
      error: `Category must be one of: ${User.allowedCategories.join(", ")}`,
    };
  }

  return { value: category };
};

const normalizeAvailability = (value) => {
  const availability = normalizeLowerText(value);

  if (!User.allowedAvailability.includes(availability)) {
    return {
      error: `Availability must be one of: ${User.allowedAvailability.join(", ")}`,
    };
  }

  return { value: availability };
};

const normalizePrice = (value, field = "price") => {
  const price = Number(value);

  if (!Number.isFinite(price) || price < 0) {
    return { error: `${field} must be a valid positive number` };
  }

  return { value: price };
};

const normalizeSocialLinks = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      error: "Social links must be an object",
    };
  }

  return {
    value: {
      whatsapp: normalizeText(value.whatsapp),
      instagram: normalizeText(value.instagram),
    },
  };
};

const normalizeProfileFields = (body, options = {}) => {
  const { allowRole = false } = options;
  const data = {};
  const errors = [];

  if (hasOwn(body, "name")) {
    data.name = normalizeText(body.name);
    if (!data.name) {
      errors.push("Name cannot be empty");
    }
  }

  if (hasOwn(body, "role") && allowRole) {
    const result = normalizeRole(body.role);
    if (result.error) errors.push(result.error);
    else data.role = result.value;
  }

  if (hasOwn(body, "type")) {
    const result = normalizeType(body.type);
    if (result.error) errors.push(result.error);
    else data.type = result.value;
  }

  if (hasOwn(body, "accountType")) {
    const result = normalizeAccountType(body.accountType);
    if (result.error) errors.push(result.error);
    else data.accountType = result.value;
  }

  if (hasOwn(body, "gender")) {
    const result = normalizeGender(body.gender);
    if (result.error) errors.push(result.error);
    else data.gender = result.value;
  }

  if (hasOwn(body, "category") && normalizeText(body.category)) {
    const result = normalizeCategory(body.category);
    if (result.error) errors.push(result.error);
    else data.category = result.value;
  }

  if (hasOwn(body, "price")) {
    const result = normalizePrice(body.price);
    if (result.error) errors.push(result.error);
    else data.price = result.value;
  }

  if (hasOwn(body, "skills")) {
    data.skills = normalizeStringArray(body.skills)
      .map((skill) => skill.replace(/^#/, "").trim())
      .filter(Boolean)
      .slice(0, 20);
  }

  ["phone", "whatsappNumber", "whatsapp", "location", "province", "district", "bio"].forEach((field) => {
    if (hasOwn(body, field)) {
      data[field] = normalizeText(body[field]);
    }
  });

  if (hasOwn(data, "whatsapp") && !hasOwn(data, "whatsappNumber")) {
    data.whatsappNumber = data.whatsapp;
  }

  if (hasOwn(data, "whatsappNumber") && !hasOwn(data, "whatsapp")) {
    data.whatsapp = data.whatsappNumber;
  }

  if (hasOwn(body, "socialLinks")) {
    const result = normalizeSocialLinks(body.socialLinks);
    if (result.error) errors.push(result.error);
    else data.socialLinks = result.value;
  }

  if (hasOwn(body, "images")) {
    const result = normalizeMediaArray(body.images, "Images");
    if (result.error) errors.push(result.error);
    else {
      data.images = result.value;
      data.gallery = result.value;
    }
  }

  if (hasOwn(body, "imageDescriptions")) {
    data.imageDescriptions = normalizeDescriptionArray(body.imageDescriptions);
  }

  if (hasOwn(body, "videos")) {
    const result = normalizeMediaArray(body.videos, "Videos");
    if (result.error) errors.push(result.error);
    else {
      data.videos = result.value;
      data.videoUrls = result.value;
    }
  }

  if (hasOwn(body, "videoDescriptions")) {
    data.videoDescriptions = normalizeDescriptionArray(body.videoDescriptions);
  }

  if (hasOwn(body, "profilePicture")) {
    data.profilePicture = normalizeText(body.profilePicture);
    data.profileImage = data.profilePicture;
  }

  if (hasOwn(body, "profileImage") && !hasOwn(body, "profilePicture")) {
    data.profileImage = normalizeText(body.profileImage);
    data.profilePicture = data.profileImage;
  }

  if (hasOwn(body, "availability")) {
    const result = normalizeAvailability(body.availability);
    if (result.error) errors.push(result.error);
    else data.availability = result.value;
  }

  if (hasOwn(body, "language")) {
    const language = normalizeLowerText(body.language);
    data.language = allowedLanguages.includes(language) ? language : "en";
  }

  if (hasOwn(body, "notificationEnabled")) {
    data.notificationEnabled = body.notificationEnabled === true || body.notificationEnabled === "true";
  }

  if (data.role && !data.category) {
    data.category = defaultCategoryByRole[data.role];
  }

  if (data.role === "crew") {
    data.type = "crew";
  }

  return { data, errors };
};

module.exports = {
  allowedGenders,
  allowedLanguages,
  defaultCategoryByRole,
  findAllowedValue,
  normalizeAvailability,
  normalizeAccountType,
  normalizeCategory,
  normalizeEmail,
  normalizeGender,
  normalizeLowerText,
  normalizeMediaPath,
  normalizePrice,
  normalizeProfileFields,
  normalizeRole,
  normalizeStringArray,
  normalizeText,
  normalizeType,
  publicRoles,
};
