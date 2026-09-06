import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileSettings } from "./profile-settings";
import { buildAccountProfile } from "@/lib/account-profile";

const mocks = vi.hoisted(() => ({
  updateProfile: vi.fn(),
  uploadAvatar: vi.fn(),
  removeAvatar: vi.fn(),
  updatePassword: vi.fn(),
  signOut: vi.fn(),
  avatarUrl: null as string | null,
  status: "signed-in" as "signed-in" | "demo",
}));

vi.mock("./auth-provider", () => ({
  useAuth: () => ({
    profile: buildAccountProfile(
      { email: "faria@example.com", user_metadata: {} },
      {
        display_name: "Faria Jarin",
        timezone: "Europe/Berlin",
        locale: "de",
        accent_color: "terracotta",
        phone: "+49 151 0000000",
        links: [
          { platform: "linkedin", url: "https://www.linkedin.com/in/faria" },
        ],
      },
    ),
    status: mocks.status,
    signOut: mocks.signOut,
    updateProfile: mocks.updateProfile,
    updatePassword: mocks.updatePassword,
    avatarUrl: mocks.avatarUrl,
    uploadAvatar: mocks.uploadAvatar,
    removeAvatar: mocks.removeAvatar,
  }),
}));

/**
 * Reads a field's value by its label. Structural rather than cast to a concrete
 * element type: `HTMLSelectElement` is not assignable to `HTMLElement` in this
 * TypeScript DOM lib, because their `remove()` overloads disagree.
 */
const fieldValue = (label: string) =>
  (screen.getByLabelText(label) as HTMLElement & { value: string }).value;

