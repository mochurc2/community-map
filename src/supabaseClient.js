import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const missingConfig = [
  !supabaseUrl && "VITE_SUPABASE_URL",
  !supabaseKey && "VITE_SUPABASE_ANON_KEY",
].filter(Boolean);

export const supabaseConfigError =
  missingConfig.length > 0
    ? new Error(
        `Supabase environment variables are missing: ${missingConfig.join(", ")}. Check your .env file.`,
      )
    : null;

export const supabase =
  supabaseConfigError === null ? createClient(supabaseUrl, supabaseKey) : null;

