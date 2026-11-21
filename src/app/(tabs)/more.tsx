import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { MaxContentWidth, Spacing } from "@/constants/theme";
import { useAuth } from "@/context/AuthProvider";
import { getLanguageLocale, useLanguage } from "@/context/LanguageProvider";
import {
  useThemePreference,
  type ThemeMode,
} from "@/context/ThemePreferenceProvider";
import { useTheme } from "@/hooks/use-theme";
import {
  getLocalDateKey,
  getProgressDateKey,
  shiftDateKey,
} from "@/lib/progress-date";
import { supabase } from "@/lib/supabase";

const AVATAR_BUCKET = "image";
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const BASE64_CHARACTERS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

type AchievementCategory = {
  id: string;
  title: string;
  start_date: string | null;
  duration_days: number;
};

type AchievementTask = {
  id: string;
  task_categories_id: string;
  task_name: string;
};

type AchievementProgress = {
  task_id: string;
  status: string;
  progress_date: string | null;
};

type Achievement = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  completedTaskDays: number;
  totalTaskDays: number;
  incompleteTaskNames: string[];
  isComplete: boolean;
};

function getName(user: ReturnType<typeof useAuth>["user"]) {
  const metadata = user?.user_metadata;
  const value =
    metadata?.full_name ?? metadata?.name ?? metadata?.first_name ?? "";
  return typeof value === "string" ? value.trim() : "";
}

function decodeBase64(value: string) {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  const bytes = new Uint8Array(Math.floor((value.length * 3) / 4) - padding);
  let buffer = 0;
  let bits = 0;
  let offset = 0;

  for (const character of value) {
    if (character === "=") break;
    const digit = BASE64_CHARACTERS.indexOf(character);
    if (digit < 0) continue;
    buffer = (buffer << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[offset] = (buffer >> bits) & 0xff;
      offset += 1;
    }
  }

  return bytes.buffer;
}

