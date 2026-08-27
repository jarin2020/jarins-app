import { describe, expect, it } from "vitest";
import { getEssentialsStatus, selectMinimumRoutine, type Task } from "./index";

describe("calm planning rules", () => {
  it("limits essentials to seven", () => {
    const tasks: Task[] = Array.from({ length: 9 }, (_, index) => ({ id: `${index}`, title: "Task", area: "home", status: "todo", essential: true }));
    expect(getEssentialsStatus(tasks).total).toBe(7);
  });

  it("selects the minimum routine on low-energy days", () => {
    expect(selectMinimumRoutine({ id: "1", title: "Morning", ideal: "30 minutes", minimum: "Water and dress" }, 2)).toBe("Water and dress");
  });
});
