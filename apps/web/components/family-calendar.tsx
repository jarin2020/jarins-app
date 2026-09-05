"use client";

import Link from "next/link";
import {
  CalendarPlus,
  Cloud,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  EyeOff,
  MapPin,
  Pencil,
  Plus,
  Save,
  Trash2,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import {
  familyMemberColors,
  type FamilyCalendarEvent,
  type FamilyMember,
  type FamilyMemberColor,
  useFamilyCalendar,
} from "@/lib/family-calendar";
import { useClientNow } from "@/lib/use-client-now";
import type { CalendarEvent } from "@/lib/calendar";

type SystemCalendarEvent = {
  id: string;
  title: string;
  date: string;
  kind: string;
  href: string;
};

const scheduleStart = 7;
const scheduleEnd = 22;
const hourHeight = 54;
const hours = Array.from(
  { length: scheduleEnd - scheduleStart },
  (_, index) => scheduleStart + index,
);

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFromKey(value: string) {
  return new Date(`${value}T12:00:00`);
}

function shiftDate(value: string, amount: number) {
  const next = dateFromKey(value);
  next.setDate(next.getDate() + amount);
  return dateKey(next);
}

function minutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function eventPosition(startTime: string, endTime: string) {
  const start = Math.max(minutes(startTime), scheduleStart * 60);
  const end = Math.min(minutes(endTime), scheduleEnd * 60);
  return {
    top: ((start - scheduleStart * 60) / 60) * hourHeight + 5,
    height: Math.max(((end - start) / 60) * hourHeight - 8, 38),
  };
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "J"
  );
}