export default function ProfileTab() {
  const { user, signOut } = useAuth();
  const { language, t } = useLanguage();
  const { themeMode, themeError, setThemeMode } = useThemePreference();
  const [isSavingTheme, setIsSavingTheme] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [selectedAvatar, setSelectedAvatar] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [loadedAvatar, setLoadedAvatar] = useState<{
    path: string;
    url: string;
  } | null>(null);
  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const [avatarRetryKey, setAvatarRetryKey] = useState(0);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [achievementCategories, setAchievementCategories] = useState<
    AchievementCategory[]
  >([]);
  const [achievementTasks, setAchievementTasks] = useState<AchievementTask[]>(
    [],
  );
  const [achievementProgress, setAchievementProgress] = useState<
    AchievementProgress[]
  >([]);
  const [isLoadingAchievements, setIsLoadingAchievements] = useState(true);
  const [isRefreshingAchievements, setIsRefreshingAchievements] =
    useState(false);
  const [achievementError, setAchievementError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [areAchievementsExpanded, setAreAchievementsExpanded] = useState(false);
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const avatarMetadata =
    typeof user?.user_metadata?.avatar_url === "string"
      ? user.user_metadata.avatar_url
      : null;
  const avatarPath =
    avatarMetadata && !/^https?:\/\//i.test(avatarMetadata)
      ? avatarMetadata
      : typeof user?.user_metadata?.avatar_path === "string"
        ? user.user_metadata.avatar_path
        : null;
  const fallbackAvatarUrl =
    avatarMetadata && /^https?:\/\//i.test(avatarMetadata)
      ? avatarMetadata
      : null;
  const email = user?.email ?? "";
  const name = nameDraft ?? getName(user);
  const displayName = name.trim() || email.split("@")[0] || t("Your profile");
  const avatarUrl = selectedAvatar
    ? selectedAvatar.uri
    : avatarPath && loadedAvatar?.path === avatarPath
      ? loadedAvatar.url
      : fallbackAvatarUrl;
  const achievements = useMemo<Achievement[]>(() => {
    const todayKey = getLocalDateKey(new Date());
    const completedByTaskAndDate = new Set(
      achievementProgress
        .filter((row) => row.status === "completed" && row.progress_date)
        .map(
          (row) => `${row.task_id}:${getProgressDateKey(row.progress_date!)}`,
        ),
    );
    const tasksByCategory = new Map<string, AchievementTask[]>();
    for (const task of achievementTasks) {
      const tasks = tasksByCategory.get(task.task_categories_id) ?? [];
      tasks.push(task);
      tasksByCategory.set(task.task_categories_id, tasks);
    }

    return achievementCategories.flatMap((category) => {
      if (!category.start_date || category.duration_days < 1) return [];
      const startDate = category.start_date.slice(0, 10);
      const endDate = shiftDateKey(startDate, category.duration_days - 1);
      const tasks = tasksByCategory.get(category.id) ?? [];
      if (endDate > todayKey || tasks.length === 0) return [];

      let completedTaskDays = 0;
      const incompleteTaskNames: string[] = [];
      for (const task of tasks) {
        let taskIsComplete = true;
        for (let day = 0; day < category.duration_days; day += 1) {
          const date = shiftDateKey(startDate, day);
          if (completedByTaskAndDate.has(`${task.id}:${date}`)) {
            completedTaskDays += 1;
          } else {
            taskIsComplete = false;
          }
        }
        if (!taskIsComplete) incompleteTaskNames.push(task.task_name);
      }

      return [
        {
          id: category.id,
          title: category.title,
          startDate,
          endDate,
          durationDays: category.duration_days,
          completedTaskDays,
          totalTaskDays: tasks.length * category.duration_days,
          incompleteTaskNames,
          isComplete: incompleteTaskNames.length === 0,
        },
      ];
    });
  }, [achievementCategories, achievementProgress, achievementTasks]);
  const completedAchievements = achievements.filter(
    (achievement) => achievement.isComplete,
  );
  useFocusEffect(
    useCallback(() => {
      let active = true;

      const loadAchievements = async () => {
        setIsLoadingAchievements(true);
        setAchievementError(null);
        try {
          if (!user?.id) throw new Error("Sign in to view achievements.");

          const { data: categoryData, error: categoryError } = await supabase
            .from("task_categories")
            .select("id, title, start_date, duration_days")
            .eq("user_id", user.id);
          if (categoryError) throw categoryError;
          const categories = categoryData ?? [];
          if (!active) return;
          setAchievementCategories(categories);

          if (categories.length === 0) {
            setAchievementTasks([]);
            setAchievementProgress([]);
            return;
          }

          const { data: taskData, error: taskError } = await supabase
            .from("tasks")
            .select("id, task_categories_id, task_name")
            .eq("user_id", user.id)
            .eq("is_active", true)
            .in(
              "task_categories_id",
              categories.map((category) => category.id),
            );
          if (taskError) throw taskError;
          const tasks = taskData ?? [];
          if (!active) return;
          setAchievementTasks(tasks);

          if (tasks.length === 0) {
            setAchievementProgress([]);
            return;
          }

          const { data: progressData, error: progressError } = await supabase
            .from("task_progress")
            .select("task_id, status, progress_date")
            .eq("user_id", user.id)
            .in(
              "task_id",
              tasks.map((task) => task.id),
            );
          if (progressError) throw progressError;
          if (active) setAchievementProgress(progressData ?? []);
        } catch (error) {
          if (active) {
            setAchievementError(
              error instanceof Error ? error.message : String(error),
            );
          }
        } finally {
          if (active) {
            setIsLoadingAchievements(false);
            setIsRefreshingAchievements(false);
          }
        }
      };

      void loadAchievements();
      return () => {
        active = false;
      };
    }, [refreshKey, user]),
  );

  useEffect(() => {
    if (!profileMessage) return;

    const timeout = setTimeout(() => setProfileMessage(null), 5000);
    return () => clearTimeout(timeout);
  }, [profileMessage]);

  useEffect(() => {
    let active = true;

    if (!avatarPath) {
      setAvatarLoadError(false);
      return () => {
        active = false;
      };
    }

    setAvatarLoadError(false);
    const loadAvatar = async () => {
      const { data, error } = await supabase.storage
        .from(AVATAR_BUCKET)
        .createSignedUrl(avatarPath, 60 * 60);
      if (error) {
        if (active) setAvatarLoadError(true);
        return;
      }
      if (active) setLoadedAvatar({ path: avatarPath, url: data.signedUrl });
    };

    void loadAvatar();
    return () => {
      active = false;
    };
  }, [avatarPath, avatarRetryKey]);

  const handleSaveProfile = async () => {
    if (!user || isSavingName || isUploadingAvatar) return;
    const nextName = name.trim();
    if (!nextName) {
      setProfileError("Enter a name before saving.");
      setProfileMessage(null);
      return;
    }
    if (selectedAvatar?.fileSize && selectedAvatar.fileSize > MAX_AVATAR_SIZE) {
      setProfileError("Choose a photo smaller than 5 MB.");
      setProfileMessage(null);
      return;
    }
    if (selectedAvatar && !selectedAvatar.base64) {
      setProfileError("The selected photo could not be read. Choose it again.");
      setProfileMessage(null);
      return;
    }

    setIsSavingName(true);
    setProfileError(null);
    setProfileMessage(null);
    let uploadedPath: string | null = null;
    let profileUpdated = false;
    try {
      if (selectedAvatar?.base64) {
        setIsUploadingAvatar(true);
        uploadedPath = `${user.id}/profile.jpg`;
        const { error: uploadError } = await supabase.storage
          .from(AVATAR_BUCKET)
          .upload(uploadedPath, decodeBase64(selectedAvatar.base64), {
            contentType: selectedAvatar.mimeType ?? "image/jpeg",
            upsert: true,
          });
        if (uploadError) throw uploadError;
      }

      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: nextName,
          name: nextName,
          first_name: nextName.split(/\s+/)[0],
          ...(uploadedPath ? { avatar_url: uploadedPath } : {}),
        },
      });
      if (error) throw error;
      profileUpdated = true;

      if (uploadedPath) {
        const {
          data: { user: updatedUser },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!updatedUser) {
          throw new Error("Supabase did not return the updated user.");
        }

        const imagePath = updatedUser.user_metadata?.avatar_url;
        if (typeof imagePath !== "string" || imagePath !== uploadedPath) {
          throw new Error(
            "The updated avatar path was not returned by Supabase.",
          );
        }

        const { data, error: signedUrlError } = await supabase.storage
          .from(AVATAR_BUCKET)
          .createSignedUrl(imagePath, 60 * 60);
        if (signedUrlError) throw signedUrlError;
        setLoadedAvatar({ path: imagePath, url: data.signedUrl });
      }
      setNameDraft(nextName);
      setSelectedAvatar(null);
      setIsEditingProfile(false);
      setProfileMessage("Your profile was updated.");
    } catch (error) {
      if (uploadedPath && uploadedPath !== avatarPath && !profileUpdated) {
        const { error: cleanupError } = await supabase.storage
          .from(AVATAR_BUCKET)
          .remove([uploadedPath]);
        if (cleanupError) {
          setProfileError(
            `${t("Could not update your profile:")} ${
              error instanceof Error ? error.message : String(error)
            }. ${t("The uploaded photo could not be removed:")} ${cleanupError.message}`,
          );
          return;
        }
      }
      if (profileUpdated) {
        setNameDraft(nextName);
        setSelectedAvatar(null);
        setIsEditingProfile(false);
        setProfileMessage(
          `${t("Your profile was saved, but the photo could not be refreshed:")} ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      } else {
        setProfileError(
          `${t("Could not update your profile:")} ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    } finally {
      setIsSavingName(false);
      setIsUploadingAvatar(false);
    }
  };

  const handlePickAvatar = async () => {
    if (!user || isUploadingAvatar) return;
    setProfileError(null);
    setProfileMessage(null);

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset) throw new Error("No photo was selected.");
      if (asset.fileSize && asset.fileSize > MAX_AVATAR_SIZE) {
        throw new Error("Choose a photo smaller than 5 MB.");
      }

      setSelectedAvatar(asset);
    } catch (error) {
      setProfileError(
        `${t("Could not select your profile photo:")} ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  };

  const handleCancelProfileEdit = () => {
    setNameDraft(null);
    setSelectedAvatar(null);
    setIsEditingProfile(false);
    setProfileError(null);
    setProfileMessage(null);
  };

  const handleSignOut = async () => {
    if (isSigningOut) return;

    setIsSigningOut(true);
    try {
      await signOut();
      router.replace("/");
    } catch (error) {
      Alert.alert(
        t("Logout failed"),
        error instanceof Error ? error.message : t("Please try again."),
      );
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleThemeChange = async (mode: ThemeMode) => {
    if (isSavingTheme || mode === themeMode) return;
    setIsSavingTheme(true);
    await setThemeMode(mode);
    setIsSavingTheme(false);
  };

  const renderAchievement = (achievement: Achievement) => (
    <Pressable
      key={achievement.id}
      accessibilityRole="button"
      accessibilityLabel={`${t("View achievement details")}: ${achievement.title}`}
      onPress={() =>
        router.push({
          pathname: "/achievement/[id]",
          params: { id: achievement.id },
        })
      }
      style={({ pressed }) => [
        styles.achievement,
        { backgroundColor: theme.background },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.achievementTopRow}>
        <ThemedText
          type="smallBold"
          style={styles.achievementName}
          translate={false}
        >
          {achievement.title}
        </ThemedText>
        <View style={styles.achievementStatus}>
          <ThemedText
            type="smallBold"
            style={{
              color: achievement.isComplete ? theme.success : theme.danger,
            }}
          >
            {achievement.isComplete ? "Completed" : "Incomplete"}
          </ThemedText>
        </View>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {new Date(`${achievement.startDate}T12:00:00`).toLocaleDateString(
          getLanguageLocale(language),
          { month: "short", day: "numeric", year: "numeric" },
        )}
        {" – "}
        {new Date(`${achievement.endDate}T12:00:00`).toLocaleDateString(
          getLanguageLocale(language),
          { month: "short", day: "numeric", year: "numeric" },
        )}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {achievement.completedTaskDays} of {achievement.totalTaskDays} task-days
        completed
      </ThemedText>
    </Pressable>
  );

  return (
    <ThemedView style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + Spacing.four,
            paddingBottom: insets.bottom + Spacing.four,
          },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshingAchievements}
            onRefresh={() => {
              setIsRefreshingAchievements(true);
              setAchievementError(null);
              setIsLoadingAchievements(true);
              setRefreshKey((key) => key + 1);
            }}
            tintColor={theme.accent}
            colors={[theme.accent]}
            progressBackgroundColor={theme.backgroundElement}
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.pageHeaderRow}>
          <View style={styles.pageHeader}>
            <ThemedText type="smallBold" style={styles.brand}>
              MY PROGRESS
            </ThemedText>
            <ThemedText type="title" style={styles.title}>
              Profile
            </ThemedText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("Language")}
            onPress={() => router.push("/language")}
            style={({ pressed }) => [
              styles.languageIconButton,
              { backgroundColor: theme.backgroundElement },
              pressed && styles.pressed,
            ]}
          >
            <SymbolView
              name={{ ios: "globe", android: "language", web: "language" }}
              tintColor="#2168F5"
              size={24}
            />
          </Pressable>
        </View>
        <View
          style={[
            styles.profileCard,
            { backgroundColor: theme.backgroundElement },
          ]}
        >
          {isEditingProfile ? (
            <View style={styles.editProfileHeader}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("Choose a profile photo")}
                disabled={isUploadingAvatar}
                onPress={() => void handlePickAvatar()}
                style={({ pressed }) => [
                  styles.avatarButton,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.avatarFrame}>
                  {avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={styles.avatar} />
                  ) : (
                    <View
                      style={[
                        styles.avatar,
                        styles.avatarPlaceholder,
                        { backgroundColor: theme.accent },
                      ]}
                    >
                      <ThemedText
                        type="subtitle"
                        style={styles.avatarInitial}
                        translate={false}
                      >
                        {displayName.charAt(0).toUpperCase()}
                      </ThemedText>
                    </View>
                  )}
                  {isUploadingAvatar ? (
                    <View style={styles.avatarOverlay}>
                      <ActivityIndicator color="#ffffff" />
                    </View>
                  ) : null}
                </View>
              </Pressable>
              <ThemedText type="small" themeColor="textSecondary">
                {displayName}
              </ThemedText>
            </View>
          ) : (
            <View style={styles.profileIdentity}>
              <View style={styles.avatarFrame}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatar} />
                ) : (
                  <View
                    style={[
                      styles.avatar,
                      styles.avatarPlaceholder,
                      { backgroundColor: theme.accent },
                    ]}
                  >
                    <ThemedText
                      type="subtitle"
                      style={styles.avatarInitial}
                      translate={false}
                    >
                      {displayName.charAt(0).toUpperCase()}
                    </ThemedText>
                  </View>
                )}
              </View>
              <View style={styles.profileDetails}>
                <ThemedText
                  type="subtitle"
                  style={styles.displayName}
                  numberOfLines={1}
                  translate={false}
                >
                  {displayName}
                </ThemedText>
                {email ? (
                  <ThemedText
                    type="small"
                    themeColor="textSecondary"
                    numberOfLines={1}
                  >
                    {email}
                  </ThemedText>
                ) : null}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("Edit profile")}
                onPress={() => {
                  setNameDraft(getName(user));
                  setSelectedAvatar(null);
                  setProfileError(null);
                  setProfileMessage(null);
                  setIsEditingProfile(true);
                }}
                style={({ pressed }) => [
                  styles.editButton,
                  pressed && styles.pressed,
                ]}
              >
                <SymbolView
                  name={{ ios: "pencil", android: "edit", web: "edit" }}
                  tintColor="#2168F5"
                  size={19}
                />
              </Pressable>
            </View>
          )}
          {isEditingProfile ? (
            <Pressable
              accessibilityRole="button"
              disabled={isUploadingAvatar}
              onPress={() => void handlePickAvatar()}
              style={styles.photoButton}
            >
              <ThemedText type="smallBold" style={styles.photoButtonText}>
                {selectedAvatar ? "Change selected photo" : "Choose a photo"}
              </ThemedText>
            </Pressable>
          ) : null}
          {isEditingProfile ? (
            <View style={styles.nameField}>
              <ThemedText type="smallBold">Name</ThemedText>
              <TextInput
                accessibilityLabel={t("Profile name")}
                autoCapitalize="words"
                editable={!isSavingName}
                onChangeText={(value) => {
                  setNameDraft(value);
                  setProfileError(null);
                  setProfileMessage(null);
                }}
                placeholder={t("Your name")}
                placeholderTextColor={theme.textSecondary}
                returnKeyType="done"
                value={name}
                style={[
                  styles.nameInput,
                  {
                    color: theme.text,
                    borderColor: theme.backgroundSelected,
                  },
                ]}
              />
              <Pressable
                accessibilityRole="button"
                disabled={isSavingName || !name.trim()}
                onPress={() => void handleSaveProfile()}
                style={({ pressed }) => [
                  styles.saveButton,
                  pressed && styles.pressed,
                  (isSavingName || !name.trim()) && styles.disabled,
                ]}
              >
                <ThemedText type="smallBold" style={styles.saveButtonText}>
                  {isSavingName ? "Saving..." : "Save changes"}
                </ThemedText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={isSavingName || isUploadingAvatar}
                onPress={handleCancelProfileEdit}
                style={styles.cancelButton}
              >
                <ThemedText type="smallBold" themeColor="textSecondary">
                  Cancel
                </ThemedText>
              </Pressable>
            </View>
          ) : null}
          {profileError ? (
            <ThemedText type="small" style={styles.errorText}>
              {profileError}
            </ThemedText>
          ) : null}
          {avatarLoadError ? (
            <View style={styles.avatarLoadErrorRow}>
              <View style={styles.avatarLoadErrorCopy}>
                <ThemedText type="small" style={styles.errorText}>
                  Network issue. Check your connection.
                </ThemedText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("Retry loading profile photo")}
                onPress={() => setAvatarRetryKey((key) => key + 1)}
                style={({ pressed }) => [
                  styles.avatarRetryTextButton,
                  pressed && styles.pressed,
                ]}
              >
                <ThemedText type="smallBold" style={styles.avatarRetryLabel}>
                  Try again
                </ThemedText>
              </Pressable>
            </View>
          ) : null}
          {profileMessage ? (
            <ThemedText type="small" style={styles.successText}>
              {profileMessage}
            </ThemedText>
          ) : null}
        </View>
        <View
          style={[
            styles.appearanceCard,
            { backgroundColor: theme.backgroundElement },
          ]}
        >
          <View style={styles.appearanceHeader}>
            <View
              style={[
                styles.appearanceIcon,
                { backgroundColor: theme.accentSoft },
              ]}
            >
              <SymbolView
                name={{
                  ios: "circle.lefthalf.filled",
                  android: "contrast",
                  web: "contrast",
                }}
                tintColor={theme.accent}
                size={21}
              />
            </View>
            <View style={styles.appearanceCopy}>
              <ThemedText type="smallBold" style={styles.appearanceTitle}>
                Appearance
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Choose light or dark mode
              </ThemedText>
            </View>
          </View>
          <View
            style={[styles.themeOptions, { backgroundColor: theme.background }]}
          >
            {(["light", "dark"] as const).map((mode) => {
              const isSelected = themeMode === mode;
              return (
                <Pressable
                  key={mode}
                  accessibilityRole="button"
                  accessibilityState={{
                    selected: isSelected,
                    disabled: isSavingTheme,
                  }}
                  disabled={isSavingTheme}
                  onPress={() => void handleThemeChange(mode)}
                  style={[
                    styles.themeOption,
                    isSelected && { backgroundColor: theme.accent },
                  ]}
                >
                  <ThemedText
                    type="smallBold"
                    style={[
                      styles.themeOptionLabel,
                      isSelected && styles.selectedThemeOptionLabel,
                    ]}
                  >
                    {mode === "light" ? "Light" : "Dark"}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
          {themeError ? (
            <ThemedText type="small" style={styles.themeError}>
              {themeError}
            </ThemedText>
          ) : null}
        </View>
        <View
          style={[
            styles.achievementsCard,
            { backgroundColor: theme.backgroundElement },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: areAchievementsExpanded }}
            accessibilityLabel={t("Achievements")}
            onPress={() => setAreAchievementsExpanded((expanded) => !expanded)}
            style={({ pressed }) => [
              styles.achievementsHeader,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.achievementIcon}>
              <SymbolView
                name={{
                  ios: "rosette",
                  android: "workspace_premium",
                  web: "workspace_premium",
                }}
                tintColor="#2168F5"
                size={21}
              />
            </View>
            <ThemedText type="subtitle" style={styles.achievementsTitle}>
              Achievements
            </ThemedText>
            {completedAchievements.length > 0 ? (
              <View style={styles.achievementCount}>
                <ThemedText
                  type="smallBold"
                  style={styles.achievementCountText}
                >
                  {completedAchievements.length}
                </ThemedText>
              </View>
            ) : null}
            <SymbolView
              name={{
                ios: areAchievementsExpanded ? "chevron.up" : "chevron.down",
                android: areAchievementsExpanded
                  ? "keyboard_arrow_up"
                  : "keyboard_arrow_down",
                web: areAchievementsExpanded
                  ? "keyboard_arrow_up"
                  : "keyboard_arrow_down",
              }}
              tintColor="#7180A8"
              size={18}
            />
          </Pressable>
          {areAchievementsExpanded ? (
            isLoadingAchievements ? (
              <ActivityIndicator
                color="#2168F5"
                style={styles.achievementLoader}
              />
            ) : achievementError ? (
              <ThemedText type="small" style={styles.errorText}>
                Could not load achievements: {achievementError}. Return to this
                tab to try again.
              </ThemedText>
            ) : completedAchievements.length === 0 ? (
              <View
                style={[
                  styles.emptyAchievements,
                  { backgroundColor: theme.background },
                ]}
              >
                <ThemedText type="smallBold" style={styles.emptyTitle}>
                  No completed challenges yet
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Completed challenges appear here after every task-day is
                  finished.
                </ThemedText>
              </View>
            ) : (
              completedAchievements.map(renderAchievement)
            )
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={isSigningOut}
          onPress={handleSignOut}
          style={({ pressed }) => [
            styles.signOutButton,
            { borderColor: theme.backgroundSelected },
            pressed && styles.pressed,
            isSigningOut && styles.disabled,
          ]}
        >
          <ThemedText type="smallBold" style={styles.signOutText}>
            {isSigningOut ? "Signing out..." : "Log out"}
          </ThemedText>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

function createStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    screen: {
      flex: 1,
    },
    content: {
      width: "100%",
      maxWidth: MaxContentWidth,
      alignSelf: "center",
      paddingHorizontal: Spacing.three,
      gap: Spacing.three,
    },
    pageHeader: {
      gap: Spacing.one,
      paddingBottom: Spacing.one,
    },
    pageHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    appearanceCard: {
      padding: Spacing.three,
      borderRadius: 22,
      gap: Spacing.three,
    },
    appearanceHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.two,
    },
    appearanceIcon: {
      width: 42,
      height: 42,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 14,
    },
    appearanceCopy: {
      flex: 1,
      gap: 2,
    },
    appearanceTitle: {
      fontSize: 16,
    },
    themeOptions: {
      flexDirection: "row",
      padding: 4,
      borderRadius: 14,
      gap: 4,
    },
    themeOption: {
      flex: 1,
      minHeight: 42,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderRadius: 11,
    },
    themeOptionLabel: {
      color: theme.textSecondary,
    },
    selectedThemeOptionLabel: {
      color: "#FFFFFF",
    },
    themeError: {
      color: theme.danger,
    },
    languageIconButton: {
      width: 48,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 16,
    },
    brand: {
      color: theme.accent,
      fontSize: 11,
      letterSpacing: 1.2,
    },
    title: {
      fontSize: 32,
      lineHeight: 38,
    },
    profileCard: {
      padding: Spacing.three,
      borderRadius: 22,
      gap: Spacing.three,
    },
    profileIdentity: {
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.three,
    },
    profileDetails: {
      flex: 1,
      minWidth: 0,
      gap: Spacing.one,
    },
    editProfileHeader: {
      width: "100%",
      alignItems: "center",
      gap: Spacing.two,
      paddingVertical: Spacing.one,
    },
    avatarFrame: {
      width: 76,
      height: 76,
      borderRadius: 38,
      padding: 3,
      backgroundColor: theme.accentSoft,
    },
    achievementsCard: {
      padding: Spacing.three,
      borderRadius: 22,
      gap: Spacing.three,
    },
    achievementsHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.two,
    },
    achievementIcon: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 15,
      backgroundColor: theme.accentSoft,
    },
    achievementsTitle: {
      flex: 1,
      fontSize: 19,
      lineHeight: 25,
    },
    achievementCount: {
      minWidth: 30,
      height: 30,
      paddingHorizontal: Spacing.two,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 15,
      backgroundColor: theme.accentSoft,
    },
    achievementCountText: {
      color: theme.accent,
    },
    achievementLoader: {
      paddingVertical: Spacing.four,
    },
    emptyAchievements: {
      gap: Spacing.one,
      padding: Spacing.three,
      borderRadius: 16,
    },
    emptyTitle: {
      fontSize: 15,
    },
    achievement: {
      gap: Spacing.two,
      padding: Spacing.three,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    achievementTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: Spacing.two,
    },
    achievementName: {
      flex: 1,
      fontSize: 16,
      lineHeight: 22,
    },
    achievementStatus: {
      minHeight: 28,
      justifyContent: "center",
      paddingHorizontal: Spacing.two,
      borderRadius: 14,
      backgroundColor: theme.backgroundSelected,
    },
    avatarButton: {
      position: "relative",
      borderRadius: 56,
    },
    avatar: {
      width: 70,
      height: 70,
      borderRadius: 35,
    },
    avatarPlaceholder: {
      alignItems: "center",
      justifyContent: "center",
    },
    avatarInitial: {
      color: "#ffffff",
    },
    avatarOverlay: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 56,
      backgroundColor: "#00000066",
    },
    photoButton: {
      minHeight: 38,
      justifyContent: "center",
      paddingHorizontal: Spacing.two,
      borderRadius: 10,
      backgroundColor: theme.accentSoft,
    },
    photoButtonText: {
      color: theme.accent,
    },
    nameField: {
      width: "100%",
      gap: Spacing.two,
    },
    displayName: {
      fontSize: 20,
      lineHeight: 26,
    },
    editButton: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 14,
      backgroundColor: theme.accentSoft,
    },
    nameInput: {
      minHeight: 48,
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: Spacing.three,
      fontSize: 16,
    },
    saveButton: {
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 14,
      backgroundColor: theme.accent,
    },
    saveButtonText: {
      color: "#ffffff",
    },
    cancelButton: {
      minHeight: 40,
      alignItems: "center",
      justifyContent: "center",
    },
    errorText: {
      width: "100%",
      color: theme.danger,
      lineHeight: 20,
    },
    avatarLoadErrorRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.two,
    },
    avatarLoadErrorCopy: {
      flex: 1,
      minWidth: 0,
    },
    avatarRetryTextButton: {
      minHeight: 40,
      flexShrink: 0,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: Spacing.two,
      borderRadius: 12,
      backgroundColor: theme.accentSoft,
    },
    avatarRetryLabel: {
      color: theme.accent,
    },
    successText: {
      width: "100%",
      color: theme.success,
    },
    signOutButton: {
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: Spacing.three,
      borderRadius: 14,
      backgroundColor: "#B423180D",
    },
    signOutText: {
      color: theme.danger,
    },
    pressed: {
      opacity: 0.65,
    },
    disabled: {
      opacity: 0.6,
    },
  });
}
