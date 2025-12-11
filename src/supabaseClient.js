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

const baseOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: {
    headers: {},
  },
};

const createClientWithToken = (token) => {
  if (supabaseConfigError) return null;
  const headers = {
    apikey: supabaseKey,
    ...(token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {}),
  };
  const options = {
    ...baseOptions,
    global: {
      ...baseOptions.global,
      headers: {
        ...baseOptions.global.headers,
        ...headers,
      },
    },
  };
  if (token) {
    options.accessToken = async () => token;
  }
  return createClient(supabaseUrl, supabaseKey, options);
};

export let supabase =
  supabaseConfigError === null && import.meta.env.DEV ? createClientWithToken(null) : null;

export const setSupabaseAccessToken = (token) => {
  if (supabaseConfigError) return null;
  supabase = token ? createClientWithToken(token) : null;
  return supabase;
};