function MemberEditor({
  member,
  onSave,
  onRemove,
  onToggle,
}: {
  member: FamilyMember;
  onSave: (changes: {
    name: string;
    relationship: string;
    color: FamilyMemberColor;
  }) => void;
  onRemove: () => void;
  onToggle: () => void;
}) {
  const [name, setName] = useState(member.name);
  const [relationship, setRelationship] = useState(member.relationship);
  const [color, setColor] = useState(member.color);
  return (
    <form
      className="family-member-editor"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) onSave({ name, relationship, color });
      }}
    >
      <span className={`family-avatar ${color}`}>{initials(name)}</span>
      <label>
        Name
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          required
        />
      </label>
      <label>
        Relationship
        <input
          value={relationship}
          onChange={(event) => setRelationship(event.target.value)}
          maxLength={60}
          placeholder="Parent, child…"
        />
      </label>
      <label>
        Colour
        <select
          value={color}
          onChange={(event) =>
            setColor(event.target.value as FamilyMemberColor)
          }
        >
          {familyMemberColors.map((item) => (
            <option value={item} key={item}>
              {item[0].toUpperCase() + item.slice(1)}
            </option>
          ))}
        </select>
      </label>
      <div className="family-member-actions">
        <button
          className="icon-button"
          type="submit"
          aria-label={`Save ${name}`}
        >
          <Save size={15} />
        </button>
        <button
          className="icon-button"
          type="button"
          onClick={onToggle}
          aria-label={`${member.visible ? "Hide" : "Show"} ${member.name}`}
        >
          {member.visible ? <Eye size={15} /> : <EyeOff size={15} />}
        </button>
        {!member.isOwner && (
          <button
            className="icon-button danger"
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${member.name}`}
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </form>
  );
}

export function FamilyCalendar({
  ownerId,
  currentUserId,
  ownerName,
  systemEvents,
  externalEvents,
  householdMembers = [],
}: {
  ownerId: string;
  currentUserId: string;
  ownerName: string;
  systemEvents: SystemCalendarEvent[];
  externalEvents: CalendarEvent[];
  householdMembers?: { id: string; name: string }[];
}) {
  const {
    members,
    events,
    addMember,
    updateMember,
    removeMember,
    addEvent,
    updateEvent,
    removeEvent,
  } = useFamilyCalendar(ownerId, ownerName);
  const now = useClientNow();
  const today = now ? dateKey(now) : "1970-01-01";
  const [selectedDateOverride, setSelectedDate] = useState<string | null>(null);
  const selectedDate = selectedDateOverride ?? today;
  const [showEventForm, setShowEventForm] = useState(false);
  const [showMemberManager, setShowMemberManager] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string>();
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [sharedWithEveryone, setSharedWithEveryone] = useState(false);
  const [formError, setFormError] = useState("");
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberRelationship, setNewMemberRelationship] = useState("");
  const [newMemberColor, setNewMemberColor] =
    useState<FamilyMemberColor>("coral");

  const ownerMember = members.find((member) => member.isOwner);
  const externalMembers = useMemo<FamilyMember[]>(() => {
    const people = new Map(
      householdMembers
        .filter((member) => member.id !== currentUserId)
        .map((member) => [member.id, member.name]),
    );
    externalEvents.forEach((event) => {
      if (event.ownerUserId !== currentUserId)
        people.set(event.ownerUserId, event.ownerName);
    });
    return [...people].map(([id, name], index) => ({
      id: `external:${id}`,
      name,
      relationship: "Connected family account",
      color: familyMemberColors[(index + 2) % familyMemberColors.length],
      visible: true,
      isOwner: false,
      createdAt: "",
      updatedAt: "",
    }));
  }, [currentUserId, externalEvents, householdMembers]);
  const allMembers = [...members, ...externalMembers];
  const visibleMembers = allMembers.filter((member) => member.visible);
  const dayEvents = useMemo(
    () => events.filter((event) => event.date === selectedDate),
    [events, selectedDate],
  );
  const daySystemEvents = systemEvents.filter(
    (event) => event.date === selectedDate,
  );
  const dayExternalEvents = externalEvents.filter(
    (event) =>
      (event.allDay
        ? event.startsAt.slice(0, 10)
        : dateKey(new Date(event.startsAt))) === selectedDate,
  );
  const formattedDate = new Intl.DateTimeFormat("en", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(dateFromKey(selectedDate));

  const resetEventForm = () => {
    setEditingEventId(undefined);
    setTitle("");
    setStartTime("09:00");
    setEndTime("10:00");
    setLocation("");
    setNotes("");
    setSelectedMemberIds([]);
    setSharedWithEveryone(false);
    setFormError("");
    setShowEventForm(false);
  };

  const editEvent = (event: FamilyCalendarEvent) => {
    setEditingEventId(event.id);
    setSelectedDate(event.date);
    setTitle(event.title);
    setStartTime(event.startTime);
    setEndTime(event.endTime);
    setLocation(event.location);
    setNotes(event.notes);
    setSelectedMemberIds(event.memberIds);
    setSharedWithEveryone(event.sharedWithEveryone);
    setFormError("");
    setShowEventForm(true);
  };

  const submitEvent = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (endTime <= startTime) {
      setFormError("End time must be after the start time.");
      return;
    }
    if (!sharedWithEveryone && !selectedMemberIds.length) {
      setFormError("Choose at least one family member.");
      return;
    }
    const input = {
      title,
      date: selectedDate,
      startTime,
      endTime,
      memberIds: sharedWithEveryone
        ? allMembers.map((member) => member.id)
        : selectedMemberIds,
      location,
      notes,
      sharedWithEveryone,
    };
    if (editingEventId) updateEvent(editingEventId, input);
    else addEvent(input);
    resetEventForm();
  };

  return (
    <section
      className="family-calendar"
      aria-labelledby="family-calendar-title"
    >
      <header className="family-calendar-header">
        <div>
          <span className="eyebrow">Shared household schedule</span>
          <h2 id="family-calendar-title">Family calendar</h2>
          <p>
            One clear column per person, with shared plans visible to everyone.
          </p>
        </div>
        <div className="family-calendar-actions">
          <button
            className="button secondary small"
            type="button"
            onClick={() => setShowMemberManager((current) => !current)}
            aria-expanded={showMemberManager}
          >
            <UsersRound size={15} /> Manage family
          </button>
          <button
            className="button primary small"
            type="button"
            onClick={() => {
              resetEventForm();
              setSelectedMemberIds(
                visibleMembers[0] ? [visibleMembers[0].id] : [],
              );
              setShowEventForm(true);
            }}
          >
            <CalendarPlus size={15} /> Add event
          </button>
        </div>
      </header>

      {showMemberManager && (
        <section className="family-manager" aria-label="Manage family members">
          <div className="family-manager-heading">
            <div>
              <span className="kicker">Calendar columns</span>
              <h3>Family members</h3>
              <p>
                Rename people, choose a colour, or hide a column temporarily.
              </p>
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={() => setShowMemberManager(false)}
              aria-label="Close family manager"
            >
              <X size={17} />
            </button>
          </div>
          <div className="family-member-list">
            {members.map((member) => (
              <MemberEditor
                key={member.id}
                member={member}
                onSave={(changes) => updateMember(member.id, changes)}
                onToggle={() =>
                  updateMember(member.id, { visible: !member.visible })
                }
                onRemove={() => removeMember(member.id)}
              />
            ))}
          </div>
          <form
            className="family-member-add"
            onSubmit={(event) => {
              event.preventDefault();
              if (!newMemberName.trim()) return;
              addMember({
                name: newMemberName,
                relationship: newMemberRelationship,
                color: newMemberColor,
              });
              setNewMemberName("");
              setNewMemberRelationship("");
            }}
          >
            <UserPlus size={18} />
            <label>
              Name
              <input
                value={newMemberName}
                onChange={(event) => setNewMemberName(event.target.value)}
                placeholder="Family member"
                maxLength={80}
                required
              />
            </label>
            <label>
              Relationship
              <input
                value={newMemberRelationship}
                onChange={(event) =>
                  setNewMemberRelationship(event.target.value)
                }
                placeholder="Partner, child…"
                maxLength={60}
              />
            </label>
            <label>
              Colour
              <select
                value={newMemberColor}
                onChange={(event) =>
                  setNewMemberColor(event.target.value as FamilyMemberColor)
                }
              >
                {familyMemberColors.map((color) => (
                  <option value={color} key={color}>
                    {color[0].toUpperCase() + color.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <button className="button primary small" type="submit">
              <Plus size={15} /> Add member
            </button>
          </form>
        </section>
      )}

      {showEventForm && (
        <form className="family-event-form" onSubmit={submitEvent}>
          <div className="family-event-form-heading">
            <div>
              <span className="kicker">
                {editingEventId ? "Update the plan" : "New family event"}
              </span>
              <h3>{editingEventId ? "Edit event" : "Add to the calendar"}</h3>
            </div>
            <button
              className="icon-button"
              type="button"
              onClick={resetEventForm}
              aria-label="Close event form"
            >
              <X size={17} />
            </button>
          </div>
          <div className="family-event-fields">
            <label className="wide">
              Event name
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="School pickup, family dinner…"
                maxLength={160}
                required
              />
            </label>
            <label>
              Date
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                required
              />
            </label>
            <label>
              Starts
              <input
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                required
              />
            </label>
            <label>
              Ends
              <input
                type="time"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                required
              />
            </label>
            <label>
              Location
              <input
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="Optional"
                maxLength={160}
              />
            </label>
            <label className="wide">
              Note
              <input
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Anything the family should know"
                maxLength={1000}
              />
            </label>
          </div>
          <fieldset className="family-event-attendees">
            <legend>Who is involved?</legend>
            <label className="everyone">
              <input
                type="checkbox"
                checked={sharedWithEveryone}
                onChange={(event) =>
                  setSharedWithEveryone(event.target.checked)
                }
              />
              <UsersRound size={15} /> Everyone
            </label>
            {allMembers.map((member) => (
              <label key={member.id}>
                <input
                  type="checkbox"
                  checked={
                    sharedWithEveryone || selectedMemberIds.includes(member.id)
                  }
                  disabled={sharedWithEveryone}
                  onChange={() =>
                    setSelectedMemberIds((current) =>
                      current.includes(member.id)
                        ? current.filter((id) => id !== member.id)
                        : [...current, member.id],
                    )
                  }
                />
                <span className={`family-dot ${member.color}`} /> {member.name}
              </label>
            ))}
          </fieldset>
          {formError && <p className="family-event-error">{formError}</p>}
          <div className="family-event-form-actions">
            {editingEventId && (
              <button
                className="button secondary small danger"
                type="button"
                onClick={() => {
                  removeEvent(editingEventId);
                  resetEventForm();
                }}
              >
                <Trash2 size={15} /> Remove
              </button>
            )}
            <button className="button primary small" type="submit">
              <Save size={15} /> {editingEventId ? "Save changes" : "Add event"}
            </button>
          </div>
        </form>
      )}

      <div className="family-calendar-toolbar">
        <div className="family-date-nav">
          <button
            className="icon-button"
            type="button"
            onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}
            aria-label="Previous day"
          >
            <ChevronLeft size={17} />
          </button>
          <button
            className="button secondary small"
            type="button"
            onClick={() => setSelectedDate(today)}
          >
            Today
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={() => setSelectedDate(shiftDate(selectedDate, 1))}
            aria-label="Next day"
          >
            <ChevronRight size={17} />
          </button>
          <strong>{formattedDate}</strong>
        </div>
        <div className="family-visibility" aria-label="Visible family members">
          {allMembers.map((member) => (
            <button
              type="button"
              className={member.visible ? "active" : ""}
              key={member.id}
              onClick={() => {
                if (!member.id.startsWith("external:"))
                  updateMember(member.id, { visible: !member.visible });
              }}
              aria-pressed={member.visible}
              disabled={member.id.startsWith("external:")}
            >
              <span className={`family-dot ${member.color}`} /> {member.name}
            </button>
          ))}
        </div>
      </div>

      {visibleMembers.length ? (
        <div className="family-schedule-scroll">
          <div
            className="family-schedule"
            style={{
              gridTemplateColumns: `68px repeat(${visibleMembers.length}, minmax(190px, 1fr))`,
            }}
          >
            <div className="family-schedule-corner">
              <Clock3 size={14} />
            </div>
            {visibleMembers.map((member) => (
              <div className="family-column-header" key={member.id}>
                <span className={`family-avatar ${member.color}`}>
                  {initials(member.name)}
                </span>
                <div>
                  <strong>{member.name}</strong>
                  <small>{member.relationship || "Family"}</small>
                </div>
              </div>
            ))}
            <div className="family-time-rail">
              {hours.map((hour) => (
                <span key={hour}>{String(hour).padStart(2, "0")}:00</span>
              ))}
            </div>
            {visibleMembers.map((member) => (
              <div
                className="family-day-column"
                key={member.id}
                style={{ height: hours.length * hourHeight }}
              >
                {dayEvents
                  .filter(
                    (event) =>
                      event.sharedWithEveryone ||
                      event.memberIds.includes(member.id),
                  )
                  .map((event) => {
                    const position = eventPosition(
                      event.startTime,
                      event.endTime,
                    );
                    return (
                      <button
                        className={`family-schedule-event ${member.color}`}
                        type="button"
                        style={position}
                        key={`${event.id}-${member.id}`}
                        onClick={() => editEvent(event)}
                        aria-label={`Edit ${event.title}`}
                      >
                        <strong>{event.title}</strong>
                        <span>
                          {event.startTime}–{event.endTime}
                        </span>
                        {event.location && (
                          <small>
                            <MapPin size={10} /> {event.location}
                          </small>
                        )}
                        {event.sharedWithEveryone && (
                          <small>
                            <UsersRound size={10} /> Shared with everyone
                          </small>
                        )}
                        <Pencil size={11} className="family-event-edit-icon" />
                      </button>
                    );
                  })}
                {member.isOwner &&
                  daySystemEvents.map((event, index) => (
                    <Link
                      className="family-schedule-event system"
                      style={{ top: 5 + index * 48, height: 42 }}
                      href={event.href}
                      key={event.id}
                    >
                      <strong>{event.title}</strong>
                      <small>{event.kind} · Jarins</small>
                    </Link>
                  ))}
                {dayExternalEvents
                  .filter((event) =>
                    event.ownerUserId === currentUserId
                      ? member.id === ownerMember?.id
                      : member.id === `external:${event.ownerUserId}`,
                  )
                  .map((event, index) => {
                    const start = new Date(event.startsAt);
                    const end = new Date(event.endsAt);
                    const startTime = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
                    const endTime = `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
                    const position = event.allDay
                      ? {
                          top: 5 + (daySystemEvents.length + index) * 48,
                          height: 42,
                        }
                      : eventPosition(startTime, endTime);
                    return (
                      <div
                        className={`family-schedule-event external ${member.color}`}
                        style={position}
                        key={`external-${event.id}-${member.id}`}
                        title={`${event.sourceName} · ${event.ownerName}`}
                      >
                        <strong>{event.title}</strong>
                        <span>
                          {event.allDay ? "All day" : `${startTime}–${endTime}`}
                        </span>
                        <small>
                          <Cloud size={10} /> {event.sourceName}
                        </small>
                        {event.location && (
                          <small>
                            <MapPin size={10} /> {event.location}
                          </small>
                        )}
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="family-calendar-empty">
          <EyeOff size={23} />
          <strong>Every family column is hidden</strong>
          <p>Choose a person above to show their day again.</p>
        </div>
      )}

      <footer className="family-calendar-legend">
        <span>
          <UsersRound size={13} /> Shared events appear in every assigned column
        </span>
        <span>
          {dayEvents.length + dayExternalEvents.length} family events on this
          day
        </span>
      </footer>
    </section>
  );
}
