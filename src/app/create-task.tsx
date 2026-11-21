import { FunctionsHttpError } from "@supabase/supabase-js";
import { router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useAuth } from "@/context/AuthProvider";
import { useLanguage } from "@/context/LanguageProvider";
import { useTaskCategories } from "@/context/TaskCategoryProvider";
import { useTheme } from "@/hooks/use-theme";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

const MAX_TASK_COUNT = 30;
const MAX_DURATION_DAYS = 9999;
const CATEGORY_ICONS = [
  { ios: "book.fill", android: "menu_book", web: "menu_book" },
  { ios: "dumbbell.fill", android: "fitness_center", web: "fitness_center" },
  { ios: "briefcase.fill", android: "work", web: "work" },
  { ios: "banknote.fill", android: "payments", web: "payments" },
  { ios: "house.fill", android: "home", web: "home" },
  { ios: "star.fill", android: "star", web: "star" },
] as const;
const CATEGORY_COLORS = [
  "#E53935",
  "#1D4ED8",
  "#EC4899",
  "#7C3AED",
  "#111827",
  "#6B7280",
] as const;

type Feedback = {
  title: string;
  message: string;
  isSuccess?: boolean;
};

async function getErrorMessage(error: unknown) {
  if (
    error instanceof FunctionsHttpError &&
    error.context instanceof Response
  ) {
    const response = error.context;
    try {
      const body = (await response.clone().text()).trim();
      return [
        `Edge Function returned HTTP ${response.status}.`,
        body.slice(0, 2000),
      ]
        .filter(Boolean)
        .join("\n");
    } catch (bodyError) {
      const detail =
        bodyError instanceof Error ? bodyError.message : String(bodyError);
      return `Edge Function returned HTTP ${response.status}; response body could not be read: ${detail}`;
    }
  }
  if (error instanceof Error) return error.message;
  if (typeof error !== "object" || error === null) return String(error);

  const fields = error as Record<string, unknown>;
  return (
    [
      fields.message,
      fields.code && `Code: ${String(fields.code)}`,
      fields.details && `Details: ${String(fields.details)}`,
      fields.hint && `Hint: ${String(fields.hint)}`,
    ]
      .filter((value): value is string => typeof value === "string")
      .join("\n") || "An unknown error occurred."
  );
}

