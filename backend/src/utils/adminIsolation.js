const configuredAdminEmails = () =>
  [
    process.env.ISAAC_ADMIN_EMAIL,
    process.env.ADMIN_EMAIL,
    process.env.ADMIN_EMAILS,
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

const isConfiguredAdminEmail = (email = "") => configuredAdminEmails().includes(String(email || "").trim().toLowerCase());

const isAdminUser = (user) => user?.role === "admin" || user?.accountRole === "admin";

const isProtectedUser = (user) => Boolean(user?.protected || isAdminUser(user) || isConfiguredAdminEmail(user?.email));

const applyAdminIsolation = async (user) => {
  if (!user) {
    return user;
  }

  const updates = {};

  if (isConfiguredAdminEmail(user.email)) {
    if (user.role !== "admin") updates.role = "admin";
    if (user.accountRole !== "admin") updates.accountRole = "admin";
    if (user.protected !== true) updates.protected = true;
  } else if (isAdminUser(user) && user.protected !== true) {
    updates.protected = true;
  }

  if (!Object.keys(updates).length) {
    return user;
  }

  Object.assign(user, updates);
  await user.save({ validateBeforeSave: false });
  return user;
};

module.exports = {
  applyAdminIsolation,
  isAdminUser,
  isConfiguredAdminEmail,
  isProtectedUser,
};
