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
    availability: "Status",
    bio: "Bio",
    bookingReady: "Featured topics",
    bookingReadyCopy: "Follow creators, watch fresh posts, and manage your social activity.",
    category: "Category",
    clearProfiles: "Explore profiles",
    clearProfilesCopy: "View creators, posts, bios, socials, and profile highlights.",
    createProfile: "Create Profile",
    dashboard: "Dashboard",
    entertainmentMarketplace: "Short-video social platform",
    exploreProfiles: "Explore Profiles",
    fastDiscovery: "Creator discovery",
    fastDiscoveryCopy: "Filter by topic, category, gender, and location.",
    findTalent: "Find Creators, Videos & Communities",
    free: "Free",
    gender: "Gender",
    home: "Home",
    homeCopy: "Discover creators, follow profiles, and watch fresh short-form videos.",
    imageGallery: "Image gallery",
    joinAsTalent: "Join VibeBook",
    language: "Language",
    location: "Location",
    name: "Name",
    phone: "Phone",
    premium: "Premium",
    price: "Budget",
    profileUpdated: "Profile updated successfully.",
    rating: "Rating",
    role: "Role",
    saveProfile: "Save Profile",
    saving: "Saving...",
    searchTalent: "Search Creators",
    type: "Type",
    updateProfile: "Update Profile",
    videos: "Videos",
    welcome: "Welcome",
    whatsapp: "WhatsApp",
  },
  rw: {
    availability: "Kuboneka",
    bio: "Ibyerekeye",
    bookingReady: "Topics featured",
    bookingReadyCopy: "Follow creators, watch posts, and manage your social activity.",
    category: "Icyiciro",
    clearProfiles: "Profiles zisobanutse",
    clearProfilesCopy: "Explore creators, posts, bios, socials, and highlights.",
    createProfile: "Kora Profile",
    dashboard: "Dashboard",
    entertainmentMarketplace: "Short-video social platform",
    exploreProfiles: "Reba Profiles",
    fastDiscovery: "Kubona vuba",
    fastDiscoveryCopy: "Filter by topic, category, gender, and location.",
    findTalent: "Find creators, videos, and communities",
    free: "Ubuntu",
    gender: "Igitsina",
    home: "Ahabanza",
    homeCopy: "Discover creators, follow profiles, and watch fresh short-form videos.",
    imageGallery: "Amafoto",
    joinAsTalent: "Join VibeBook",
    language: "Ururimi",
    location: "Aho uherereye",
    name: "Izina",
    phone: "Telefone",
    premium: "Premium",
    price: "Budget",
    profileUpdated: "Profile yavuguruwe neza.",
    rating: "Amanota",
    role: "Uruhare",
    saveProfile: "Bika Profile",
    saving: "Birabikwa...",
    searchTalent: "Search Creators",
    type: "Ubwoko",
    updateProfile: "Vugurura Profile",
    videos: "Amavideo",
    welcome: "Murakaza neza",
    whatsapp: "WhatsApp",
  },
  sw: {
    availability: "Upatikanaji",
    bio: "Wasifu",
    bookingReady: "Featured topics",
    bookingReadyCopy: "Follow creators, watch posts, and manage your social activity.",
    category: "Kategoria",
    clearProfiles: "Profiles wazi",
    clearProfilesCopy: "Explore creators, posts, bios, socials, and highlights.",
    createProfile: "Tengeneza Profile",
    dashboard: "Dashboard",
    entertainmentMarketplace: "Short-video social platform",
    exploreProfiles: "Tazama Profiles",
    fastDiscovery: "Ugunduzi wa haraka",
    fastDiscoveryCopy: "Filter by topic, category, gender, and location.",
    findTalent: "Find creators, videos, and communities",
    free: "Bure",
    gender: "Jinsia",
    home: "Nyumbani",
    homeCopy: "Discover creators, follow profiles, and watch fresh short-form videos.",
    imageGallery: "Picha",
    joinAsTalent: "Join VibeBook",
    language: "Lugha",
    location: "Mahali",
    name: "Jina",
    phone: "Simu",
    premium: "Premium",
    price: "Budget",
    profileUpdated: "Profile imesasishwa.",
    rating: "Ukadiriaji",
    role: "Jukumu",
    saveProfile: "Hifadhi Profile",
    saving: "Inahifadhi...",
    searchTalent: "Search Creators",
    type: "Aina",
    updateProfile: "Sasisha Profile",
    videos: "Video",
    welcome: "Karibu",
    whatsapp: "WhatsApp",
  },
  fr: {
    availability: "Disponibilite",
    bio: "Bio",
    bookingReady: "Featured topics",
    bookingReadyCopy: "Follow creators, watch posts, and manage your social activity.",
    category: "Categorie",
    clearProfiles: "Profiles clairs",
    clearProfilesCopy: "Explore creators, posts, bios, socials, and highlights.",
    createProfile: "Creer Profile",
    dashboard: "Dashboard",
    entertainmentMarketplace: "Short-video social platform",
    exploreProfiles: "Explorer Profiles",
    fastDiscovery: "Recherche rapide",
    fastDiscoveryCopy: "Filter by topic, category, gender, and location.",
    findTalent: "Find creators, videos, and communities",
    free: "Gratuit",
    gender: "Genre",
    home: "Accueil",
    homeCopy: "Discover creators, follow profiles, and watch fresh short-form videos.",
    imageGallery: "Galerie d'images",
    joinAsTalent: "Join VibeBook",
    language: "Langue",
    location: "Lieu",
    name: "Nom",
    phone: "Telephone",
    premium: "Premium",
    price: "Budget",
    profileUpdated: "Profile mis a jour.",
    rating: "Note",
    role: "Role",
    saveProfile: "Enregistrer Profile",
    saving: "Enregistrement...",
    searchTalent: "Search Creators",
    type: "Type",
    updateProfile: "Mettre a jour Profile",
    videos: "Videos",
    welcome: "Bienvenue",
    whatsapp: "WhatsApp",
  },
  lg: {
    availability: "Obudde obuliwo",
    bio: "Ebikwata ku muntu",
    bookingReady: "Featured topics",
    bookingReadyCopy: "Follow creators, watch posts, and manage your social activity.",
    category: "Ekika",
    clearProfiles: "Profiles ezitegeerekeka",
    clearProfilesCopy: "Explore creators, posts, bios, socials, and highlights.",
    createProfile: "Kola Profile",
    dashboard: "Dashboard",
    entertainmentMarketplace: "Short-video social platform",
    exploreProfiles: "Kebera Profiles",
    fastDiscovery: "Okuzuula amangu",
    fastDiscoveryCopy: "Filter by topic, category, gender, and location.",
    findTalent: "Find creators, videos, and communities",
    free: "Bwa bwereere",
    gender: "Ekikula",
    home: "Awaka",
    homeCopy: "Discover creators, follow profiles, and watch fresh short-form videos.",
    imageGallery: "Ebifananyi",
    joinAsTalent: "Join VibeBook",
    language: "Olulimi",
    location: "Ekifo",
    name: "Erinnya",
    phone: "Essimu",
    premium: "Premium",
    price: "Budget",
    profileUpdated: "Profile eterezeddwa.",
    rating: "Rating",
    role: "Omulimu",
    saveProfile: "Tereka Profile",
    saving: "Etereka...",
    searchTalent: "Search Creators",
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
