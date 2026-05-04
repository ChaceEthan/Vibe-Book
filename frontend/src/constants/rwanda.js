export const RWANDA_PROVINCES = ["Kigali", "Southern", "Northern", "Western", "Eastern"];

export const RWANDA_DISTRICTS_BY_PROVINCE = {
  Kigali: ["Gasabo", "Kicukiro", "Nyarugenge"],
  Southern: ["Gisagara", "Huye", "Kamonyi", "Muhanga", "Nyamagabe", "Nyanza", "Nyaruguru", "Ruhango"],
  Northern: ["Burera", "Gakenke", "Gicumbi", "Musanze", "Rulindo"],
  Western: ["Karongi", "Ngororero", "Nyabihu", "Nyamasheke", "Rubavu", "Rusizi", "Rutsiro"],
  Eastern: ["Bugesera", "Gatsibo", "Kayonza", "Kirehe", "Ngoma", "Nyagatare", "Rwamagana"],
};

export const getDistrictsForProvince = (province) => {
  return RWANDA_DISTRICTS_BY_PROVINCE[province] || [];
};
