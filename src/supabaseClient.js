import { createClient } from "@supabase/supabase-js";

// Only load the public anon key in the client bundle. Service role keys must never be shipped to the browser.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const missingConfig = [
  !supabaseUrl && "VITE_SUPABASE_URL",
  !supabaseAnonKey && "VITE_SUPABASE_ANON_KEY",
].filter(Boolean);

export const supabaseConfigError =
  missingConfig.length > 0
    ? new Error(
        `Supabase environment variables are missing: ${missingConfig.join(
          ", "
        )}. Check your .env file.`,
      )
    : null;

export const supabase =
  supabaseConfigError === null ? createClient(supabaseUrl, supabaseAnonKey) : null;
