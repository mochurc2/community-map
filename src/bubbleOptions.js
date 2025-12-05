import { supabase } from "./supabaseClient";

const baseDefaultOptions = {
  gender_identity: [
    "Woman",
    "Man",
    "Nonbinary",
    "Genderqueer",
    "Trans woman",
    "Trans man",
    "Agender",
  ],
  seeking: [
    "Women",
    "Men",
    "Nonbinary people",
    "Queer folks",
    "Friends",
    "Play partners",
    "Mentorship",
  ],
  interest_tags: [
    "Rope",
    "Impact",
    "DS dynamics",
    "Service",
    "Switching",
    "Sensory play",
    "Workshops",
  ],
};

const cloneOptions = (options) => ({
  gender_identity: [...options.gender_identity],
  seeking: [...options.seeking],
  interest_tags: [...options.interest_tags],
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
  };

  data.forEach((row) => {
    if (options[row.field]) {
      options[row.field].push(row.label);
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
  const { data, error } = await supabase
    .from("bubble_options")
    .insert({ field, label })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateBubbleOption(id, label) {
  const { data, error } = await supabase
    .from("bubble_options")
    .update({ label })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteBubbleOption(id) {
  const { error } = await supabase.from("bubble_options").delete().eq("id", id);
  if (error) throw error;
  return true;
}
