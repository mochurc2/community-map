const normalize = (value) => value?.toString().trim().toLowerCase();

const isMan = (value) => ["man", "men", "male", "m"].includes(value);
const isWoman = (value) => ["woman", "women", "female", "f"].includes(value);
const isNonBinary = (value) => ["nonbinary", "non-binary", "nb", "enby"].includes(value);

const extractGenderDetails = (genders, fallbackGender) => {
  const list = Array.isArray(genders) ? genders : genders ? [genders] : [];
  const combined = fallbackGender ? [...list, fallbackGender] : list;

  let base = "";
  let hasTrans = false;

  combined.forEach((value) => {
    const normalized = normalize(value);
    if (!normalized) return;

    if (normalized.startsWith("trans")) {
      hasTrans = true;
      if (normalized.includes("man")) base = base || "man";
      if (normalized.includes("wom")) base = base || "woman";
      if (normalized.includes("non")) base = base || "non-binary";
      return;
    }

    if (!base && isMan(normalized)) base = "man";
    if (!base && isWoman(normalized)) base = "woman";
    if (!base && isNonBinary(normalized)) base = "non-binary";
  });

  return { base, hasTrans, fallbackList: combined.filter(Boolean) };
};

export const getGenderAbbreviation = (genders, fallbackGender) => {
  const { base, hasTrans } = extractGenderDetails(genders, fallbackGender);

  if (base === "non-binary") return "NB";
  if (base === "man") return hasTrans ? "TM" : "M";
  if (base === "woman") return hasTrans ? "TW" : "W";
  return hasTrans ? "T" : "";
};

export const getGenderList = (genders, fallbackGender) => {
  const { base, hasTrans, fallbackList } = extractGenderDetails(genders, fallbackGender);

  if (base) {
    const baseLabel = base === "man" ? "Man" : base === "woman" ? "Woman" : "Non-binary";
    const prefix = hasTrans ? "Trans " : "";
    return [`${prefix}${baseLabel}`];
  }

  if (fallbackList.length > 0) return [fallbackList[0]];
  return [];
};

const stripAt = (value) => value.replace(/^@/, "");
const ensureProtocol = (value) =>
  /^(https?:)?\/\//i.test(value) ? value : `https://${value}`;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isValidUrl = (value) => {
  const withProtocol = ensureProtocol(value);
  try {
    new URL(withProtocol);
    return { valid: true, normalized: withProtocol };
  } catch {
    return { valid: false, normalized: value };
  }
};

const normalizePhoneNumber = (value) => {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 15) return "";
  return `+${digits}`;
};

const validateFromPattern = (value, pattern, message, normalize = stripAt) => {
  const normalized = normalize(value.trim());
  if (!normalized) {
    return { valid: false, message };
  }
  if (!pattern.test(normalized)) {
    return { valid: false, message };
  }
  return { valid: true, normalized };
};

