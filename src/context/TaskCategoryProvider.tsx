import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";

export type TaskCategory = {
  id: string;
  title: string;
  tasks: string[];
};

type TaskCategoryContextValue = {
  categories: TaskCategory[];
  addCategory: (category: Omit<TaskCategory, "id">) => void;
};

const TaskCategoryContext = createContext<
  TaskCategoryContextValue | undefined
>(undefined);

export function TaskCategoryProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<TaskCategory[]>([]);

  const addCategory = (category: Omit<TaskCategory, "id">) => {
    setCategories((current) => [
      { ...category, id: `${Date.now()}` },
      ...current,
    ]);
  };

  return (
    <TaskCategoryContext.Provider value={{ categories, addCategory }}>
      {children}
    </TaskCategoryContext.Provider>
  );
}

export function useTaskCategories() {
  const context = useContext(TaskCategoryContext);

  if (!context) {
    throw new Error(
      "useTaskCategories must be used inside a TaskCategoryProvider",
    );
  }

  return context;
}
