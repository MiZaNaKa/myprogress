import { Image } from "expo-image";
import {
  router,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";
import { SymbolView } from "expo-symbols";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { MaxContentWidth, Spacing } from "@/constants/theme";
import { useAuth } from "@/context/AuthProvider";
import { useLanguage } from "@/context/LanguageProvider";
import { useTaskCategories } from "@/context/TaskCategoryProvider";
import { useTheme } from "@/hooks/use-theme";
import {
  getLocalDateKey,
  getProgressDateKey,
  shiftDateKey,
} from "@/lib/progress-date";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type CategoryRow = {
  id: string;
  title: string;
  number_of_tasks: number;
  start_date: string | null;
  duration_days: number;
};

type TaskRow = {
  id: string;
  task_categories_id: string;
  task_name: string;
  is_active: boolean;
};

type ProgressRow = {
  task_id: string;
  status: string;
  progress_date: string | null;
};

type ActionTarget =
  | { kind: "category"; id: string; label: string }
  | { kind: "task"; id: string; label: string }
  | { kind: "progress"; id: string; label: string };

const categoryColors = ["#2799F4", "#32BC8A", "#FF9D37", "#A74BEA", "#36B8C2"];
const categoryIcons = [
  { ios: "book.fill", android: "menu_book", web: "menu_book" },
  { ios: "heart.fill", android: "favorite", web: "favorite" },
  { ios: "house.fill", android: "home", web: "home" },
  { ios: "banknote.fill", android: "savings", web: "savings" },
  { ios: "person.fill", android: "person", web: "person" },
] as const;

function getErrorMessage(error: unknown) {
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null
        ? String(
            (error as Record<string, unknown>).message ?? "Please try again.",
          )
        : String(error);
  const firstMessageLine = rawMessage
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("at "));

  return (firstMessageLine ?? "Please try again.").replace(
    /^(?:Error:\s*)+/,
    "",
  );
}

