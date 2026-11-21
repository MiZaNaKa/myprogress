import Constants, { AppOwnership } from "expo-constants";
import { Platform } from "react-native";

const GOOGLE_WEB_CLIENT_ID =
  "833202883606-happ14l0iagpu8vtmda9svthe1qk6j6k.apps.googleusercontent.com";

export async function signInWithGoogleNative(): Promise<string | null> {
  if (Constants.appOwnership === AppOwnership.Expo) {
    throw new Error(
      "Google sign-in requires a development build. Expo Go does not include the native Google Sign-In module.",
    );
  }

  if (Platform.OS === "ios") {
    throw new Error(
      "iOS Google sign-in requires an iOS OAuth client ID and its URL scheme.",
    );
  }

  const { GoogleSignin, isSuccessResponse } =
    await import("@react-native-google-signin/google-signin");
  GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });

  await GoogleSignin.hasPlayServices();
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) return null;

  const idToken = response.data.idToken;
  if (!idToken) {
    throw new Error(
      "Google did not return an ID token. Check the Web OAuth client ID configuration.",
    );
  }

  return idToken;
}
