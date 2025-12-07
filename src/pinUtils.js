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

const getSecureRandom = () => {
  if (typeof crypto !== "undefined" && crypto?.getRandomValues) {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0] / 0xffffffff;
  }
  return Math.random();
};

export const randomizeLocation = (
  { lat, lng },
  minDistanceFeet = 500,
  maxDistanceFeet = 1500
) => {
  if (typeof lat !== "number" || typeof lng !== "number") {
    return { lat, lng };
  }

  const distanceFeet =
    minDistanceFeet + getSecureRandom() * (maxDistanceFeet - minDistanceFeet);
  const distanceMeters = distanceFeet * 0.3048;
  const bearing = getSecureRandom() * 2 * Math.PI;
  const earthRadiusMeters = 6378137;

  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;
  const angularDistance = distanceMeters / earthRadiusMeters;

  const randomizedLat = Math.asin(
    Math.sin(latRad) * Math.cos(angularDistance) +
      Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearing)
  );

  const randomizedLng =
    lngRad +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latRad),
      Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(randomizedLat)
    );

  return {
    lat: (randomizedLat * 180) / Math.PI,
    lng: (((randomizedLng * 180) / Math.PI + 540) % 360) - 180,
  };
};
