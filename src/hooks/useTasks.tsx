"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  createTask,
  loadTasks,
  parseCaptureText,
  saveTasks,
  type Task,
} from "@/lib/tasks";

interface TasksContextValue {
  tasks: Task[];
  addTasksFromText: (text: string) => void;
  moveToToday: (id: string) => void;
  toggleDone: (id: string) => void;
  removeTask: (id: string) => void;
}

const TasksContext = createContext<TasksContextValue | null>(null);

export function TasksProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setTasks(loadTasks());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveTasks(tasks);
  }, [tasks, hydrated]);

  function addTasksFromText(text: string) {
    const lines = parseCaptureText(text);
    if (lines.length === 0) return;
    setTasks((prev) => [...prev, ...lines.map(createTask)]);
  }

  function moveToToday(id: string) {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id ? { ...task, status: "today" as const } : task
      )
    );
  }

  function toggleDone(id: string) {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id ? { ...task, done: !task.done } : task
      )
    );
  }

  function removeTask(id: string) {
    setTasks((prev) => prev.filter((task) => task.id !== id));
  }

  return (
    <TasksContext.Provider
      value={{ tasks, addTasksFromText, moveToToday, toggleDone, removeTask }}
    >
      {children}
    </TasksContext.Provider>
  );
}

export function useTasks(): TasksContextValue {
  const context = useContext(TasksContext);
  if (!context) {
    throw new Error("useTasks must be used within a TasksProvider");
  }
  return context;
}
