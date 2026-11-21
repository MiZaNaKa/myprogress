import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useAuth } from "@/context/AuthProvider";
import { useLanguage } from "@/context/LanguageProvider";
import { useTheme } from "@/hooks/use-theme";

export default function CreateAccountScreen() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { signUpWithEmail } = useAuth();
  const { t } = useLanguage();
  const theme = useTheme();

  const nameError = useMemo(() => {
    if (!name.trim()) return "Name is required.";
    if (name.trim().length < 2) return "Name must be at least 2 characters.";
    return "";
  }, [name]);

  const emailError = useMemo(() => {
    if (!email.trim()) return "Email is required.";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) ? "" : "Enter a valid email address.";
  }, [email]);

  const passwordError = useMemo(() => {
    if (!password) return "Password is required.";
    if (password.length < 6) return "Password must be at least 6 characters.";
    return "";
  }, [password]);

  const confirmPasswordError = useMemo(() => {
    if (!confirmPassword) return "Please confirm your password.";
    if (confirmPassword !== password) return "Passwords do not match.";
    return "";
  }, [confirmPassword, password]);

  const isFormValid =
    !nameError && !emailError && !passwordError && !confirmPasswordError;

  const handleCreateAccount = async () => {
    if (!isFormValid) {
      Alert.alert(
        t("Validation error"),
        nameError || emailError || passwordError || confirmPasswordError,
      );
      return;
    }

    try {
      await signUpWithEmail(email.trim(), password, name.trim());
      Alert.alert(
        t("Account created"),
        t("Please check your email to confirm your account."),
      );
      router.replace("/home");
    } catch (error) {
      Alert.alert(
        t("Create account failed"),
        error instanceof Error ? error.message : t("Please try again."),
      );
    }
  };

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
            Create account
          </ThemedText>

          <ThemedText
            type="small"
            themeColor="textSecondary"
            style={styles.subtitle}
          >
            Sign up with your email
          </ThemedText>

          <View style={styles.fieldGroup}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Full name
            </ThemedText>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t("John Doe")}
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="words"
              autoCorrect={false}
              keyboardType="default"
              style={[
                styles.input,
                {
                  color: theme.text,
                  borderColor: nameError ? "#d93025" : theme.backgroundSelected,
                  backgroundColor: theme.background,
                },
              ]}
            />
            {nameError ? (
              <ThemedText type="small" style={styles.errorText}>
                {nameError}
              </ThemedText>
            ) : null}
          </View>

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
                  borderColor: emailError
                    ? "#d93025"
                    : theme.backgroundSelected,
                  backgroundColor: theme.background,
                },
              ]}
            />
            {emailError ? (
              <ThemedText type="small" style={styles.errorText}>
                {emailError}
              </ThemedText>
            ) : null}
          </View>

          <View style={styles.fieldGroup}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Create password
            </ThemedText>
            <View
              style={[
                styles.passwordRow,
                {
                  borderColor: passwordError
                    ? "#d93025"
                    : theme.backgroundSelected,
                  backgroundColor: theme.background,
                },
              ]}
            >
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder={t("Choose a strong password")}
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
            {passwordError ? (
              <ThemedText type="small" style={styles.errorText}>
                {passwordError}
              </ThemedText>
            ) : null}
          </View>

          <View style={styles.fieldGroup}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Confirm password
            </ThemedText>
            <View
              style={[
                styles.passwordRow,
                {
                  borderColor: confirmPasswordError
                    ? "#d93025"
                    : theme.backgroundSelected,
                  backgroundColor: theme.background,
                },
              ]}
            >
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder={t("Re-enter your password")}
                placeholderTextColor={theme.textSecondary}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.passwordInput, { color: theme.text }]}
              />
            </View>
            {confirmPasswordError ? (
              <ThemedText type="small" style={styles.errorText}>
                {confirmPasswordError}
              </ThemedText>
            ) : null}
          </View>

          <Pressable
            style={[
              styles.primaryButton,
              { backgroundColor: theme.accent },
              !isFormValid && styles.primaryButtonDisabled,
            ]}
            onPress={handleCreateAccount}
            disabled={!isFormValid}
          >
            <ThemedText type="smallBold" style={styles.primaryText}>
              Create account
            </ThemedText>
          </Pressable>

          <View style={styles.footerRow}>
            <ThemedText type="small" themeColor="textSecondary">
              Already have an account?
            </ThemedText>
            <Pressable onPress={() => router.replace("/")}>
              <ThemedText type="linkPrimary">Login</ThemedText>
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
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryText: {
    color: "#ffffff",
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.one,
    marginTop: Spacing.one,
  },
  errorText: {
    color: "#d93025",
    fontSize: 12,
  },
});