const normalizeRedditHandle = (value) => value.replace(/^\/?u\//i, "u/").replace(/^u\//i, "");

const extractTelegramHandle = (value) => {
  const trimmed = value.trim();
  const fromUrl = trimmed.match(/(?:t\.me|telegram\.me|telegram\.dog)\/@?([^/?#]+)/i);
  if (fromUrl?.[1]) return fromUrl[1];
  const handle = stripAt(trimmed);
  return /^[A-Za-z0-9_]{5,32}$/.test(handle) ? handle : "";
};

const extractBlueskyHandle = (value) => {
  const trimmed = value.trim();
  const fromUrl = trimmed.match(/bsky\.app\/profile\/([^/?#]+)/i);
  if (fromUrl?.[1]) return fromUrl[1].toLowerCase();
  const handle = stripAt(trimmed);
  if (/^did:plc:[a-z0-9]{10,}$/i.test(handle)) return handle.toLowerCase();
  if (/^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/i.test(handle)) return handle.toLowerCase();
  return "";
};

const extractReconHandle = (value) => {
  const trimmed = value.trim();
  const fromUrl = trimmed.match(/recon\.com\/(?:en\/)?([^/?#]+)/i);
  if (fromUrl?.[1]) return fromUrl[1];
  const handle = stripAt(trimmed).replace(/^recon\.com\/?/i, "");
  return /^[A-Za-z0-9._-]{2,32}$/i.test(handle) ? handle : "";
};

export const validateContactValue = (channel, rawValue) => {
  const value = rawValue?.toString().trim() || "";
  if (!value) {
    return { valid: false, message: `Enter your ${channel} details.` };
  }

  switch (channel) {
    case "Email":
      return EMAIL_REGEX.test(value)
        ? { valid: true, normalizedValue: value }
        : { valid: false, message: "Enter a valid email like name@example.com." };
    case "Discord": {
      const result = validateFromPattern(
        value,
        /^[\w.-]{2,32}(#\d{4})?$/,
        "Enter your Discord username (like name#1234).",
        (val) => val
      );
      return result.valid
        ? { valid: true, normalizedValue: result.normalized }
        : {
          valid: false,
          message: result.message,
        };
    }
    case "Reddit": {
      const baseMessage = "Enter a Reddit handle like u/username.";
      const normalized = normalizeRedditHandle(value);
      if (!/^[A-Za-z0-9_-]{3,20}$/.test(normalized)) {
        return { valid: false, message: baseMessage };
      }
      return { valid: true, normalizedValue: normalized.startsWith("u/") ? normalized.slice(2) : normalized };
    }
    case "Instagram": {
      const result = validateFromPattern(
        value,
        /^[A-Za-z0-9._]{2,30}$/,
        "Enter an Instagram handle like @name."
      );
      return result.valid
        ? { valid: true, normalizedValue: result.normalized }
        : { valid: false, message: result.message };
    }
    case "Snapchat": {
      const result = validateFromPattern(
        value,
        /^[A-Za-z0-9._-]{3,15}$/,
        "Enter a Snapchat username (3-15 characters).",
        stripAt
      );
      return result.valid
        ? { valid: true, normalizedValue: result.normalized }
        : { valid: false, message: result.message };
    }
    case "X/Twitter": {
      const result = validateFromPattern(
        value,
        /^[A-Za-z0-9._]{2,30}$/,
        "Enter a Twitter/X handle like @name."
      );
      return result.valid
        ? { valid: true, normalizedValue: result.normalized }
        : { valid: false, message: result.message };
    }
    case "Tumblr": {
      const result = validateFromPattern(
        value,
        /^[A-Za-z0-9-]{3,32}$/,
        "Enter a Tumblr username without the domain.",
        (val) => stripAt(val).replace(/\.tumblr\.com$/i, "")
      );
      return result.valid
        ? { valid: true, normalizedValue: result.normalized }
        : { valid: false, message: result.message };
    }
    case "Youtube": {
      const { valid, normalized } = isValidUrl(value);
      if (!valid || !/youtube\.com|youtu\.be/i.test(normalized)) {
        return { valid: false, message: "Enter a full YouTube channel link." };
      }
      return { valid: true, normalizedValue: normalized };
    }
    case "Website": {
      const { valid, normalized } = isValidUrl(value);
      return valid
        ? { valid: true, normalizedValue: normalized }
        : { valid: false, message: "Enter a full website link." };
    }
    case "OnlyFans": {
      const result = validateFromPattern(
        value,
        /^[A-Za-z0-9._]{2,30}$/,
        "Enter an OnlyFans handle like @name."
      );
      return result.valid
        ? { valid: true, normalizedValue: result.normalized }
        : { valid: false, message: result.message };
    }
    case "Recon":
    case "recon":
    case "recon.com": {
      const handle = extractReconHandle(value);
      if (handle) {
        return { valid: true, normalizedValue: handle };
      }
      const { valid, normalized } = isValidUrl(value);
      if (valid && /recon\.com/i.test(normalized)) {
        return { valid: true, normalizedValue: normalized };
      }
      return { valid: false, message: "Enter your Recon username." };
    }
    case "Signal": {
      const normalizedPhone = normalizePhoneNumber(value);
      if (normalizedPhone) {
        return { valid: true, normalizedValue: normalizedPhone };
      }
      const { valid, normalized } = isValidUrl(value);
      if (valid && /signal\.me|signal\.org/i.test(normalized)) {
        return { valid: true, normalizedValue: normalized };
      }
      return { valid: false, message: "Enter a Signal phone number or signal.me link." };
    }
    case "Telegram": {
      const handle = extractTelegramHandle(value);
      if (handle) {
        return { valid: true, normalizedValue: handle };
      }
      const { valid, normalized } = isValidUrl(value);
      if (valid && /t\.me|telegram\.me|telegram\.dog/i.test(normalized)) {
        return { valid: true, normalizedValue: normalized };
      }
      return { valid: false, message: "Enter a Telegram username like @name or t.me/name." };
    }
    case "WhatsApp": {
      const normalizedPhone = normalizePhoneNumber(value);
      if (normalizedPhone) {
        return { valid: true, normalizedValue: normalizedPhone };
      }
      const { valid, normalized } = isValidUrl(value);
      if (valid && /wa\.me|whatsapp\.com/i.test(normalized)) {
        return { valid: true, normalizedValue: normalized };
      }
      return { valid: false, message: "Enter a WhatsApp phone number or wa.me link." };
    }
    case "Bluesky": {
      const handle = extractBlueskyHandle(value);
      if (handle) {
        return { valid: true, normalizedValue: handle };
      }
      const { valid, normalized } = isValidUrl(value);
      if (valid && /bsky\.app/i.test(normalized)) {
        return { valid: true, normalizedValue: normalized };
      }
      return { valid: false, message: "Enter a Bluesky handle like name.bsky.social or a profile link." };
    }
    default: {
      const { valid, normalized } = isValidUrl(value);
      return valid
        ? { valid: true, normalizedValue: normalized }
        : { valid: false, message: "Enter a valid link for this contact." };
    }
  }
};

export const buildContactLink = (channel, rawValue) => {
  if (typeof rawValue !== "string") return null;

  const value = rawValue.trim();
  if (!value) return null;

  switch (channel) {
    case "Email":
      return { label: channel, href: `mailto:${value}`, displayText: value };
    case "Instagram": {
      const handle = stripAt(value);
      return {
        label: channel,
        href: `https://instagram.com/${handle}`,
        displayText: `https://instagram.com/${handle}`,
      };
    }
    case "Snapchat": {
      const handle = stripAt(value);
      return {
        label: channel,
        href: `https://www.snapchat.com/add/${handle}`,
        displayText: `https://www.snapchat.com/add/${handle}`,
      };
    }
    case "X/Twitter": {
      const handle = stripAt(value);
      return {
        label: channel,
        href: `https://twitter.com/${handle}`,
        displayText: `https://twitter.com/${handle}`,
      };
    }
    case "Reddit": {
      const handle = normalizeRedditHandle(value);
      return {
        label: channel,
        href: `https://reddit.com/u/${handle}`,
        displayText: `https://reddit.com/u/${handle}`,
      };
    }
    case "Discord":
      return { label: channel, displayText: `Discord: ${value}` };
    case "Tumblr": {
      const handle = stripAt(value).replace(/\.tumblr\.com$/i, "");
      return {
        label: channel,
        href: `https://${handle}.tumblr.com`,
        displayText: `https://${handle}.tumblr.com`,
      };
    }
    case "Youtube": {
      const { normalized } = isValidUrl(value);
      const href = normalized || ensureProtocol(value);
      return { label: channel, href, displayText: href };
    }
    case "Website": {
      const { normalized } = isValidUrl(value);
      const href = normalized || ensureProtocol(value);
      return { label: channel, href, displayText: href };
    }
    case "OnlyFans": {
      const handle = stripAt(value);
      return {
        label: channel,
        href: `https://onlyfans.com/${handle}`,
        displayText: `https://onlyfans.com/${handle}`,
      };
    }
    case "Recon":
    case "recon":
    case "recon.com": {
      const handle = extractReconHandle(value);
      if (handle) {
        const href = `https://recon.com/${handle}`;
        return { label: "Recon", href, displayText: href };
      }
      const { valid, normalized } = isValidUrl(value);
      if (valid && /recon\.com/i.test(normalized)) {
        return { label: "Recon", href: normalized, displayText: normalized };
      }
      return { label: "Recon", displayText: value };
    }
    case "Signal": {
      if (/signal\.me|signal\.org/i.test(value)) {
        const { normalized } = isValidUrl(value);
        const href = normalized || ensureProtocol(value);
        return { label: channel, href, displayText: href };
      }
      const normalizedPhone = normalizePhoneNumber(value);
      if (!normalizedPhone) return { label: channel, displayText: value };
      const href = `https://signal.me/#p/${normalizedPhone}`;
      return { label: channel, href, displayText: href };
    }
    case "Telegram": {
      const handle = extractTelegramHandle(value);
      if (handle) {
        const href = `https://t.me/${handle}`;
        return { label: channel, href, displayText: href };
      }
      const { valid, normalized } = isValidUrl(value);
      if (valid) {
        const href = normalized || ensureProtocol(value);
        return { label: channel, href, displayText: href };
      }
      return { label: channel, displayText: value };
    }
    case "WhatsApp": {
      if (/wa\.me|whatsapp\.com/i.test(value)) {
        const { normalized } = isValidUrl(value);
        const href = normalized || ensureProtocol(value);
        return { label: channel, href, displayText: href };
      }
      const normalizedPhone = normalizePhoneNumber(value);
      if (!normalizedPhone) return { label: channel, displayText: value };
      const digitsOnly = normalizedPhone.replace(/\D/g, "");
      const href = `https://wa.me/${digitsOnly}`;
      return { label: channel, href, displayText: href };
    }
    case "Bluesky": {
      const { valid, normalized } = isValidUrl(value);
      if (valid && /bsky\.app/i.test(normalized)) {
        return { label: channel, href: normalized, displayText: normalized };
      }
      const handle = extractBlueskyHandle(value);
      if (!handle) return { label: channel, displayText: value };
      const href = `https://bsky.app/profile/${handle}`;
      return { label: channel, href, displayText: href };
    }
    default: {
      const { normalized } = isValidUrl(value);
      const href = normalized || ensureProtocol(value);
      return { label: channel, href, displayText: href };
    }
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
