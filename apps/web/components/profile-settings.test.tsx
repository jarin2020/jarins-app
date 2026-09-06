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
        pronouns: "she/her",
        headline: "German B2, then marketing",
        phone: "+49 151 0000000",
        birthday: "1992-04-17",
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

const edit = (section: string) =>
  fireEvent.click(screen.getByRole("button", { name: `Edit ${section}` }));
const saveSection = () =>
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

describe("ProfileSettings", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.status = "signed-in";
    mocks.avatarUrl = null;
    [
      mocks.updateProfile,
      mocks.uploadAvatar,
      mocks.removeAvatar,
      mocks.updatePassword,
      mocks.signOut,
    ].forEach((fn) => fn.mockReset());
    mocks.updateProfile.mockResolvedValue(undefined);
    mocks.uploadAvatar.mockResolvedValue(undefined);
  });
  afterEach(() => cleanup());

  const settled = () =>
    waitFor(() =>
      expect(screen.getByRole("heading", { name: /Faria Jarin/ })).toBeTruthy(),
    );

  // ---- the default view ----

  it("opens on a profile to read, not a form to fill in", async () => {
    render(<ProfileSettings />);
    await settled();

    expect(screen.getByText("she/her")).toBeTruthy();
    expect(screen.getByText("German B2, then marketing")).toBeTruthy();
    expect(screen.getByText("+49 151 0000000")).toBeTruthy();
    expect(screen.getByText("April 17, 1992")).toBeTruthy();
    expect(screen.getByRole("link", { name: "LinkedIn" })).toBeTruthy();
    // Nothing is editable until asked for.
    expect(screen.queryByLabelText("Display name")).toBeNull();
    expect(screen.queryByLabelText("Phone")).toBeNull();
  });

  it("says a field is unset rather than leaving a blank space", async () => {
    render(<ProfileSettings />);
    await settled();

    const emergency = screen
      .getByRole("heading", { name: "Emergency contact" })
      .closest("section") as HTMLElement;
    expect(within(emergency).getAllByText("Not set").length).toBe(3);
  });

  it("labels each section with who can see it", async () => {
    render(<ProfileSettings />);
    await settled();

    const identity = screen
      .getByRole("heading", { name: "Identity" })
      .closest("section") as HTMLElement;
    expect(within(identity).getByText("Household")).toBeTruthy();

    const preferences = screen
      .getByRole("heading", { name: "Preferences" })
      .closest("section") as HTMLElement;
    expect(within(preferences).getByText("Only you")).toBeTruthy();
  });

  // ---- editing one section at a time ----

  it("opens only the section asked for", async () => {
    render(<ProfileSettings />);
    await settled();
    edit("identity");

    expect(screen.getByLabelText("Display name")).toBeTruthy();
    // The contact fields stay closed.
    expect(screen.queryByLabelText("Where you are")).toBeNull();
    // And cannot be opened while another section is open.
    expect(
      screen
        .getByRole("button", { name: "Edit contact" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("saves the section and returns to the profile", async () => {
    render(<ProfileSettings />);
    await settled();
    edit("identity");

    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Faria" },
    });
    saveSection();

    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalled());
    expect(mocks.updateProfile.mock.calls[0][0].displayName).toBe("Faria");
    await waitFor(() =>
      expect(screen.queryByLabelText("Display name")).toBeNull(),
    );
  });

  it("throws away an edit when cancelled", async () => {
    render(<ProfileSettings />);
    await settled();
    edit("identity");

    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Someone else" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Faria Jarin/ })).toBeTruthy(),
    );
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  // ---- links ----

  it("recognises the network from a pasted address", async () => {
    render(<ProfileSettings />);
    await settled();
    edit("profiles and links");

    fireEvent.click(screen.getByRole("button", { name: /Add link/ }));
    fireEvent.change(screen.getByLabelText("Address for link 2"), {
      target: { value: "xing.com/profile/Faria" },
    });

    expect(fieldValue("Network for link 2")).toBe("xing");
  });

  it("stops guessing the network once it has been chosen by hand", async () => {
    render(<ProfileSettings />);
    await settled();
    edit("profiles and links");

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
    edit("profiles and links");

    fireEvent.change(screen.getByLabelText("Address for link 1"), {
      target: { value: "not a url" },
    });
    saveSection();

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
    edit("profiles and links");

    fireEvent.click(screen.getByRole("button", { name: /Add link/ }));
    saveSection();

    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalled());
    expect(mocks.updateProfile.mock.calls[0][0].links).toEqual([
      { platform: "linkedin", url: "https://www.linkedin.com/in/faria" },
    ]);
  });

  it("normalises what was typed before saving it", async () => {
    render(<ProfileSettings />);
    await settled();
    edit("profiles and links");

    fireEvent.change(screen.getByLabelText("Address for link 1"), {
      target: { value: "linkedin.com/in/faria" },
    });
    fireEvent.change(screen.getByLabelText("Label for link 1"), {
      target: { value: "  Work  " },
    });
    saveSection();

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
    edit("profiles and links");

    fireEvent.click(screen.getByRole("button", { name: "Remove link 1" }));
    saveSection();

    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalled());
    expect(mocks.updateProfile.mock.calls[0][0].links).toEqual([]);
  });

  // ---- validation, sharing, photo ----

  it("rejects a birthday in the future before it reaches the column", async () => {
    render(<ProfileSettings />);
    await settled();
    edit("contact");

    fireEvent.change(screen.getByLabelText("Birthday"), {
      target: { value: "2099-01-01" },
    });
    saveSection();

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe(
        "A birthday cannot be in the future.",
      ),
    );
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it("applies the sharing switch immediately, without an edit step", async () => {
    render(<ProfileSettings />);
    await settled();

    fireEvent.click(screen.getByRole("checkbox"));

    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalled());
    expect(mocks.updateProfile.mock.calls[0][0].shareContactWithHousehold).toBe(
      false,
    );
  });

  it("also writes the name, timezone and locale this device reads offline", async () => {
    render(<ProfileSettings />);
    await settled();
    edit("identity");

    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Faria" },
    });
    saveSection();

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
    edit("identity");

    fireEvent.change(document.querySelector('input[type="file"]')!, {
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
    edit("identity");
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    unmount();
    cleanup();

    mocks.avatarUrl = "https://example.test/photo.webp";
    render(<ProfileSettings />);
    await settled();
    edit("identity");
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(mocks.removeAvatar).toHaveBeenCalled());
  });

  it("keeps unsaved input when the provider hands it an equal profile again", async () => {
    // The mocked provider rebuilds the profile object on every render, which is
    // what the real one did until this was keyed on content instead of identity.
    const { rerender } = render(<ProfileSettings />);
    await settled();
    edit("identity");

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
    expect(
      screen.queryByRole("button", { name: "Edit profiles and links" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit contact" })).toBeNull();
    // Identity and preferences still work on one device.
    expect(screen.getByRole("button", { name: "Edit identity" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Edit preferences" }),
    ).toBeTruthy();
  });
});
