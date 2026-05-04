const BOOKING_ACCESS_FEE = 1000;
const BOOKING_ACCESS_CURRENCY = "RWF";

const roleBasePrices = {
  dancer: 1000,
  dj: 1500,
  mc: 1500,
  artist: 2500,
  crew: 2000,
};

const getBookingAccessAmount = (role = "dancer") => {
  return roleBasePrices[role] || BOOKING_ACCESS_FEE;
};

module.exports = {
  BOOKING_ACCESS_CURRENCY,
  BOOKING_ACCESS_FEE,
  getBookingAccessAmount,
};
