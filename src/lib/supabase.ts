import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

const configuredSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const configuredSupabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  configuredSupabaseUrl?.trim() && configuredSupabaseAnonKey?.trim(),
);

const supabaseUrl =
  configuredSupabaseUrl ?? "https://placeholder-project.supabase.co";
const supabaseAnonKey = configuredSupabaseAnonKey ?? "placeholder-anon-key";

const nativeFetch: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  let didTimeout = false;
  const timeout = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, 20_000);
  const signal = init?.signal;
  const abortRequest = () => controller.abort();

  if (signal?.aborted) {
    abortRequest();
  } else {
    signal?.addEventListener("abort", abortRequest, { once: true });
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (didTimeout) {
      throw new Error(
        "The request to Supabase timed out. Check your device's internet connection and try again.",
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortRequest);
  }
};

export const supabase =
  Platform.OS === "web"
    ? createClient(supabaseUrl, supabaseAnonKey)
    : createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
        global: {
          fetch: nativeFetch,
        },
      });
