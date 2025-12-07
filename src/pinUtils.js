const GENDER_ABBREVIATIONS = {
  man: "M",
  male: "M",
  m: "M",
  woman: "F",
  female: "F",
  f: "F",
  nonbinary: "NB",
  "non-binary": "NB",
  nb: "NB",
  enby: "NB",
  "trans masc": "TM",
  "trans masculine": "TM",
  "trans man": "TM",
  "trans men": "TM",
  tm: "TM",
  "trans femme": "TF",
  "trans feminine": "TF",
  "trans woman": "TF",
  "trans women": "TF",
  tf: "TF",
  trans: "T",
};

const normalize = (value) => value?.toString().trim().toLowerCase();

export const getGenderAbbreviation = (genders, fallbackGender) => {
  const list = Array.isArray(genders) ? genders : genders ? [genders] : [];
  const candidates = [...list];
  if (fallbackGender) candidates.push(fallbackGender);

  for (const value of candidates) {
    const key = normalize(value);
    if (!key) continue;
    const abbr = GENDER_ABBREVIATIONS[key];
    if (abbr) return abbr;
    if (key.startsWith("trans masc")) return "TM";
    if (key.startsWith("trans fem") || key.startsWith("trans wom")) return "TF";
  }

  return "";
};

export const getGenderList = (genders, fallbackGender) => {
  if (Array.isArray(genders) && genders.length > 0) return genders;
  if (fallbackGender) return [fallbackGender];
  return [];
};

const stripAt = (value) => value.replace(/^@/, "");
const ensureProtocol = (value) =>
  /^(https?:)?\/\//i.test(value) ? value : `https://${value}`;

export const buildContactLink = (channel, rawValue) => {
  if (typeof rawValue !== "string") return null;

  const value = rawValue.trim();
  if (!value) return null;

  switch (channel) {
    case "Email":
      return { label: channel, href: `mailto:${value}` };
    case "Instagram":
      return { label: channel, href: `https://instagram.com/${stripAt(value)}` };
    case "X/Twitter":
      return { label: channel, href: `https://twitter.com/${stripAt(value)}` };
    case "Reddit": {
      const handle = value.startsWith("u/") ? value : `u/${stripAt(value)}`;
      return { label: channel, href: `https://reddit.com/${handle}` };
    }
    case "Discord":
      return { label: channel, href: ensureProtocol(value) };
    case "Tumblr":
      return { label: channel, href: `https://${stripAt(value)}.tumblr.com` };
    case "Youtube":
      return { label: channel, href: ensureProtocol(value) };
    case "Website":
      return { label: channel, href: ensureProtocol(value) };
    case "OnlyFans":
      return { label: channel, href: `https://onlyfans.com/${stripAt(value)}` };
    default:
      return { label: channel, href: ensureProtocol(value) };
  }
};
