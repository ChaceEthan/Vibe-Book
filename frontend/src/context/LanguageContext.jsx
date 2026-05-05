// @ts-nocheck
import { createContext, useContext, useMemo, useState } from "react";

const STORAGE_KEY = "vibebook_language";

export const languages = [
  { code: "en", label: "English" },
  { code: "rw", label: "Kinyarwanda" },
  { code: "sw", label: "Swahili" },
  { code: "fr", label: "French" },
  { code: "lg", label: "Luganda" },
];

const dictionary = {
  en: {
    availability: "Availability",
    bio: "Bio",
    bookingReady: "Featured categories",
    bookingReadyCopy: "Send requests and manage booking status from one dashboard.",
    category: "Category",
    clearProfiles: "Explore profiles",
    clearProfilesCopy: "View images, pricing, ratings, bio, and protected contact options.",
    createProfile: "Create Profile",
    dashboard: "Dashboard",
    entertainmentMarketplace: "Entertainment talent marketplace",
    exploreProfiles: "Explore Profiles",
    fastDiscovery: "Rwanda talent search",
    fastDiscoveryCopy: "Filter by role, category, gender, type, availability, and price.",
    findTalent: "Find Professional Dancers, DJs & Artists",
    free: "Free",
    gender: "Gender",
    home: "Home",
    homeCopy: "Discover verified performers, compare profiles, and start booking creative talent for your next event.",
    imageGallery: "Image gallery",
    joinAsTalent: "Join as Talent",
    language: "Language",
    location: "Location",
    name: "Name",
    phone: "Phone",
    premium: "Premium",
    price: "Price",
    profileUpdated: "Profile updated successfully.",
    rating: "Rating",
    role: "Role",
    saveProfile: "Save Profile",
    saving: "Saving...",
    searchTalent: "Search Talent",
    type: "Type",
    updateProfile: "Update Profile",
    videos: "Videos",
    welcome: "Welcome",
    whatsapp: "WhatsApp",
  },
  rw: {
    availability: "Kuboneka",
    bio: "Ibyerekeye",
    bookingReady: "Kwitegura kubukinga",
    bookingReadyCopy: "Ohereza ubusabe kandi ukurikirane uko bumeze muri dashboard.",
    category: "Icyiciro",
    clearProfiles: "Profiles zisobanutse",
    clearProfilesCopy: "Reba amafoto, ibiciro, amanota, bio, n'uburyo bwo kubona contact burinzwe.",
    createProfile: "Kora Profile",
    dashboard: "Dashboard",
    entertainmentMarketplace: "Isoko ry'abanyempano",
    exploreProfiles: "Reba Profiles",
    fastDiscovery: "Kubona vuba",
    fastDiscoveryCopy: "Shakisha ukoresheje uruhare, icyiciro, igitsina, ubwoko, kuboneka, n'igiciro.",
    findTalent: "Shaka Ababyinnyi, DJs n'Abahanzi b'Umwuga",
    free: "Ubuntu",
    gender: "Igitsina",
    home: "Ahabanza",
    homeCopy: "Menya abanyempano bagenzuwe, gereranya profiles, utangire kubukinga talent.",
    imageGallery: "Amafoto",
    joinAsTalent: "Injira nk'umunyempano",
    language: "Ururimi",
    location: "Aho uherereye",
    name: "Izina",
    phone: "Telefone",
    premium: "Premium",
    price: "Igiciro",
    profileUpdated: "Profile yavuguruwe neza.",
    rating: "Amanota",
    role: "Uruhare",
    saveProfile: "Bika Profile",
    saving: "Birabikwa...",
    searchTalent: "Shaka Talent",
    type: "Ubwoko",
    updateProfile: "Vugurura Profile",
    videos: "Amavideo",
    welcome: "Murakaza neza",
    whatsapp: "WhatsApp",
  },
  sw: {
    availability: "Upatikanaji",
    bio: "Wasifu",
    bookingReady: "Tayari kwa booking",
    bookingReadyCopy: "Tuma maombi na fuatilia hali yake kwenye dashboard.",
    category: "Kategoria",
    clearProfiles: "Profiles wazi",
    clearProfilesCopy: "Tazama picha, bei, ratings, bio, na njia za contact zilizolindwa.",
    createProfile: "Tengeneza Profile",
    dashboard: "Dashboard",
    entertainmentMarketplace: "Soko la vipaji vya burudani",
    exploreProfiles: "Tazama Profiles",
    fastDiscovery: "Ugunduzi wa haraka",
    fastDiscoveryCopy: "Chuja kwa jukumu, kategoria, jinsia, aina, upatikanaji, na bei.",
    findTalent: "Pata Dancers, DJs na Artists wa Kitaalamu",
    free: "Bure",
    gender: "Jinsia",
    home: "Nyumbani",
    homeCopy: "Gundua vipaji vilivyothibitishwa, linganisha profiles, na anza booking.",
    imageGallery: "Picha",
    joinAsTalent: "Jiunge kama Talent",
    language: "Lugha",
    location: "Mahali",
    name: "Jina",
    phone: "Simu",
    premium: "Premium",
    price: "Bei",
    profileUpdated: "Profile imesasishwa.",
    rating: "Ukadiriaji",
    role: "Jukumu",
    saveProfile: "Hifadhi Profile",
    saving: "Inahifadhi...",
    searchTalent: "Tafuta Talent",
    type: "Aina",
    updateProfile: "Sasisha Profile",
    videos: "Video",
    welcome: "Karibu",
    whatsapp: "WhatsApp",
  },
  fr: {
    availability: "Disponibilite",
    bio: "Bio",
    bookingReady: "Pret pour les reservations",
    bookingReadyCopy: "Envoyez des demandes et suivez leur statut depuis le dashboard.",
    category: "Categorie",
    clearProfiles: "Profiles clairs",
    clearProfilesCopy: "Consultez images, prix, notes, bio et contacts proteges.",
    createProfile: "Creer Profile",
    dashboard: "Dashboard",
    entertainmentMarketplace: "Marche des talents du divertissement",
    exploreProfiles: "Explorer Profiles",
    fastDiscovery: "Recherche rapide",
    fastDiscoveryCopy: "Filtrez par role, categorie, genre, type, disponibilite et prix.",
    findTalent: "Trouvez des Danseurs, DJs et Artistes Professionnels",
    free: "Gratuit",
    gender: "Genre",
    home: "Accueil",
    homeCopy: "Decouvrez des talents verifies, comparez les profiles et commencez une reservation.",
    imageGallery: "Galerie d'images",
    joinAsTalent: "Rejoindre comme Talent",
    language: "Langue",
    location: "Lieu",
    name: "Nom",
    phone: "Telephone",
    premium: "Premium",
    price: "Prix",
    profileUpdated: "Profile mis a jour.",
    rating: "Note",
    role: "Role",
    saveProfile: "Enregistrer Profile",
    saving: "Enregistrement...",
    searchTalent: "Chercher Talent",
    type: "Type",
    updateProfile: "Mettre a jour Profile",
    videos: "Videos",
    welcome: "Bienvenue",
    whatsapp: "WhatsApp",
  },
  lg: {
    availability: "Obudde obuliwo",
    bio: "Ebikwata ku muntu",
    bookingReady: "Booking esoboka",
    bookingReadyCopy: "Weereza okusaba era ogoberere embeera yaako ku dashboard.",
    category: "Ekika",
    clearProfiles: "Profiles ezitegeerekeka",
    clearProfilesCopy: "Laba ebifananyi, ebbeeyi, ratings, bio, n'engeri za contact ezikuumibwa.",
    createProfile: "Kola Profile",
    dashboard: "Dashboard",
    entertainmentMarketplace: "Akatale k'ebitone by'amasanyu",
    exploreProfiles: "Kebera Profiles",
    fastDiscovery: "Okuzuula amangu",
    fastDiscoveryCopy: "Sengejja okusinziira ku mulimu, ekika, ekikula, obudde, n'ebbeeyi.",
    findTalent: "Zuula Dancers, DJs ne Artists abakugu",
    free: "Bwa bwereere",
    gender: "Ekikula",
    home: "Awaka",
    homeCopy: "Zuula abantu abakakasiddwa, geraageranya profiles, otandike booking.",
    imageGallery: "Ebifananyi",
    joinAsTalent: "Yingira nga Talent",
    language: "Olulimi",
    location: "Ekifo",
    name: "Erinnya",
    phone: "Essimu",
    premium: "Premium",
    price: "Ebbeeyi",
    profileUpdated: "Profile eterezeddwa.",
    rating: "Rating",
    role: "Omulimu",
    saveProfile: "Tereka Profile",
    saving: "Etereka...",
    searchTalent: "Noonya Talent",
    type: "Ekika",
    updateProfile: "Tereza Profile",
    videos: "Video",
    welcome: "Tukwanirizza",
    whatsapp: "WhatsApp",
  },
};

const LanguageContext = createContext(null);

const getInitialLanguage = () => {
  const savedLanguage = localStorage.getItem(STORAGE_KEY);
  return languages.some((language) => language.code === savedLanguage) ? savedLanguage : "en";
};

export const LanguageProvider = ({ children }) => {
  const [language, setLanguageState] = useState(getInitialLanguage);

  const setLanguage = (nextLanguage) => {
    const supportedLanguage = languages.some((item) => item.code === nextLanguage) ? nextLanguage : "en";
    setLanguageState(supportedLanguage);
    localStorage.setItem(STORAGE_KEY, supportedLanguage);
  };

  const value = useMemo(
    () => ({
      language,
      languages,
      setLanguage,
      t: (key) => dictionary[language]?.[key] || dictionary.en[key] || key,
    }),
    [language]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error("useLanguage must be used inside LanguageProvider");
  }

  return context;
};
