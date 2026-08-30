export type LifeArea =
  | "family"
  | "home"
  | "self"
  | "learning"
  | "career"
  | "money"
  | "documents"
  | "future";
export type TaskStatus = "todo" | "doing" | "done" | "cancelled";

export interface Task {
  id: string;
  title: string;
  area: LifeArea;
  status: TaskStatus;
  dueAt?: string;
  essential?: boolean;
}

export interface Routine {
  id: string;
  title: string;
  ideal: string;
  minimum: string;
  completed?: "full" | "minimum" | "skipped";
}

export const getTodayEssentials = (tasks: Task[]) =>
  tasks
    .filter((task) => task.essential && task.status !== "cancelled")
    .slice(0, 7);

export const getNextUp = (tasks: Task[], now = new Date()) =>
  tasks
    .filter(
      (task) =>
        task.dueAt && new Date(task.dueAt) >= now && task.status !== "done",
    )
    .sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime())
    .slice(0, 6);

export const selectMinimumRoutine = (routine: Routine, energy: number) =>
  energy <= 2 ? routine.minimum : routine.ideal;

export const getEssentialsStatus = (tasks: Task[]) => {
  const essentials = getTodayEssentials(tasks);
  return {
    done: essentials.filter((task) => task.status === "done").length,
    total: essentials.length,
  };
};

export const getCareerTransitionProgress = (
  milestones: { complete: boolean }[],
) => ({
  complete: milestones.filter((item) => item.complete).length,
  total: milestones.length,
});
