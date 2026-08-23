// Minimal self-contained pictogram set for exercise categories.
// Plain line-art, no external assets/network calls — matched by keywords in the exercise name (RU/EN).

const ICON_COMMON = 'viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"';

const ICONS = {
  squat: `<svg ${ICON_COMMON}><circle cx="24" cy="9" r="4"/><path d="M24 13 L24 23"/><path d="M24 16 L14 19"/><path d="M24 16 L34 19"/><path d="M24 23 L15 30 L17 40"/><path d="M24 23 L33 30 L31 40"/></svg>`,

  hinge: `<svg ${ICON_COMMON}><circle cx="16" cy="10" r="4"/><path d="M16 14 L27 24"/><path d="M19 17 L19 34"/><path d="M10 34 L28 34"/><path d="M27 24 L25 40"/><path d="M27 24 L31 40"/></svg>`,

  press: `<svg ${ICON_COMMON}><circle cx="24" cy="8" r="4"/><path d="M24 12 L24 26"/><path d="M24 15 L16 6"/><path d="M24 15 L32 6"/><path d="M24 26 L18 40"/><path d="M24 26 L30 40"/></svg>`,

  pull: `<svg ${ICON_COMMON}><path d="M10 8 L38 8"/><circle cx="24" cy="15" r="4"/><path d="M24 19 L24 30"/><path d="M24 11 L16 8"/><path d="M24 11 L32 8"/><path d="M24 30 L18 40"/><path d="M24 30 L30 40"/></svg>`,

  core: `<svg ${ICON_COMMON}><circle cx="8" cy="23" r="4"/><path d="M12 24 L36 22"/><path d="M17 25 L16 37"/><path d="M35 22 L39 33"/></svg>`,

  lunge: `<svg ${ICON_COMMON}><circle cx="19" cy="8" r="4"/><path d="M19 12 L22 24"/><path d="M22 24 L13 29 L13 40"/><path d="M22 24 L31 33 L35 40"/><path d="M20 16 L12 14"/><path d="M20 16 L27 20"/></svg>`,

  cardio: `<svg ${ICON_COMMON}><circle cx="17" cy="9" r="4"/><path d="M18 13 L25 24"/><path d="M25 24 L33 15 L39 19"/><path d="M25 24 L16 33 L19 41"/><path d="M19 15 L10 11"/><path d="M19 15 L26 25"/></svg>`,

  stretch: `<svg ${ICON_COMMON}><circle cx="12" cy="13" r="4"/><path d="M12 17 L25 29"/><path d="M17 19 L36 25"/><path d="M25 29 L41 31"/></svg>`,

  general: `<svg ${ICON_COMMON}><rect x="5" y="19" width="7" height="10" rx="1.5"/><rect x="36" y="19" width="7" height="10" rx="1.5"/><path d="M12 24 L36 24"/></svg>`,
};

const KEYWORD_MAP = [
  [/присед|squat/i, "squat"],
  [/тяга.*(наклон|станов)|станов|deadlift|дедлифт|hinge/i, "hinge"],
  [/жим|отжим|press|push[- ]?up/i, "press"],
  [/тяга|подтягив|pull/i, "pull"],
  [/планк|пресс|скруч|core|plank|crunch/i, "core"],
  [/выпад|lunge/i, "lunge"],
  [/бег|прыж|run|jump|бёрпи|burpee/i, "cardio"],
  [/растяж|stretch/i, "stretch"],
];

function getExerciseIcon(name) {
  const n = name || "";
  for (const [re, key] of KEYWORD_MAP) {
    if (re.test(n)) return ICONS[key];
  }
  return ICONS.general;
}
