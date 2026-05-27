/**
 * Premium Gift Animation Definitions
 * Enhanced TikTok-style animations for live gifts
 */

const GIFT_SYSTEM = {
  SMALL: {
    tier: "small",
    animationDuration: 2.2,
    particleCount: 9,
    scale: 0.8,
  },
  MEDIUM: {
    tier: "medium",
    animationDuration: 2.8,
    particleCount: 16,
    scale: 1.0,
  },
  PREMIUM: {
    tier: "premium",
    animationDuration: 3.5,
    particleCount: 28,
    scale: 1.3,
    fullscreen: true,
    soundReady: true,
  },
};

const PREMIUM_GIFT_ANIMATIONS = {
  floating_hearts: {
    name: "Floating Hearts",
    particles: "❤️",
    effect: "float_up",
  },
  flying_roses: {
    name: "Flying Roses",
    particles: "🌹",
    effect: "spiral",
  },
  bouquet_bloom: {
    name: "Bouquet Bloom",
    particles: "💐",
    effect: "bloom",
  },
  fire_burst: {
    name: "Fire Burst",
    particles: "🔥",
    effect: "explosion",
  },
  diamond_sparkle: {
    name: "Diamond Sparkle",
    particles: "💎",
    effect: "sparkle",
  },
  crown_shine: {
    name: "Crown Shine",
    particles: "👑",
    effect: "rotating_glow",
  },
  rocket_launch: {
    name: "Rocket Launch",
    particles: "🚀",
    effect: "launch",
  },
  car_sweep: {
    name: "Car Sweep",
    particles: "🏎️",
    effect: "sweep",
  },
  magic_box: {
    name: "Magic Box",
    particles: "🎁",
    effect: "explosion",
  },
  lion_roar: {
    name: "Lion Roar",
    particles: "🦁",
    effect: "fullscreen_glow",
  },
  universe_burst: {
    name: "Universe Burst",
    particles: "🌌",
    effect: "fullscreen_burst",
  },
  castle_glow: {
    name: "Castle Glow",
    particles: "🏰",
    effect: "glow_cascade",
  },
  dragon_flight: {
    name: "Dragon Flight",
    particles: "🐉",
    effect: "fullscreen_sweep",
  },
  galaxy_storm: {
    name: "Galaxy Storm",
    particles: "✨",
    effect: "fullscreen_storm",
  },
};

// New VibeBook premium gift
const VIBEBOOK_GIFT = {
  id: "vibebook_book",
  name: "VibeBook Book Gift",
  emoji: "📘",
  pointsCost: 1000,
  tier: "premium",
  animation: "vibebook_celebration",
  color: "#3b82f6", // Blue gradient
  special: true,
  fullscreen: true,
};

Object.assign(PREMIUM_GIFT_ANIMATIONS, {
  flower_bloom: {
    name: "Flower Bloom",
    particles: "\uD83C\uDF38",
    effect: "bloom",
  },
  coffee_steam: {
    name: "Coffee Steam",
    particles: "\u2615",
    effect: "steam_rise",
  },
  super_star_spin: {
    name: "Super Star Spin",
    particles: "\u2B50",
    effect: "orbit",
  },
  galaxy_swirl: {
    name: "Galaxy Swirl",
    particles: "\uD83C\uDF0C",
    effect: "swirl",
  },
  golden_crown_coronation: {
    name: "Golden Crown Coronation",
    particles: "\uD83D\uDC51",
    effect: "fullscreen_coronation",
  },
  vibebook_celebration: {
    name: "VibeBook Celebration",
    particles: "\uD83D\uDCD8",
    effect: "fullscreen_book",
  },
});

const VIBEBOOK_GIFT_ANIMATION = {
  name: "VibeBook Celebration",
  animation: "vibebook_celebration",
  description: "Exclusive VibeBook premium gift with custom animation",
  effects: [
    "fullscreen_overlay",
    "rotating_book",
    "particle_storm",
    "golden_glow",
    "confetti_burst",
  ],
};

module.exports = {
  GIFT_SYSTEM,
  PREMIUM_GIFT_ANIMATIONS,
  VIBEBOOK_GIFT,
  VIBEBOOK_GIFT_ANIMATION,
};
