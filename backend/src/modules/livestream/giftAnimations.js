/**
 * Premium Gift Animation Definitions
 * Metadata-only hooks used by live gift payloads and future sound/rendering work.
 */

const GIFT_SYSTEM = {
  SMALL: {
    tier: "small",
    animationDuration: 2200,
    particleCount: 9,
    scale: 0.8,
    soundReady: true,
  },
  MEDIUM: {
    tier: "medium",
    animationDuration: 3000,
    particleCount: 16,
    scale: 1,
    soundReady: true,
  },
  PREMIUM: {
    tier: "premium",
    animationDuration: 4800,
    particleCount: 28,
    scale: 1.3,
    fullscreen: true,
    soundReady: true,
  },
};

const PREMIUM_GIFT_ANIMATIONS = {
  floating_hearts: {
    name: "Floating Hearts",
    particles: "\u2764\uFE0F",
    effect: "float_up",
    sound: "gift-heart",
  },
  flying_roses: {
    name: "Flying Roses",
    particles: "\uD83C\uDF39",
    effect: "spiral",
    sound: "gift-rose",
  },
  flower_bloom: {
    name: "Flower Bloom",
    particles: "\uD83C\uDF38",
    effect: "bloom",
    sound: "gift-flower",
  },
  like_pop: {
    name: "Like Pop",
    particles: "\uD83D\uDC4D",
    effect: "pop_burst",
    sound: "gift-like",
  },
  fire_burst: {
    name: "Fire Burst",
    particles: "\uD83D\uDD25",
    effect: "explosion",
    sound: "gift-fire",
  },
  crown_shine: {
    name: "Crown Shine",
    particles: "\uD83D\uDC51",
    effect: "rotating_glow",
    sound: "gift-crown",
  },
  rocket_launch: {
    name: "Rocket Launch",
    particles: "\uD83D\uDE80",
    effect: "launch",
    sound: "gift-rocket",
  },
  diamond_sparkle: {
    name: "Diamond Sparkle",
    particles: "\uD83D\uDC8E",
    effect: "sparkle",
    sound: "gift-diamond",
  },
  super_chat_wave: {
    name: "Super Chat Wave",
    particles: "\uD83D\uDCAC",
    effect: "chat_wave",
    sound: "gift-super-chat",
  },
  music_notes: {
    name: "Music Notes",
    particles: "\uD83C\uDFB5",
    effect: "note_float",
    sound: "gift-music",
  },
  lion_roar: {
    name: "Lion Roar",
    particles: "\uD83E\uDD81",
    effect: "fullscreen_glow",
    sound: "gift-lion",
  },
  castle_glow: {
    name: "Castle Glow",
    particles: "\uD83C\uDFF0",
    effect: "glow_cascade",
    sound: "gift-castle",
  },
  galaxy_swirl: {
    name: "Galaxy Swirl",
    particles: "\uD83C\uDF0C",
    effect: "fullscreen_swirl",
    sound: "gift-galaxy",
  },
  jet_flyby: {
    name: "Jet Flyby",
    particles: "\u2708\uFE0F",
    effect: "fullscreen_flyby",
    sound: "gift-jet",
  },
  dragon_flight: {
    name: "Dragon Flight",
    particles: "\uD83D\uDC09",
    effect: "fullscreen_sweep",
    sound: "gift-dragon",
  },
  vibebook_3d_book: {
    name: "VibeBook Celebration",
    particles: "\uD83D\uDCD8",
    effect: "fullscreen_3d_book",
    sound: "gift-vibebook",
  },
};

const VIBEBOOK_GIFT = {
  id: "vibebook_book",
  name: "VibeBook Gift",
  emoji: "\uD83D\uDCD8",
  pointsCost: 1000,
  tier: "premium",
  animation: "vibebook_3d_book",
  color: "#14b8a6",
  colors: ["#14b8a6", "#2563eb", "#a7f3d0"],
  special: true,
  fullscreen: true,
  soundReady: true,
};

const VIBEBOOK_GIFT_ANIMATION = {
  name: "VibeBook Celebration",
  animation: "vibebook_3d_book",
  description: "Exclusive VibeBook premium gift with a glowing green and blue 3D book animation",
  effects: [
    "fullscreen_overlay",
    "rotating_3d_book",
    "particle_storm",
    "green_blue_glow",
    "confetti_burst",
  ],
};

module.exports = {
  GIFT_SYSTEM,
  PREMIUM_GIFT_ANIMATIONS,
  VIBEBOOK_GIFT,
  VIBEBOOK_GIFT_ANIMATION,
};
