import { supabase, supabaseAdmin } from "./supabaseClient";

const baseDefaultOptions = {
  gender_identity: ["Man", "Woman", "Nonbinary", "Trans"],
  seeking: ["Man", "Woman", "Nonbinary", "Trans"],
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

export const defaultBubbleOptions = cloneOptions(baseDefaultOptions);

export const getDefaultBubbleOptions = () => cloneOptions(baseDefaultOptions);

export async function fetchBubbleOptions() {
  const { data, error } = await supabase
    .from("bubble_options")
    .select("id, field, label")
    .order("created_at", { ascending: true });

  if (error || !data || data.length === 0) {
    console.error("Falling back to default bubbles", error?.message);
    return getDefaultBubbleOptions();
  }

  const options = {
    gender_identity: [],
    seeking: [],
    interest_tags: [],
    contact_methods: [],
  };

  data.forEach((row) => {
    if (options[row.field]) {
      options[row.field].push(row.label);
    }
  });

  Object.keys(options).forEach((key) => {
    if (options[key].length === 0) {
      options[key] = [...baseDefaultOptions[key]];
    }
  });

  return options;
}

export async function fetchBubbleOptionsWithIds() {
  const { data, error } = await supabase
    .from("bubble_options")
    .select("id, field, label")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function addBubbleOption(field, label) {
  const { data, error } = await supabaseAdmin
    .from("bubble_options")
    .insert({ field, label })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateBubbleOption(id, label) {
  const { data, error } = await supabaseAdmin
    .from("bubble_options")
    .update({ label })
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
