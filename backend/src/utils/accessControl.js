// @ts-nocheck
const TRIAL_DAYS = 30;
const PLATFORM_ACCESS_AMOUNT = 1000;
const PLATFORM_ACCESS_CURRENCY = "RWF";

const addDays = (date, days) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
};

const getTrialStartDate = (user) => {
  if (!user?.trialStartDate) {
    return user?.createdAt ? new Date(user.createdAt) : null;
  }

  return new Date(user.trialStartDate);
};

const getTrialEndDate = (user) => {
  const trialStartDate = getTrialStartDate(user);

  if (!trialStartDate || Number.isNaN(trialStartDate.getTime())) {
    return null;
  }

  return addDays(trialStartDate, TRIAL_DAYS);
};

const isTrialActive = (user, now = new Date()) => {
  const trialEndDate = getTrialEndDate(user);

  if (!trialEndDate) {
    return false;
  }

  return trialEndDate.getTime() >= now.getTime();
};

const hasPlatformAccess = (user, now = new Date()) => {
  return Boolean(user?.hasPaidAccess || isTrialActive(user, now));
};

const buildAccessState = (user, now = new Date()) => {
  const trialStartDate = getTrialStartDate(user);
  const trialEndsAt = getTrialEndDate(user);
  const trialActive = isTrialActive(user, now);
  const hasPaidAccess = Boolean(user?.hasPaidAccess);

  return {
    trialStartDate,
    trialEndsAt,
    trialActive,
    hasPaidAccess,
    hasAccess: hasPaidAccess || trialActive,
    lastPaymentDate: user?.lastPaymentDate || null,
    unlockAmount: PLATFORM_ACCESS_AMOUNT,
    unlockCurrency: PLATFORM_ACCESS_CURRENCY,
  };
};

const syncTrialState = async (user) => {
  if (!user) {
    return user;
  }

  const trialActive = isTrialActive(user);

  if (user.trialActive !== trialActive) {
    user.trialActive = trialActive;

    if (typeof user.save === "function") {
      await user.save({ validateBeforeSave: false });
    }
  }

  return user;
};

module.exports = {
  PLATFORM_ACCESS_AMOUNT,
  PLATFORM_ACCESS_CURRENCY,
  TRIAL_DAYS,
  buildAccessState,
  hasPlatformAccess,
  isTrialActive,
  syncTrialState,
};
