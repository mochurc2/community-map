import { supabase, supabaseAdmin } from "./supabaseClient";

const baseDefaultOptions = {
  gender_identity: ["Man", "Woman", "Non-binary", "Trans"],
  seeking: ["Men", "Women", "Non-binary", "Trans"],
  interest_tags: [
    "Giving Haircuts",
    "Receiving Haircuts",
    "Short Hair",
    "Medium Hair",
    "Long Hair",
    "Hair Play",
    "Shaving",
    "Facial Hair",
    "Body Hair",
    "Buzzcuts",
    "Flattops",
    "Bobs",
    "MPB",
    "BDSM",
    "Bleaching/Dye",
  ],
  contact_methods: [
    "Email",
    "Discord",
    "Reddit",
    "Instagram",
    "Snapchat",
    "Tumblr",
    "X/Twitter",
    "Youtube",
    "Website",
    "OnlyFans",
  ],
};

const cloneOptions = (options) => ({
  gender_identity: [...options.gender_identity],
  seeking: [...options.seeking],
  interest_tags: [...options.interest_tags],
  contact_methods: [...options.contact_methods],
});

const buildStatusMap = (options) => ({
  gender_identity: Object.fromEntries(options.gender_identity.map((label) => [label.toLowerCase(), "approved"])),
  seeking: Object.fromEntries(options.seeking.map((label) => [label.toLowerCase(), "approved"])),
  interest_tags: Object.fromEntries(options.interest_tags.map((label) => [label.toLowerCase(), "approved"])),
  contact_methods: Object.fromEntries(options.contact_methods.map((label) => [label.toLowerCase(), "approved"])),
});

export const defaultBubbleOptions = cloneOptions(baseDefaultOptions);

export const defaultStatusMap = buildStatusMap(baseDefaultOptions);

export const getDefaultBubbleOptions = () => cloneOptions(baseDefaultOptions);

export const getDefaultStatusMap = () => ({
  gender_identity: { ...defaultStatusMap.gender_identity },
  seeking: { ...defaultStatusMap.seeking },
  interest_tags: { ...defaultStatusMap.interest_tags },
  contact_methods: { ...defaultStatusMap.contact_methods },
});

const normalizeStatus = (value) => {
  if (value === "pending" || value === "rejected") return value;
  return "approved";
};

export async function fetchBubbleOptions() {
  const { data, error } = await supabase
    .from("bubble_options")
    .select("id, field, label, status")
    .order("created_at", { ascending: true });

  if (error || !data || data.length === 0) {
    console.error("Falling back to default bubbles", error?.message);
    return { options: getDefaultBubbleOptions(), statusMap: getDefaultStatusMap() };
  }

  const options = {
    gender_identity: [],
    seeking: [],
    interest_tags: [],
    contact_methods: [],
  };

  const statusMap = getDefaultStatusMap();

  data.forEach((row) => {
    if (!options[row.field]) return;
    const status = normalizeStatus(row.status);
    statusMap[row.field][row.label.toLowerCase()] = status;
    if (status === "approved") {
      options[row.field].push(row.label);
    }
  });

  Object.keys(options).forEach((key) => {
    if (options[key].length === 0) {
      options[key] = [...baseDefaultOptions[key]];
    }
  });

  return { options, statusMap };
}

export async function fetchBubbleOptionsWithIds() {
  const { data, error } = await supabase
    .from("bubble_options")
    .select("id, field, label, status")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function addBubbleOption(field, label, status = "approved") {
  const { data, error } = await supabaseAdmin
    .from("bubble_options")
    .insert({ field, label, status: normalizeStatus(status) })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateBubbleOption(id, label, status) {
  const payload = { label };
  if (status) {
    payload.status = normalizeStatus(status);
  }

  const { data, error } = await supabaseAdmin
    .from("bubble_options")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteBubbleOption(id) {
  const { error } = await supabaseAdmin
    .from("bubble_options")
    .delete()
    .eq("id", id);
  if (error) throw error;
  return true;
}

export async function ensurePendingBubbleOption(field, label) {
  if (!label) return null;
  const normalizedLabel = label.trim();
  if (!normalizedLabel) return null;

  const { data: existingRows, error: fetchError } = await supabase
    .from("bubble_options")
    .select("id, status")
    .eq("field", field)
    .ilike("label", normalizedLabel)
    .limit(1);

  if (!fetchError && existingRows && existingRows.length > 0) {
    const row = existingRows[0];
    if (row.status !== "pending") {
      await updateBubbleOption(row.id, normalizedLabel, row.status);
    }
    return row;
  }

  return addBubbleOption(field, normalizedLabel, "pending");
}