export default function TasksTab() {
  const { refresh: routeRefresh } = useLocalSearchParams<{
    refresh?: string;
  }>();
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [progressRows, setProgressRows] = useState<ProgressRow[]>([]);
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const tasksRef = useRef<TaskRow[]>([]);
  tasksRef.current = tasks;
  const { user } = useAuth();
  const { t } = useLanguage();
  const { categories: recentlyCreatedCategories } = useTaskCategories();
  const userId = user?.id;
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  useEffect(() => {
    let isActive = true;

    const loadTasks = async () => {
      setIsLoading(true);
      setLoadError(null);

      if (!isSupabaseConfigured) {
        if (isActive) {
          setLoadError("Supabase is not configured.");
          setIsLoading(false);
          setIsRefreshing(false);
        }
        return;
      }

      if (!userId) {
        if (isActive) {
          setLoadError("Sign in to view your tasks.");
          setIsLoading(false);
          setIsRefreshing(false);
        }
        return;
      }

      try {
        const { data: categoryData, error: categoryError } = await supabase
          .from("task_categories")
          .select("id, title, number_of_tasks, start_date, duration_days")
          .eq("user_id", userId);

        if (categoryError) throw categoryError;
        const loadedCategories = categoryData ?? [];
        if (!isActive) return;
        setCategories(loadedCategories);

        if (loadedCategories.length === 0) {
          setTasks([]);
          setProgressRows([]);
          return;
        }

        const { data: taskData, error: taskQueryError } = await supabase
          .from("tasks")
          .select("id, task_categories_id, task_name, is_active")
          .eq("user_id", userId)
          .eq("is_active", true)
          .order("id", { ascending: true })
          .in(
            "task_categories_id",
            loadedCategories.map((category) => category.id),
          );

        if (taskQueryError) throw taskQueryError;
        const loadedTasks = taskData ?? [];
        if (!isActive) return;
        setTasks(loadedTasks);

        if (loadedTasks.length === 0) {
          setProgressRows([]);
          return;
        }

        const { data: progressData, error: progressQueryError } = await supabase
          .from("task_progress")
          .select("task_id, status, progress_date")
          .eq("user_id", userId)
          .in(
            "task_id",
            loadedTasks.map((task) => task.id),
          )
          .order("progress_date", { ascending: true });

        if (progressQueryError) throw progressQueryError;
        if (isActive) setProgressRows(progressData ?? []);
      } catch (error) {
        if (isActive) setLoadError(getErrorMessage(error));
      } finally {
        if (isActive) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    };

    void loadTasks();
    return () => {
      isActive = false;
    };
  }, [userId, recentlyCreatedCategories.length, refreshKey, routeRefresh]);

  useFocusEffect(
    useCallback(() => {
      const taskIds = tasksRef.current.map((task) => task.id);
      if (!userId || taskIds.length === 0) return;

      let isActive = true;
      const syncProgress = async () => {
        const { data, error } = await supabase
          .from("task_progress")
          .select("task_id, status, progress_date")
          .eq("user_id", userId)
          .in("task_id", taskIds)
          .order("progress_date", { ascending: true });
        if (error) throw error;
        if (isActive) {
          setProgressRows(data ?? []);
          setLoadError(null);
        }
      };

      void syncProgress().catch((error: unknown) => {
        if (isActive) setLoadError(getErrorMessage(error));
      });

      return () => {
        isActive = false;
      };
    }, [userId]),
  );

  const todayKey = getLocalDateKey(new Date());
  const todayCategories = useMemo(
    () =>
      categories.filter((category) => {
        if (!category.start_date || category.duration_days < 1) return true;
        const startDate = category.start_date.slice(0, 10);
        const endDate = shiftDateKey(startDate, category.duration_days - 1);
        return startDate <= todayKey && todayKey <= endDate;
      }),
    [categories, todayKey],
  );
  const todayCategoryIds = useMemo(
    () => new Set(todayCategories.map((category) => category.id)),
    [todayCategories],
  );
  const todayTasks = useMemo(
    () => tasks.filter((task) => todayCategoryIds.has(task.task_categories_id)),
    [tasks, todayCategoryIds],
  );

  const statusesByTask = useMemo(() => {
    const rows = progressRows
      .filter(
        (row) =>
          row.progress_date &&
          getProgressDateKey(row.progress_date) === todayKey,
      )
      .sort((left, right) => {
        return (left.progress_date ?? "").localeCompare(
          right.progress_date ?? "",
        );
      });

    const latestStatuses = new Map<string, boolean>();
    for (const row of rows) {
      latestStatuses.set(row.task_id, row.status === "completed");
    }
    return latestStatuses;
  }, [progressRows, todayKey]);

  const remainingTasks = useMemo(
    () => todayTasks.filter((task) => !statusesByTask.get(task.id)),
    [statusesByTask, todayTasks],
  );
  const remainingCategories = useMemo(
    () =>
      todayCategories.filter((category) =>
        remainingTasks.some((task) => task.task_categories_id === category.id),
      ),
    [remainingTasks, todayCategories],
  );

  const totalTaskCount = todayTasks.length;
  const completedTaskCount = todayTasks.filter((task) =>
    statusesByTask.get(task.id),
  ).length;
  const completionPercent =
    totalTaskCount === 0
      ? 0
      : Math.round((completedTaskCount / totalTaskCount) * 100);

  const streakDays = useMemo(() => {
    const completedDates = new Set(
      progressRows
        .filter((row) => row.status === "completed" && row.progress_date)
        .map((row) => getProgressDateKey(row.progress_date!)),
    );
    const today = getLocalDateKey(new Date());
    if (
      !completedDates.has(today) &&
      !completedDates.has(shiftDateKey(today, -1))
    ) {
      return 0;
    }
    let count = 0;
    let date = today;
    while (
      completedDates.has(date) ||
      (count === 0 && completedDates.has(shiftDateKey(date, -1)))
    ) {
      if (!completedDates.has(date)) date = shiftDateKey(date, -1);
      count += 1;
      date = shiftDateKey(date, -1);
    }
    return count;
  }, [progressRows]);

  const handleToggleTask = async (task: TaskRow) => {
    if (!userId || savingTaskId) return;

    setSavingTaskId(task.id);
    setTaskError(null);
    const nextStatus = statusesByTask.get(task.id) ? "incomplete" : "completed";
    const todayKey = getLocalDateKey(new Date());

    try {
      const { data: updatedRows, error: updateError } = await supabase
        .from("task_progress")
        .update({ status: nextStatus })
        .eq("task_id", task.id)
        .eq("user_id", userId)
        .eq("progress_date", todayKey)
        .select("task_id");

      if (updateError) throw updateError;
      if (!updatedRows?.length) {
        const { error: insertError } = await supabase
          .from("task_progress")
          .insert({
            task_id: task.id,
            user_id: userId,
            progress_date: todayKey,
            status: nextStatus,
          });
        if (insertError) throw insertError;
      }

      setRefreshKey((key) => key + 1);
    } catch (error) {
      setTaskError(
        `${t("Could not update task progress:")} ${getErrorMessage(error)}`,
      );
    } finally {
      setSavingTaskId(null);
    }
  };

  const openDelete = (target: ActionTarget) => {
    setActionTarget(target);
    setActionError(null);
  };

  const closeAction = () => {
    if (isMutating) return;
    setActionTarget(null);
    setActionError(null);
  };

  const handleDelete = async () => {
    if (!userId || !actionTarget) return;
    setIsMutating(true);
    setActionError(null);
    try {
      if (actionTarget.kind === "progress") {
        const todayKey = getLocalDateKey(new Date());
        const { error } = await supabase
          .from("task_progress")
          .delete()
          .eq("task_id", actionTarget.id)
          .eq("user_id", userId)
          .eq("progress_date", todayKey);
        if (error) throw error;
      } else if (actionTarget.kind === "task") {
        const { error: progressError } = await supabase
          .from("task_progress")
          .delete()
          .eq("task_id", actionTarget.id)
          .eq("user_id", userId);
        if (progressError) throw progressError;

        const { error: taskError } = await supabase
          .from("tasks")
          .delete()
          .eq("id", actionTarget.id)
          .eq("user_id", userId);
        if (taskError) throw taskError;

        const categoryId = tasks.find(
          (task) => task.id === actionTarget.id,
        )?.task_categories_id;
        if (categoryId) {
          const { count, error: countError } = await supabase
            .from("tasks")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("task_categories_id", categoryId);
          if (countError) throw countError;
          const { error: categoryError } = await supabase
            .from("task_categories")
            .update({ number_of_tasks: count ?? 0 })
            .eq("id", categoryId)
            .eq("user_id", userId);
          if (categoryError) throw categoryError;
        }
      } else {
        const { data: categoryTasks, error: taskQueryError } = await supabase
          .from("tasks")
          .select("id")
          .eq("task_categories_id", actionTarget.id)
          .eq("user_id", userId);
        if (taskQueryError) throw taskQueryError;

        const taskIds = (categoryTasks ?? []).map((task) => task.id);
        if (taskIds.length > 0) {
          const { error: progressError } = await supabase
            .from("task_progress")
            .delete()
            .in("task_id", taskIds)
            .eq("user_id", userId);
          if (progressError) throw progressError;

          const { error: taskError } = await supabase
            .from("tasks")
            .delete()
            .in("id", taskIds)
            .eq("user_id", userId);
          if (taskError) throw taskError;
        }

        const { error: categoryError } = await supabase
          .from("task_categories")
          .delete()
          .eq("id", actionTarget.id)
          .eq("user_id", userId);
        if (categoryError) throw categoryError;
        setExpandedCategoryId((current) =>
          current === actionTarget.id ? null : current,
        );
      }

      setActionTarget(null);
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setActionError(
        `${t("Could not delete")} ${t(actionTarget.kind)}: ${getErrorMessage(error)}${t(
          ". The list has been refreshed; check whether the operation partially completed before retrying.",
        )}`,
      );
      setRefreshKey((key) => key + 1);
    } finally {
      setIsMutating(false);
    }
  };

  const handleRetry = () => {
    setLoadError(null);
    setIsLoading(true);
    setRefreshKey((key) => key + 1);
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    handleRetry();
  };

  return (
    <>
      <ScrollView
        style={[styles.screen, { backgroundColor: theme.background }]}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + Spacing.two,
            paddingBottom: Spacing.four,
          },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={theme.accent}
            colors={[theme.accent]}
            progressBackgroundColor={theme.backgroundElement}
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        <ThemedView style={styles.container}>
          <View style={styles.header}>
            <View style={styles.brandRow}>
              <View style={styles.brandMark}>
                <Image
                  source={require("@/assets/images/progress_logo.png")}
                  style={styles.brandLogo}
                  contentFit="contain"
                  accessibilityLabel={t("MyProgress logo")}
                />
              </View>
              <View style={styles.brandCopy}>
                <ThemedText type="smallBold" style={styles.brandTitle}>
                  MyProgress
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Small steps. Big changes.
                </ThemedText>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("Open calendar")}
              onPress={() => router.navigate("/calendar")}
              style={({ pressed }) => [
                styles.headerIconButton,
                pressed && styles.pressed,
              ]}
            >
              <SymbolView
                name={{
                  ios: "calendar",
                  android: "calendar_month",
                  web: "calendar_month",
                }}
                tintColor={theme.accent}
                size={27}
              />
            </Pressable>
          </View>

          <View style={styles.summaryRow}>
            <View style={styles.progressSummary}>
              <View style={styles.progressCircle}>
                <ThemedText type="smallBold" style={styles.progressPercent}>
                  {completionPercent}%
                </ThemedText>
              </View>
              <View style={styles.summaryCopy}>
                <ThemedText type="smallBold" style={styles.summaryTitle}>
                  Today’s Progress
                </ThemedText>
                <ThemedText type="small" style={styles.summarySubTitle}>
                  {completedTaskCount} of {totalTaskCount} tasks completed
                </ThemedText>
              </View>
            </View>
            <View style={styles.streakCard}>
              <Image
                source={require("@/assets/images/streak-flame.svg")}
                style={styles.streakFlame}
                accessibilityLabel={t("Streak flame")}
              />
              <ThemedText type="subtitle" style={styles.streakCount}>
                {streakDays}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                day streak
              </ThemedText>
            </View>
          </View>

          <View style={styles.tasksTitleRow}>
            <View style={styles.tasksTitle}>
              <SymbolView
                name={{
                  ios: "checkmark.square.fill",
                  android: "task_alt",
                  web: "task_alt",
                }}
                tintColor={theme.accent}
                size={29}
              />
              <ThemedText type="subtitle" style={styles.sectionTitle}>
                My Tasks
              </ThemedText>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/create-task")}
              style={({ pressed }) => [
                styles.addButton,
                pressed && styles.pressedButton,
              ]}
            >
              <ThemedText type="subtitle" style={styles.addButtonPlus}>
                +
              </ThemedText>
              <ThemedText type="smallBold" style={styles.addButtonLabel}>
                Add
              </ThemedText>
            </Pressable>
          </View>

          {taskError ? (
            <ThemedText type="small" style={styles.errorText}>
              {taskError}
            </ThemedText>
          ) : null}

          {isLoading ? (
            <ActivityIndicator color={theme.accent} style={styles.loader} />
          ) : loadError ? (
            <View style={styles.feedbackCard}>
              <ThemedText type="small" themeColor="textSecondary">
                {loadError}
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                onPress={handleRetry}
                style={styles.retryButton}
              >
                <ThemedText type="smallBold" style={styles.retryLabel}>
                  Try again
                </ThemedText>
              </Pressable>
            </View>
          ) : categories.length === 0 ? (
            <View style={styles.feedbackCard}>
              <ThemedText type="small" themeColor="textSecondary">
                No task categories yet. Add one to get started.
              </ThemedText>
            </View>
          ) : todayCategories.length === 0 ? (
            <View style={styles.feedbackCard}>
              <ThemedText type="small" themeColor="textSecondary">
                No tasks are scheduled for today.
              </ThemedText>
            </View>
          ) : todayTasks.length === 0 ? (
            <View style={styles.feedbackCard}>
              <ThemedText type="small" themeColor="textSecondary">
                No active tasks are scheduled for today.
              </ThemedText>
            </View>
          ) : remainingTasks.length === 0 ? (
            <View style={styles.feedbackCard}>
              <ThemedText type="small" themeColor="textSecondary">
                All current tasks are complete.
              </ThemedText>
            </View>
          ) : (
            <View style={styles.categoryList}>
              {remainingCategories.map((category, index) => {
                const categoryTasks = todayTasks.filter(
                  (task) => task.task_categories_id === category.id,
                );
                const categoryRemainingTasks = remainingTasks.filter(
                  (task) => task.task_categories_id === category.id,
                );
                const completedCount = categoryTasks.filter((task) =>
                  statusesByTask.get(task.id),
                ).length;
                const percent =
                  categoryTasks.length === 0
                    ? 0
                    : Math.round((completedCount / categoryTasks.length) * 100);
                const expanded =
                  expandedCategoryId === category.id ||
                  (expandedCategoryId === null && index === 0);
                const iconIndex = index % categoryIcons.length;
                const iconColor = categoryColors[iconIndex];

                return (
                  <View
                    key={category.id}
                    style={[
                      styles.categoryCard,
                      { backgroundColor: theme.backgroundElement },
                    ]}
                  >
                    <View style={styles.categoryHeader}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ expanded }}
                        onPress={() =>
                          setExpandedCategoryId(expanded ? "" : category.id)
                        }
                        style={styles.categoryMain}
                      >
                        <View
                          style={[
                            styles.categoryIconWrap,
                            { backgroundColor: `${iconColor}22` },
                          ]}
                        >
                          <SymbolView
                            name={categoryIcons[iconIndex]}
                            tintColor={iconColor}
                            size={28}
                          />
                        </View>
                        <View style={styles.categoryInfo}>
                          <ThemedText
                            type="smallBold"
                            style={styles.categoryTitle}
                            translate={false}
                          >
                            {category.title}
                          </ThemedText>
                          <ThemedText type="small" themeColor="textSecondary">
                            {completedCount} / {categoryTasks.length} completed
                          </ThemedText>
                          <View style={styles.progressTrack}>
                            <View
                              style={[
                                styles.progressFill,
                                { width: `${percent}%` },
                              ]}
                            />
                          </View>
                        </View>
                        <ThemedText
                          type="smallBold"
                          style={styles.categoryPercent}
                        >
                          {percent}%
                        </ThemedText>
                        <SymbolView
                          name={
                            expanded
                              ? {
                                  ios: "chevron.up",
                                  android: "keyboard_arrow_up",
                                  web: "keyboard_arrow_up",
                                }
                              : {
                                  ios: "chevron.down",
                                  android: "keyboard_arrow_down",
                                  web: "keyboard_arrow_down",
                                }
                          }
                          tintColor={theme.accent}
                          size={20}
                        />
                      </Pressable>
                      <View style={styles.categoryActions}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`${t("Edit")} ${category.title}`}
                          onPress={() =>
                            router.push({
                              pathname: "/create-task",
                              params: { categoryId: category.id },
                            })
                          }
                          style={styles.actionButton}
                        >
                          <SymbolView
                            name={{
                              ios: "pencil",
                              android: "edit",
                              web: "edit",
                            }}
                            tintColor={theme.accent}
                            size={18}
                          />
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`${t("Delete")} ${category.title}`}
                          onPress={() =>
                            openDelete({
                              kind: "category",
                              id: category.id,
                              label: category.title,
                            })
                          }
                          style={styles.actionButton}
                        >
                          <SymbolView
                            name={{
                              ios: "minus.circle",
                              android: "remove_circle",
                              web: "remove_circle",
                            }}
                            tintColor={theme.textSecondary}
                            size={18}
                          />
                        </Pressable>
                      </View>
                    </View>
                    {expanded ? (
                      <View
                        style={[
                          styles.taskList,
                          { backgroundColor: theme.background },
                        ]}
                      >
                        {categoryRemainingTasks.length === 0 ? (
                          <ThemedText
                            type="small"
                            themeColor="textSecondary"
                            style={styles.noTasks}
                          >
                            No active tasks in this category.
                          </ThemedText>
                        ) : (
                          categoryRemainingTasks.map((task) => {
                            const isCompleted =
                              statusesByTask.get(task.id) ?? false;
                            return (
                              <View key={task.id} style={styles.taskRow}>
                                <Pressable
                                  accessibilityRole="checkbox"
                                  accessibilityState={{
                                    checked: isCompleted,
                                    disabled: savingTaskId !== null,
                                  }}
                                  disabled={savingTaskId !== null}
                                  onPress={() => void handleToggleTask(task)}
                                  style={({ pressed }) => [
                                    styles.taskCheck,
                                    isCompleted && styles.completedCheck,
                                    pressed && styles.pressed,
                                  ]}
                                >
                                  {isCompleted ? (
                                    <SymbolView
                                      name={{
                                        ios: "checkmark",
                                        android: "check",
                                        web: "check",
                                      }}
                                      tintColor="#ffffff"
                                      size={16}
                                    />
                                  ) : null}
                                </Pressable>
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel={`${t("Toggle progress for")} ${task.task_name}`}
                                  disabled={savingTaskId !== null}
                                  onPress={() => void handleToggleTask(task)}
                                  style={styles.taskNameButton}
                                >
                                  <ThemedText
                                    type="small"
                                    translate={false}
                                    style={[
                                      styles.taskName,
                                      isCompleted && styles.completedTaskName,
                                    ]}
                                  >
                                    {task.task_name}
                                  </ThemedText>
                                </Pressable>
                                {savingTaskId === task.id ? (
                                  <ActivityIndicator
                                    size="small"
                                    color={theme.accent}
                                  />
                                ) : null}
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel={`${t("Clear today's progress for")} ${task.task_name}`}
                                  onPress={() =>
                                    openDelete({
                                      kind: "progress",
                                      id: task.id,
                                      label: task.task_name,
                                    })
                                  }
                                  style={styles.actionButton}
                                >
                                  <SymbolView
                                    name={{
                                      ios: "trash",
                                      android: "delete",
                                      web: "delete",
                                    }}
                                    tintColor={theme.danger}
                                    size={18}
                                  />
                                </Pressable>
                              </View>
                            );
                          })
                        )}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        </ThemedView>
      </ScrollView>
      <Modal
        visible={actionTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={closeAction}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: theme.backgroundElement },
            ]}
          >
            <ThemedText type="subtitle" style={styles.modalTitle}>
              {actionTarget?.kind === "progress"
                ? "Clear today’s progress?"
                : `${t("Delete")} “${actionTarget?.label ?? ""}”?`}
            </ThemedText>
            {actionTarget?.kind === "progress" ? (
              <ThemedText type="small" themeColor="textSecondary">
                {t("This removes today’s progress entry")} {actionTarget.label}.
              </ThemedText>
            ) : actionTarget ? (
              <ThemedText type="small" themeColor="textSecondary">
                {actionTarget.kind === "category"
                  ? "This also permanently deletes all tasks and progress in this category."
                  : "This also permanently deletes this task’s progress history."}
              </ThemedText>
            ) : null}
            {actionError ? (
              <ThemedText type="small" style={styles.errorText}>
                {actionError}
              </ThemedText>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                disabled={isMutating}
                onPress={closeAction}
                style={styles.modalButton}
              >
                <ThemedText type="smallBold" style={styles.cancelLabel}>
                  Cancel
                </ThemedText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={isMutating}
                onPress={() => void handleDelete()}
                style={[styles.modalButton, styles.dangerButton]}
              >
                <ThemedText type="smallBold" style={styles.confirmLabel}>
                  {isMutating ? "Deleting..." : "Delete"}
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function createStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    screen: {
      flex: 1,
    },
    content: {
      alignItems: "center",
      paddingHorizontal: Spacing.three,
    },
    container: {
      width: "100%",
      maxWidth: MaxContentWidth,
      gap: Spacing.three,
    },
    header: {
      minHeight: 68,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    brandRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.two,
    },
    brandMark: {
      width: 54,
      height: 54,
      alignItems: "center",
      justifyContent: "center",
    },
    brandLogo: {
      width: "100%",
      height: "100%",
    },
    brandCopy: {
      gap: 1,
    },
    brandTitle: {
      color: theme.text,
      fontSize: 24,
      lineHeight: 29,
    },
    headerIconButton: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    summaryRow: {
      flexDirection: "row",
      gap: Spacing.two,
    },
    progressSummary: {
      flex: 1,
      minHeight: 112,
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.three,
      padding: Spacing.three,
      borderRadius: 22,
      backgroundColor: theme.backgroundElement,
    },
    progressCircle: {
      width: 78,
      height: 78,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 40,
      borderWidth: 7,
      borderColor: "#43C89C",
      backgroundColor: theme.background,
    },
    progressPercent: {
      color: theme.text,
      fontSize: 20,
    },
    summaryCopy: {
      flex: 1,
      gap: Spacing.one,
    },
    summaryTitle: {
      color: theme.text,
      fontSize: 17,
    },
    summarySubTitle: {
      color: theme.textSecondary,
      fontSize: 14,
    },
    streakCard: {
      width: 92,
      minHeight: 112,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 22,
      backgroundColor: theme.backgroundElement,
    },
    streakFlame: {
      width: 25,
      height: 30,
    },
    streakCount: {
      color: theme.text,
      fontSize: 24,
      lineHeight: 27,
    },
    tasksTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: Spacing.one,
    },
    tasksTitle: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.two,
    },
    sectionTitle: {
      color: theme.text,
      fontSize: 22,
      lineHeight: 28,
    },
    addButton: {
      minWidth: 88,
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: Spacing.one,
      paddingHorizontal: Spacing.three,
      borderRadius: 24,
      backgroundColor: theme.accent,
    },
    addButtonPlus: {
      color: "#ffffff",
      fontSize: 28,
      lineHeight: 30,
    },
    addButtonLabel: {
      color: "#ffffff",
      fontSize: 15,
    },
    categoryList: {
      gap: Spacing.two,
    },
    categoryCard: {
      overflow: "hidden",
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.border,
      padding: Spacing.two,
      shadowColor: "#405AA6",
      shadowOpacity: 0.06,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    categoryHeader: {
      minHeight: 72,
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.two,
    },
    categoryMain: {
      flex: 1,
      minHeight: 68,
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.two,
    },
    categoryIconWrap: {
      width: 54,
      height: 54,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 28,
    },
    categoryInfo: {
      flex: 1,
      gap: 2,
    },
    categoryTitle: {
      color: theme.text,
      fontSize: 17,
    },
    categoryPercent: {
      minWidth: 38,
      color: theme.accent,
      textAlign: "right",
    },
    categoryActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
    },
    actionButton: {
      width: 36,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 12,
    },
    progressTrack: {
      height: 8,
      overflow: "hidden",
      marginTop: Spacing.one,
      borderRadius: 6,
      backgroundColor: theme.backgroundSelected,
    },
    progressFill: {
      height: "100%",
      borderRadius: 6,
      backgroundColor: theme.accent,
    },
    taskList: {
      marginTop: Spacing.one,
      paddingHorizontal: Spacing.two,
      borderRadius: 14,
    },
    taskRow: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.one,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    taskCheck: {
      width: 24,
      height: 24,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: theme.border,
      borderRadius: 14,
    },
    taskNameButton: {
      flex: 1,
      minHeight: 44,
      justifyContent: "center",
    },
    completedCheck: {
      borderColor: "#32BC8A",
      backgroundColor: "#32BC8A",
    },
    taskName: {
      flex: 1,
      color: theme.text,
    },
    completedTaskName: {
      color: theme.textSecondary,
      textDecorationLine: "line-through",
    },
    noTasks: {
      paddingVertical: Spacing.three,
    },
    feedbackCard: {
      gap: Spacing.two,
      padding: Spacing.three,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      backgroundColor: theme.backgroundElement,
    },
    loader: {
      padding: Spacing.four,
    },
    retryButton: {
      alignSelf: "flex-start",
      paddingVertical: Spacing.one,
    },
    retryLabel: {
      color: theme.accent,
    },
    errorText: {
      color: theme.danger,
    },
    modalBackdrop: {
      flex: 1,
      justifyContent: "center",
      padding: Spacing.three,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
    },
    modalCard: {
      width: "100%",
      maxWidth: 440,
      alignSelf: "center",
      padding: Spacing.three,
      borderRadius: 18,
      gap: Spacing.three,
    },
    modalTitle: {
      color: theme.text,
    },
    modalActions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: Spacing.two,
    },
    modalButton: {
      minWidth: 90,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: Spacing.two,
      borderRadius: 14,
      backgroundColor: theme.accentSoft,
    },
    dangerButton: {
      backgroundColor: theme.danger,
    },
    confirmLabel: {
      color: "#ffffff",
    },
    cancelLabel: {
      color: theme.text,
    },
    pressed: {
      opacity: 0.7,
    },
    pressedButton: {
      opacity: 0.82,
    },
  });
}