describe("ProfileSettings", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.status = "signed-in";
    mocks.avatarUrl = null;
    Object.values(mocks).forEach(
      (value) =>
        typeof value === "function" &&
        (value as ReturnType<typeof vi.fn>).mockReset?.(),
    );
    mocks.updateProfile.mockResolvedValue(undefined);
    mocks.uploadAvatar.mockResolvedValue(undefined);
  });
  afterEach(() => cleanup());

  const settled = () =>
    waitFor(() => expect(fieldValue("Display name")).toBe("Faria Jarin"));

  it("loads the stored profile into the form", async () => {
    render(<ProfileSettings />);
    await settled();

    // "Phone" appears twice on this form, and is only unambiguous because the
    // emergency fields are grouped in a fieldset with a legend.
    const emergency = within(
      screen.getByRole("group", { name: /Emergency contact/ }),
    );
    expect(
      (emergency.getByLabelText("Phone") as HTMLElement & { value: string })
        .value,
    ).toBe("");
    expect(
      screen
        .getAllByLabelText("Phone")
        .map((field) => (field as HTMLElement & { value: string }).value),
    ).toContain("+49 151 0000000");
    expect(fieldValue("Address for link 1")).toBe(
      "https://www.linkedin.com/in/faria",
    );
    expect(fieldValue("Network for link 1")).toBe("linkedin");
  });

  it("recognises the network from a pasted address", async () => {
    render(<ProfileSettings />);
    await settled();

    fireEvent.click(screen.getByRole("button", { name: /Add link/ }));
    fireEvent.change(screen.getByLabelText("Address for link 2"), {
      target: { value: "xing.com/profile/Faria" },
    });

    expect(fieldValue("Network for link 2")).toBe("xing");
  });

  it("stops guessing the network once it has been chosen by hand", async () => {
    render(<ProfileSettings />);
    await settled();

    fireEvent.click(screen.getByRole("button", { name: /Add link/ }));
    fireEvent.change(screen.getByLabelText("Network for link 2"), {
      target: { value: "medium" },
    });
    fireEvent.change(screen.getByLabelText("Address for link 2"), {
      target: { value: "https://faria.example/writing" },
    });

    expect(fieldValue("Network for link 2")).toBe("medium");
  });

  it("refuses to save an address it cannot resolve, naming which one", async () => {
    render(<ProfileSettings />);
    await settled();

    fireEvent.change(screen.getByLabelText("Address for link 1"), {
      target: { value: "not a url" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe(
        "Link 1 is not a web address.",
      ),
    );
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it("drops a row left empty rather than treating it as a mistake", async () => {
    render(<ProfileSettings />);
    await settled();

    fireEvent.click(screen.getByRole("button", { name: /Add link/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalled());
    expect(mocks.updateProfile.mock.calls[0][0].links).toEqual([
      { platform: "linkedin", url: "https://www.linkedin.com/in/faria" },
    ]);
  });

  it("normalises what was typed before saving it", async () => {
    render(<ProfileSettings />);
    await settled();

    fireEvent.change(screen.getByLabelText("Address for link 1"), {
      target: { value: "linkedin.com/in/faria" },
    });
    fireEvent.change(screen.getByLabelText("Label for link 1"), {
      target: { value: "  Work  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalled());
    expect(mocks.updateProfile.mock.calls[0][0].links).toEqual([
      {
        platform: "linkedin",
        url: "https://linkedin.com/in/faria",
        label: "Work",
      },
    ]);
  });

  it("removes a link", async () => {
    render(<ProfileSettings />);
    await settled();

    fireEvent.click(screen.getByRole("button", { name: "Remove link 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalled());
    expect(mocks.updateProfile.mock.calls[0][0].links).toEqual([]);
  });

  it("rejects a birthday in the future before it reaches the column", async () => {
    render(<ProfileSettings />);
    await settled();

    fireEvent.change(screen.getByLabelText("Birthday"), {
      target: { value: "2099-01-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe(
        "A birthday cannot be in the future.",
      ),
    );
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it("also writes the name, timezone and locale this device reads offline", async () => {
    render(<ProfileSettings />);
    await settled();

    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Faria" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalled());
    expect(
      JSON.parse(localStorage.getItem("jarins-preferences-v1") ?? "{}"),
    ).toMatchObject({ name: "Faria", timezone: "Europe/Berlin", locale: "de" });
  });

  it("shows the storage error from a rejected photo", async () => {
    mocks.uploadAvatar.mockRejectedValue(
      new Error("Use a JPEG, PNG or WebP image."),
    );
    render(<ProfileSettings />);
    await settled();

    const picker = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(picker, {
      target: { files: [new File(["x"], "note.txt", { type: "text/plain" })] },
    });

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe(
        "Use a JPEG, PNG or WebP image.",
      ),
    );
  });

  it("offers Remove only once there is a photo to remove", async () => {
    const { unmount } = render(<ProfileSettings />);
    await settled();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    unmount();
    cleanup();

    mocks.avatarUrl = "https://example.test/photo.webp";
    render(<ProfileSettings />);
    await settled();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(mocks.removeAvatar).toHaveBeenCalled());
  });

  it("keeps unsaved input when the provider hands it an equal profile again", async () => {
    // The mocked provider rebuilds the profile object on every render, which is
    // what the real one did until this was keyed on content instead of identity.
    // Re-rendering must not throw away what is half-typed.
    const { rerender } = render(<ProfileSettings />);
    await settled();

    fireEvent.change(screen.getByLabelText("Headline"), {
      target: { value: "Half a thou" },
    });
    rerender(<ProfileSettings />);

    expect(fieldValue("Headline")).toBe("Half a thou");
  });

  it("does not offer a photo or links without an account", async () => {
    mocks.status = "demo";
    render(<ProfileSettings />);

    await waitFor(() =>
      expect(screen.getByText(/need an account/)).toBeTruthy(),
    );
    expect(screen.queryByRole("button", { name: /Add link/ })).toBeNull();
    expect(screen.queryByLabelText("Phone")).toBeNull();
    expect(
      screen.queryByRole("group", { name: /Emergency contact/ }),
    ).toBeNull();
    // The three that do work on one device are still editable.
    expect(screen.getByLabelText("Display name")).toBeTruthy();
    expect(screen.getByLabelText("Timezone")).toBeTruthy();
  });
});
