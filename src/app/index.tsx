import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useAuth } from "@/context/AuthProvider";
import { useLanguage } from "@/context/LanguageProvider";
import { useTheme } from "@/hooks/use-theme";
import { signInWithGoogleNative } from "@/lib/google-sign-in";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export default function HomeScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const { user, loading: isAuthLoading, signInWithEmail } = useAuth();
  const { t } = useLanguage();
  const theme = useTheme();

  useEffect(() => {
    if (!isAuthLoading && user) {
      router.replace("/home");
    }
  }, [isAuthLoading, user]);

  const handleLogin = async () => {
    if (isSigningIn) return;

    setIsSigningIn(true);
    try {
      await signInWithEmail(email.trim(), password);
      router.replace("/home");
    } catch (error) {
      Alert.alert(
        t("Login failed"),
        error instanceof Error
          ? error.message
          : t("Please check your email and password."),
      );
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleCreateAccount = () => {
    router.push("/create-account");
  };

  const handleGoogleSignIn = async () => {
    if (isSigningIn) return;
    if (!isSupabaseConfigured) {
      Alert.alert(
        t("Google sign-in unavailable"),
        t("Supabase is not configured."),
      );
      return;
    }

    setIsSigningIn(true);
    try {
      const isWeb = Platform.OS === "web";
      if (isWeb) {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: `${window.location.origin}/home`,
          },
        });
        if (error) throw error;
      } else {
        const idToken = await signInWithGoogleNative();
        if (!idToken) return;
        const { error } = await supabase.auth.signInWithIdToken({
          provider: "google",
          token: idToken,
        });
        if (error) throw error;
        router.replace("/home");
      }
    } catch (error) {
      Alert.alert(
        t("Google sign-in failed"),
        error instanceof Error ? error.message : t("Please try again."),
      );
    } finally {
      setIsSigningIn(false);
    }
  };

  if (isAuthLoading) {
    return (
      <ThemedView style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.backgroundElement,
              borderColor: theme.border,
            },
          ]}
        >
          <View style={styles.brandRow}>
            <View style={styles.gmailIcon}>
              <ThemedText type="smallBold" style={styles.gmailText}>
                M
              </ThemedText>
            </View>
            <ThemedText type="smallBold">Gmail</ThemedText>
          </View>

          <ThemedText type="title" style={styles.title}>
            Welcome back
          </ThemedText>

          <ThemedText
            type="small"
            themeColor="textSecondary"
            style={styles.subtitle}
          >
            Sign in to continue
          </ThemedText>

          <View style={styles.fieldGroup}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Email
            </ThemedText>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder={t("name@gmail.com")}
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              style={[
                styles.input,
                {
                  color: theme.text,
                  borderColor: theme.backgroundSelected,
                  backgroundColor: theme.background,
                },
              ]}
            />
          </View>

          <View style={styles.fieldGroup}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Password
            </ThemedText>
            <View
              style={[
                styles.passwordRow,
                {
                  borderColor: theme.backgroundSelected,
                  backgroundColor: theme.background,
                },
              ]}
            >
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder={t("Enter your password")}
                placeholderTextColor={theme.textSecondary}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.passwordInput, { color: theme.text }]}
              />
              <Pressable
                onPress={() => setShowPassword((value) => !value)}
                style={styles.eyeButton}
              >
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {showPassword ? "Hide" : "Show"}
                </ThemedText>
              </Pressable>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={isSigningIn}
            style={[
              styles.primaryButton,
              { backgroundColor: theme.accent },
              isSigningIn && styles.disabledButton,
            ]}
            onPress={handleLogin}
          >
            <ThemedText type="smallBold" style={styles.primaryText}>
              {isSigningIn ? "Signing in..." : "Login"}
            </ThemedText>
          </Pressable>

          <View style={styles.dividerRow}>
            <View
              style={[
                styles.dividerLine,
                { backgroundColor: theme.backgroundSelected },
              ]}
            />
            <ThemedText
              type="small"
              themeColor="textSecondary"
              style={styles.dividerText}
            >
              or
            </ThemedText>
            <View
              style={[
                styles.dividerLine,
                { backgroundColor: theme.backgroundSelected },
              ]}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={isSigningIn}
            style={[
              styles.socialButton,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
              },
              isSigningIn && styles.disabledButton,
            ]}
            onPress={() => void handleGoogleSignIn()}
          >
            <View style={styles.socialIcon}>
              <ThemedText type="smallBold" style={styles.socialIconText}>
                G
              </ThemedText>
            </View>
            <ThemedText type="smallBold">
              {isSigningIn ? "Connecting to Google..." : "Continue with Google"}
            </ThemedText>
          </Pressable>

          <View style={styles.signupRow}>
            <ThemedText type="small" themeColor="textSecondary">
              Don’t have an account?
            </ThemedText>
            <Pressable onPress={handleCreateAccount}>
              <ThemedText type="linkPrimary">Create account</ThemedText>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    flexDirection: "row",
  },
  loadingContainer: {
    alignItems: "center",
  },
  safeArea: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignSelf: "stretch",
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.five,
  },
  card: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.08)",
    padding: Spacing.five,
    gap: Spacing.three,
    width: "100%",
    maxWidth: "100%",
    alignSelf: "stretch",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    marginBottom: Spacing.one,
  },
  gmailIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#d93025",
    alignItems: "center",
    justifyContent: "center",
  },
  gmailText: {
    color: "#ffffff",
    fontSize: 18,
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: 700,
  },
  subtitle: {
    marginTop: -Spacing.one,
  },
  fieldGroup: {
    gap: Spacing.one,
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 14,
    minHeight: 52,
    paddingLeft: Spacing.three,
  },
  passwordInput: {
    flex: 1,
    minHeight: 52,
    fontSize: 16,
  },
  eyeButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  primaryButton: {
    backgroundColor: "#1a73e8",
    borderRadius: 14,
    paddingVertical: Spacing.three,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.one,
  },
  disabledButton: {
    opacity: 0.6,
  },
  primaryText: {
    color: "#ffffff",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 12,
  },
  socialButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingVertical: Spacing.three,
  },
  socialIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#d93025",
    alignItems: "center",
    justifyContent: "center",
  },
  socialIconText: {
    color: "#ffffff",
    fontSize: 12,
  },
  signupRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.one,
    marginTop: Spacing.one,
  },
});
