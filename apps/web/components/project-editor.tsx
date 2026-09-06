"use client";

import { useEffect, useRef, useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import type { ProfileAccent } from "@/lib/account-profile";
import {
  projectAccents,
  projectDefaults,
  projectLimits,
  suggestMark,
  type ProjectIdentity,
} from "@/lib/projects";
import type { WorkspaceId } from "@/lib/records/schema";

/**
 * Renames the space you are in. One workspace at a time, because a household
 * and a career are two different things to name.
 */
export function ProjectEditor({
  open,
  workspace,
  project,
  onSave,
  onClose,
}: {
  open: boolean;
  workspace: WorkspaceId;
  project: ProjectIdentity;
  onSave: (next: ProjectIdentity) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  // Seeded once per mount. The caller keys this component on the workspace and
  // on `open`, so a cancelled edit is gone the next time it opens rather than
  // being reset by an effect that fights the person still typing.
  const [draft, setDraft] = useState(project);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      nameInput.current?.focus();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  // `cancel` and `close` do not bubble, so React's onCancel/onClose props never
  // fire for them. Listening on the element itself is what actually works.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const handleClose = () => close.current();
    element.addEventListener("close", handleClose);
    return () => element.removeEventListener("close", handleClose);
  }, []);

  const patch = <K extends keyof ProjectIdentity>(
    key: K,
    value: ProjectIdentity[K],
  ) => setDraft((current) => ({ ...current, [key]: value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim()) return nameInput.current?.focus();
    onSave(draft);
  };

  return (
    <dialog
      ref={dialog}
      className="modal-dialog"
      aria-labelledby="project-editor-title"
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
    >
      <div className="modal-card">
        <div className="modal-heading">
          <div>
            <span className="eyebrow">
              {workspace === "professional" ? "Professional" : "Personal"}{" "}
              workspace
            </span>
            <h2 id="project-editor-title">Name this space</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit}>
          <div className="project-preview" aria-hidden="true">
            <span className={`brand-mark accent-${draft.accent}`}>
              {draft.mark || projectDefaults[workspace].mark}
            </span>
            <span>
              <strong>{draft.name || projectDefaults[workspace].name}</strong>
              <small>{draft.tagline}</small>
            </span>
          </div>

          <label className="input-row">
            Name
            <input
              ref={nameInput}
              value={draft.name}
              maxLength={projectLimits.name}
              onChange={(event) => {
                const name = event.target.value;
                setDraft((current) => ({
                  ...current,
                  name,
                  // Follow the name until the mark is edited by hand, so the
                  // tile does not sit on someone else's initials.
                  mark:
                    current.mark === suggestMark(current.name, workspace) ||
                    current.mark === projectDefaults[workspace].mark
                      ? suggestMark(name, workspace)
                      : current.mark,
                }));
              }}
            />
          </label>

          <div className="input-grid">
            <label className="input-row">
              Tagline
              <input
                value={draft.tagline}
                maxLength={projectLimits.tagline}
                placeholder={projectDefaults[workspace].tagline}
                onChange={(event) => patch("tagline", event.target.value)}
              />
            </label>
            <label className="input-row">
              Mark
              <input
                value={draft.mark}
                maxLength={projectLimits.mark}
                placeholder={projectDefaults[workspace].mark}
                onChange={(event) => patch("mark", event.target.value)}
              />
              <small className="input-counter">
                One or two characters, or an emoji
              </small>
            </label>
          </div>

          <fieldset className="profile-accent">
            <legend>Colour</legend>
            <div>
              {projectAccents.map((accent) => (
                <label key={accent.id} className={`accent-${accent.id}`}>
                  <input
                    type="radio"
                    name="project-accent"
                    value={accent.id}
                    checked={draft.accent === accent.id}
                    onChange={() => patch("accent", accent.id as ProfileAccent)}
                  />
                  <span aria-hidden="true" />
                  {accent.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="form-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => setDraft(projectDefaults[workspace])}
            >
              <RotateCcw size={15} /> Reset
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={!draft.name.trim()}
            >
              <Check size={15} /> Save
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