export default function CreateTaskScreen() {
  const { categoryId: categoryIdParam, taskId: taskIdParam } =
    useLocalSearchParams<{
      categoryId?: string;
      taskId?: string;
    }>();
  const categoryId =
    typeof categoryIdParam === "string" ? categoryIdParam : undefined;
  const taskId = typeof taskIdParam === "string" ? taskIdParam : undefined;
  const isEditingTask = categoryId !== undefined && taskId !== undefined;
  const isEditing = categoryId !== undefined;
  const [categoryTitle, setCategoryTitle] = useState("");
  const [taskCount, setTaskCount] = useState(2);
  const [categoryTaskCount, setCategoryTaskCount] = useState(0);
  const [durationDays, setDurationDays] = useState("");
  const [taskNames, setTaskNames] = useState<string[]>(["", ""]);
  const [existingTaskIds, setExistingTaskIds] = useState<string[]>([]);
  const [selectedIcon, setSelectedIcon] = useState(0);
  const [selectedColor, setSelectedColor] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isLoadingCategory, setIsLoadingCategory] = useState(isEditing);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const { user, loading: isAuthLoading } = useAuth();
  const { t } = useLanguage();
  const { addCategory } = useTaskCategories();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  useEffect(() => {
    let isActive = true;

    if (!categoryId) {
      return () => {
        isActive = false;
      };
    }

    if (isAuthLoading) {
      return () => {
        isActive = false;
      };
    }

    const loadCategory = async () => {
      setIsLoadingCategory(true);
      setLoadError(null);

      try {
        if (!isSupabaseConfigured) {
          throw new Error("Supabase is not configured.");
        }
        if (!user) {
          throw new Error("Sign in to edit this category.");
        }

        const { data: category, error: categoryError } = await supabase
          .from("task_categories")
          .select("title, duration_days")
          .eq("id", categoryId)
          .eq("user_id", user.id)
          .single();
        if (categoryError) throw categoryError;

        const { data: categoryTasks, error: taskError } = await supabase
          .from("tasks")
          .select("id, task_name")
          .eq("task_categories_id", categoryId)
          .eq("user_id", user.id)
          .eq("is_active", true)
          .order("id", { ascending: true });
        if (taskError) throw taskError;

        const activeTasks = categoryTasks ?? [];
        if (activeTasks.length > MAX_TASK_COUNT) {
          throw new Error(
            `This category has more than ${MAX_TASK_COUNT} active tasks and cannot be edited here.`,
          );
        }
        if (!isActive) return;

        setCategoryTitle(category.title);
        setDurationDays(String(category.duration_days ?? ""));
        setCategoryTaskCount(activeTasks.length);
        if (isEditingTask) {
          const taskToEdit = activeTasks.find((task) => task.id === taskId);
          if (!taskToEdit) {
            throw new Error("The task could not be found in this category.");
          }
          setTaskNames([taskToEdit.task_name]);
          setExistingTaskIds([taskToEdit.id]);
        } else {
          const names = activeTasks.map((task) => task.task_name);
          setTaskCount(Math.max(1, names.length));
          setTaskNames(names.length > 0 ? names : [""]);
          setExistingTaskIds(activeTasks.map((task) => task.id));
        }
      } catch (error) {
        if (isActive) {
          setLoadError(await getErrorMessage(error));
        }
      } finally {
        if (isActive) setIsLoadingCategory(false);
      }
    };

    void loadCategory();
    return () => {
      isActive = false;
    };
  }, [categoryId, isAuthLoading, isEditingTask, loadAttempt, taskId, user]);

  const parsedDurationDays = /^\d{1,4}$/.test(durationDays)
    ? Number(durationDays)
    : 0;
  const isDurationValid =
    parsedDurationDays >= 1 && parsedDurationDays <= MAX_DURATION_DAYS;
  const canCreate =
    (isEditingTask || (categoryTitle.trim().length > 0 && isDurationValid)) &&
    taskNames.length > 0 &&
    taskNames.every((name) => name.trim().length > 0) &&
    (!isEditing || (!isLoadingCategory && loadError === null));

  const setTaskCountAndNames = (count: number) => {
    const nextCount = Math.max(1, Math.min(MAX_TASK_COUNT, count));
    setTaskCount(nextCount);
    setTaskNames((current) =>
      Array.from({ length: nextCount }, (_, index) => current[index] ?? ""),
    );
  };

  const handleCreateCategory = async () => {
    if (!canCreate || isSaving) return;

    if (!isSupabaseConfigured) {
      setFeedback({
        title: "Supabase is not configured",
        message:
          "Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, then restart the app.",
      });
      return;
    }

    if (!user) {
      setFeedback({
        title: "Sign in required",
        message: "Please sign in before creating a category.",
      });
      return;
    }

    setIsSaving(true);
    let failedStep = "category";

    try {
      if (isEditingTask && categoryId && taskId) {
        failedStep = "task";
        const { error: taskError } = await supabase
          .from("tasks")
          .update({ task_name: taskNames[0].trim() })
          .eq("id", taskId)
          .eq("task_categories_id", categoryId)
          .eq("user_id", user.id);
        if (taskError) throw taskError;

        setFeedback({
          title: "Task updated",
          message: "The task was updated without changing the task count.",
          isSuccess: true,
        });
        return;
      }

      if (isEditing && categoryId) {
        const { error: categoryError } = await supabase
          .from("task_categories")
          .update({
            title: categoryTitle.trim(),
            duration_days: parsedDurationDays,
          })
          .eq("id", categoryId)
          .eq("user_id", user.id);
        if (categoryError) throw categoryError;

        failedStep = "tasks";
        for (let index = 0; index < existingTaskIds.length; index += 1) {
          const taskId = existingTaskIds[index];
          const taskName = taskNames[index].trim();
          const { error: taskError } = await supabase
            .from("tasks")
            .update({ task_name: taskName })
            .eq("id", taskId)
            .eq("user_id", user.id);
          if (taskError) throw taskError;
        }

        setFeedback({
          title: "Category updated",
          message: "Your category and tasks were updated successfully.",
          isSuccess: true,
        });
        return;
      }

      const now = new Date();
      const startDate = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
      ].join("-");
      const { data: category, error: categoryError } = await supabase
        .from("task_categories")
        .insert({
          user_id: user.id,
          title: categoryTitle.trim(),
          number_of_tasks: taskNames.length,
          duration_days: parsedDurationDays,
          start_date: startDate,
        })
        .select("id")
        .single();

      if (categoryError) throw categoryError;

      failedStep = "tasks";
      const { data: tasks, error: tasksError } = await supabase
        .from("tasks")
        .insert(
          taskNames.map((name) => ({
            user_id: user.id,
            task_name: name.trim(),
            is_active: true,
            task_categories_id: category.id,
          })),
        )
        .select("id");

      if (tasksError) throw tasksError;
      if (!tasks || tasks.length !== taskNames.length) {
        throw new Error(
          "Supabase did not return an ID for every inserted task.",
        );
      }

      failedStep = "daily progress";
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const { error: progressError } = await supabase.functions.invoke(
        "generate-daily-progress",
        {
          body: {
            mode: "create_today",
            category_id: category.id,
            timezone,
          },
        },
      );
      if (progressError) throw progressError;

      addCategory({
        title: categoryTitle.trim(),
        tasks: taskNames.map((name) => name.trim()),
      });
      setFeedback({
        title: "Category created",
        message: "Your task category and tasks were created successfully.",
        isSuccess: true,
      });
    } catch (error) {
      const detail = await getErrorMessage(error);
      const partialSaveMessage =
        failedStep === "category"
          ? ""
          : ` Some earlier ${isEditing ? "changes" : "records"} may already have been saved.`;

      setFeedback({
        title: "Could not create category",
        message: `Saving ${failedStep} failed.${partialSaveMessage}\n\n${detail}`,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const inputStyle = {
    color: theme.text,
    borderColor: theme.border,
    backgroundColor: theme.backgroundElement,
  };

  return (
    <>
      <KeyboardAvoidingView
        style={styles.keyboardAvoiding}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.contentContainer,
            {
              paddingTop: insets.top + Spacing.two,
              paddingBottom: insets.bottom + BottomTabInset + Spacing.three,
            },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <ThemedView style={styles.container}>
            <View style={styles.header}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("Go back")}
                onPress={() => router.back()}
                style={({ pressed }) => [
                  styles.backButton,
                  pressed && styles.pressed,
                ]}
              >
                <SymbolView
                  name={{
                    ios: "chevron.left",
                    android: "arrow_back",
                    web: "arrow_back",
                  }}
                  tintColor="#243B5A"
                  size={20}
                />
              </Pressable>
            </View>

            {isEditing && isLoadingCategory ? (
              <View style={styles.formCard}>
                <ActivityIndicator color={theme.accent} />
                <ThemedText type="small" themeColor="textSecondary">
                  {t("Loading")} {t(isEditingTask ? "task" : "category")}...
                </ThemedText>
              </View>
            ) : null}
            {isEditing && loadError ? (
              <View style={styles.formCard}>
                <ThemedText type="small" style={styles.errorText}>
                  {t("Could not load")} {t(isEditingTask ? "task" : "category")}
                  : {loadError}
                </ThemedText>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setLoadAttempt((attempt) => attempt + 1)}
                  style={styles.primaryButton}
                >
                  <ThemedText type="smallBold" style={styles.primaryButtonText}>
                    Try again
                  </ThemedText>
                </Pressable>
              </View>
            ) : null}

            {!isEditingTask ? (
              <View style={styles.formCard}>
                <View style={styles.titleRow}>
                  <View
                    style={[
                      styles.selectedIconPreview,
                      {
                        backgroundColor: `${CATEGORY_COLORS[selectedColor]}22`,
                      },
                    ]}
                  >
                    <SymbolView
                      name={CATEGORY_ICONS[selectedIcon]}
                      tintColor={CATEGORY_COLORS[selectedColor]}
                      size={40}
                    />
                  </View>
                  <View style={styles.titleField}>
                    <ThemedText type="smallBold" style={styles.fieldLabel}>
                      Category Title{" "}
                      <ThemedText style={styles.required}>*</ThemedText>
                    </ThemedText>
                    <TextInput
                      accessibilityLabel={t("Category title")}
                      value={categoryTitle}
                      onChangeText={setCategoryTitle}
                      placeholder={t("e.g. Work")}
                      placeholderTextColor={theme.textSecondary}
                      returnKeyType="next"
                      style={[styles.input, inputStyle]}
                    />
                  </View>
                </View>

                <View style={styles.selectorSection}>
                  <ThemedText type="smallBold" style={styles.fieldLabel}>
                    Select Icon &amp; Color
                  </ThemedText>
                  <View style={styles.iconChoices}>
                    {CATEGORY_ICONS.map((icon, index) => (
                      <Pressable
                        key={icon.ios}
                        accessibilityRole="button"
                        accessibilityLabel={`${t("Select category icon")} ${index + 1}`}
                        accessibilityState={{
                          selected: selectedIcon === index,
                        }}
                        onPress={() => setSelectedIcon(index)}
                        style={[
                          styles.iconChoice,
                          selectedIcon === index && [
                            styles.selectedIconChoice,
                            { borderColor: CATEGORY_COLORS[selectedColor] },
                          ],
                        ]}
                      >
                        <SymbolView
                          name={icon}
                          tintColor={CATEGORY_COLORS[selectedColor]}
                          size={28}
                        />
                      </Pressable>
                    ))}
                  </View>
                  <View style={styles.colorChoices}>
                    {CATEGORY_COLORS.map((color, index) => (
                      <Pressable
                        key={color}
                        accessibilityRole="button"
                        accessibilityLabel={`${t("Select category color")} ${index + 1}`}
                        accessibilityState={{
                          selected: selectedColor === index,
                        }}
                        onPress={() => setSelectedColor(index)}
                        style={[
                          styles.colorChoice,
                          { backgroundColor: color },
                          selectedColor === index && styles.selectedColorChoice,
                        ]}
                      />
                    ))}
                  </View>
                </View>
              </View>
            ) : null}

            {isEditingTask ? (
              <View style={styles.formCard}>
                <ThemedText type="smallBold" style={styles.fieldLabel}>
                  Number of Tasks
                </ThemedText>
                <View style={styles.counter}>
                  <ThemedText
                    type="subtitle"
                    accessibilityLabel={`${categoryTaskCount} ${t("tasks")}`}
                    style={styles.counterValue}
                  >
                    {categoryTaskCount}
                  </ThemedText>
                </View>
              </View>
            ) : !isEditing ? (
              <View style={styles.formCard}>
                <ThemedText type="smallBold" style={styles.fieldLabel}>
                  Number of Tasks{" "}
                  <ThemedText style={styles.required}>*</ThemedText>
                </ThemedText>
                <View style={styles.counter}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("Remove one task")}
                    disabled={taskCount <= 1}
                    onPress={() => setTaskCountAndNames(taskCount - 1)}
                    style={({ pressed }) => [
                      styles.counterButton,
                      taskCount <= 1 && styles.disabledCounterButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    <ThemedText type="subtitle" style={styles.counterSymbol}>
                      −
                    </ThemedText>
                  </Pressable>
                  <ThemedText type="subtitle" style={styles.counterValue}>
                    {taskCount}
                  </ThemedText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("Add one task")}
                    disabled={taskCount >= MAX_TASK_COUNT}
                    onPress={() => setTaskCountAndNames(taskCount + 1)}
                    style={({ pressed }) => [
                      styles.counterButton,
                      taskCount >= MAX_TASK_COUNT &&
                        styles.disabledCounterButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    <ThemedText type="subtitle" style={styles.counterSymbol}>
                      +
                    </ThemedText>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {!isEditingTask ? (
              <View style={styles.formCard}>
                <ThemedText type="smallBold" style={styles.fieldLabel}>
                  Duration Days{" "}
                  <ThemedText style={styles.required}>*</ThemedText>
                </ThemedText>
                <View style={styles.durationInputRow}>
                  <SymbolView
                    name={{
                      ios: "calendar",
                      android: "calendar_month",
                      web: "calendar_month",
                    }}
                    tintColor={theme.accent}
                    size={23}
                  />
                  <TextInput
                    accessibilityLabel={t("Duration in days")}
                    value={durationDays}
                    onChangeText={(value) =>
                      setDurationDays(value.replace(/\D/g, "").slice(0, 4))
                    }
                    placeholder={t("0000")}
                    placeholderTextColor={theme.textSecondary}
                    keyboardType={
                      Platform.OS === "ios" ? "number-pad" : "numeric"
                    }
                    maxLength={4}
                    style={[styles.durationInput, { color: theme.text }]}
                  />
                  <ThemedText type="small" style={styles.maxDigits}>
                    (Max 4 digits)
                  </ThemedText>
                </View>
              </View>
            ) : null}

            <View style={styles.formCard}>
              <ThemedText type="subtitle" style={styles.taskNamesTitle}>
                {isEditingTask ? "Task Name" : "Enter Task Names"}
              </ThemedText>
              <View style={styles.taskFields}>
                {taskNames.map((name, index) => (
                  <View key={index} style={styles.taskFieldRow}>
                    <View style={styles.taskNumber}>
                      <ThemedText
                        type="smallBold"
                        style={styles.taskNumberText}
                      >
                        {index + 1}
                      </ThemedText>
                    </View>
                    <TextInput
                      accessibilityLabel={`${t("Task")} ${index + 1} ${t("Name")}`}
                      value={name}
                      onChangeText={(value) =>
                        setTaskNames((current) =>
                          current.map((taskName, taskIndex) =>
                            taskIndex === index ? value : taskName,
                          ),
                        )
                      }
                      placeholder={`${t("Enter task")} ${index + 1}`}
                      placeholderTextColor={theme.textSecondary}
                      returnKeyType={
                        index === taskNames.length - 1 ? "done" : "next"
                      }
                      style={[styles.input, styles.taskInput, inputStyle]}
                    />
                  </View>
                ))}
              </View>
            </View>

            {!isEditing ? (
              <Pressable
                accessibilityRole="button"
                disabled={taskCount >= MAX_TASK_COUNT}
                onPress={() => setTaskCountAndNames(taskCount + 1)}
                style={({ pressed }) => [
                  styles.addTaskButton,
                  taskCount >= MAX_TASK_COUNT && styles.disabledButton,
                  pressed && styles.pressed,
                ]}
              >
                <ThemedText type="subtitle" style={styles.addTaskPlus}>
                  +
                </ThemedText>
                <ThemedText type="smallBold" style={styles.addTaskLabel}>
                  Add More Tasks
                </ThemedText>
              </Pressable>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={!canCreate || isSaving}
              onPress={handleCreateCategory}
              style={({ pressed }) => [
                styles.primaryButton,
                (!canCreate || isSaving) && styles.disabledButton,
                pressed && canCreate && !isSaving && styles.pressedButton,
              ]}
            >
              <ThemedText type="subtitle" style={styles.primaryButtonText}>
                {isSaving
                  ? "Saving..."
                  : isEditingTask
                    ? "✓   Update Task"
                    : isEditing
                      ? "✓   Save Changes"
                      : "✓   Create Category"}
              </ThemedText>
            </Pressable>
          </ThemedView>
        </ScrollView>
      </KeyboardAvoidingView>
      <Modal
        visible={feedback !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setFeedback(null)}
      >
        <View style={styles.modalBackdrop}>
          <ThemedView
            style={[
              styles.modalCard,
              { borderColor: theme.backgroundSelected },
            ]}
          >
            <ThemedText type="subtitle" style={styles.modalTitle}>
              {feedback?.title}
            </ThemedText>
            <ThemedText type="small" style={styles.modalMessage}>
              {feedback?.message}
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                const wasSuccessful = feedback?.isSuccess;
                setFeedback(null);
                if (wasSuccessful) {
                  if (isEditing) {
                    router.replace({
                      pathname: "/tasks",
                      params: { refresh: String(Date.now()) },
                    });
                  } else {
                    router.replace("/tasks");
                  }
                }
              }}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.pressedButton,
              ]}
            >
              <ThemedText type="smallBold" style={styles.primaryButtonText}>
                {feedback?.isSuccess ? "Go to Tasks" : "Close"}
              </ThemedText>
            </Pressable>
          </ThemedView>
        </View>
      </Modal>
    </>
  );
}

function createStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
  keyboardAvoiding: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    backgroundColor: theme.background,
  },
  contentContainer: {
    alignItems: "center",
    paddingHorizontal: 16,
  },
  container: {
    width: "100%",
    maxWidth: MaxContentWidth,
    gap: 14,
    backgroundColor: theme.background,
  },
  header: {
    alignItems: "flex-start",
    marginBottom: 2,
  },
  backButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E6EBF2",
  },
  formCard: {
    width: "100%",
    padding: 16,
    gap: 18,
    borderRadius: 18,
    backgroundColor: theme.backgroundElement,
    borderWidth: 1,
    borderColor: theme.border,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  selectedIconPreview: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  titleField: {
    flex: 1,
    gap: 8,
  },
  fieldLabel: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "700",
  },
  required: {
    color: "#E4435E",
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 13,
    fontSize: 16,
    backgroundColor: theme.backgroundElement,
  },
  selectorSection: {
    gap: 10,
  },
  iconChoices: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 8,
  },
  iconChoice: {
    width: "31.5%",
    height: 68,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: theme.background,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  selectedIconChoice: {
    backgroundColor: theme.backgroundElement,
  },
  colorChoices: {
    flexDirection: "row",
    flexWrap: "nowrap",
    justifyContent: "space-between",
    paddingTop: 0,
  },
  colorChoice: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  selectedColorChoice: {
    borderColor: theme.accent,
    borderWidth: 2.5,
  },
  counter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  counterButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 23,
    backgroundColor: theme.accentSoft,
  },
  disabledCounterButton: {
    opacity: 0.4,
  },
  counterSymbol: {
    color: theme.accent,
    fontSize: 30,
    lineHeight: 36,
  },
  counterValue: {
    flex: 1,
    color: theme.text,
    textAlign: "center",
    fontSize: 22,
    fontWeight: "700",
  },
  durationInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    backgroundColor: theme.backgroundElement,
  },
  durationInput: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: 4,
    fontSize: 16,
  },
  maxDigits: {
    color: "#8193C5",
    fontSize: 12,
    fontWeight: "500",
  },
  taskNamesTitle: {
    color: theme.text,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
  },
  taskFields: {
    gap: 10,
  },
  taskFieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  taskNumber: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
    backgroundColor: theme.accentSoft,
  },
  taskNumberText: {
    color: theme.accent,
    fontSize: 15,
    fontWeight: "700",
  },
  taskInput: {
    flex: 1,
    minHeight: 48,
    backgroundColor: theme.backgroundElement,
  },
  addTaskButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    backgroundColor: theme.backgroundElement,
    borderWidth: 1,
    borderColor: theme.border,
  },
  addTaskPlus: {
    color: theme.accent,
    fontSize: 28,
    lineHeight: 32,
  },
  addTaskLabel: {
    color: theme.accent,
    fontSize: 14,
    fontWeight: "700",
  },
  primaryButton: {
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: theme.accent,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: Spacing.four,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },
  modalCard: {
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  modalTitle: {
    fontSize: 24,
    lineHeight: 30,
  },
  modalMessage: {
    userSelect: "text",
  },
  errorText: {
    color: theme.danger,
  },
  disabledButton: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.65,
  },
  pressedButton: {
    opacity: 0.85,
  },
  });
}
