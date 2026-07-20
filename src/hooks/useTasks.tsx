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
  createTaskFromParsed,
  loadTasks,
  parseCaptureText,
  saveTasks,
  type ParsedTask,
  type Task,
} from "@/lib/tasks";

interface TasksContextValue {
  tasks: Task[];
  addTasksFromText: (text: string) => void;
  addParsedTasks: (parsed: ParsedTask[]) => void;
  moveToToday: (id: string) => void;
  toggleDone: (id: string) => void;
  removeTask: (id: string) => void;
}

const TasksContext = createContext<TasksContextValue | null>(null);

export function TasksProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Reading localStorage must happen post-mount so the first client render
    // matches the server's empty-array render and avoids a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  function addParsedTasks(parsed: ParsedTask[]) {
    const valid = parsed.filter((item) => item.text.trim().length > 0);
    if (valid.length === 0) return;
    setTasks((prev) => [...prev, ...valid.map(createTaskFromParsed)]);
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
      value={{
        tasks,
        addTasksFromText,
        addParsedTasks,
        moveToToday,
        toggleDone,
        removeTask,
      }}
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
