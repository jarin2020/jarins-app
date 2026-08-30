"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { createCloudRepository } from "./records/cloud-repository";
import { localRepository } from "./records/local-repository";
import type { RecordsRepository } from "./records/repository";
import type { LifeRecord, NewLifeRecord } from "./records/schema";

export type {
  LifeRecord,
  NewLifeRecord,
  RecordStatus,
  RecordModule,
} from "./records/schema";
export { moduleLabels, kindOptions } from "./records/schema";
export {
  readLifeRecords,
  replaceLifeRecords,
  parseBackup,
} from "./records/local-repository";

export function useLifeRecords() {
  const { supabase, householdId, status } = useAuth();

  const repository = useMemo<RecordsRepository>(
    () =>
      supabase && status === "signed-in"
        ? createCloudRepository(supabase, householdId)
        : localRepository,
    [supabase, status, householdId],
  );

  const [records, setRecords] = useState<LifeRecord[]>([]);
  const [error, setError] = useState<string>();
  // Which repository the records in state actually came from. Deriving `loading`
  // from this means switching stores (sign-in, sign-out) reports as loading
  // without a synchronous setState inside the effect.
  const [loadedFor, setLoadedFor] = useState<RecordsRepository>();
  const loading = status === "loading" || loadedFor !== repository;

  // Mutations need the records as they are now, not as they were when the
  // callback was created.
  const latest = useRef<LifeRecord[]>([]);
  useEffect(() => {
    latest.current = records;
  }, [records]);

  // State is only ever set from the promise callbacks, never synchronously in
  // the effect body — the store is an external system this subscribes to.
  const refresh = useCallback(
    () =>
      repository.list().then(
        (next) => {
          setRecords(next);
          setError(undefined);
          setLoadedFor(() => repository);
        },
        (cause: unknown) => {
          setError(
            cause instanceof Error
              ? cause.message
              : "Your items could not be loaded.",
          );
          setLoadedFor(() => repository);
        },
      ),
    [repository],
  );

  useEffect(() => {
    // Wait until we know whether there is a session, or the first paint would
    // read from the wrong store.
    if (status === "loading") return;
    void refresh();
    return repository.subscribe(() => void refresh());
  }, [repository, refresh, status]);

  /** Applies the change immediately, then rolls it back if the write fails. */
  const mutate = useCallback(
    async (
      apply: (current: LifeRecord[]) => LifeRecord[],
      commit: () => Promise<unknown>,
      failure: string,
    ) => {
      const rollback = latest.current;
      setRecords(apply(rollback));
      setError(undefined);
      try {
        await commit();
        await refresh();
      } catch (cause) {
        setRecords(rollback);
        setError(cause instanceof Error ? cause.message : failure);
      }
    },
    [refresh],
  );

  const add = useCallback(
    (input: NewLifeRecord) => {
      const now = new Date().toISOString();
      const pending: LifeRecord = {
        ...input,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
      };
      return mutate(
        (current) => [pending, ...current],
        () => repository.add(input),
        "That item could not be saved.",
      );
    },
    [mutate, repository],
  );

  const update = useCallback(
    (id: string, changes: Partial<LifeRecord>) =>
      mutate(
        (current) =>
          current.map((record) =>
            record.id === id
              ? { ...record, ...changes, updatedAt: new Date().toISOString() }
              : record,
          ),
        () => repository.update(id, changes),
        "That change could not be saved.",
      ),
    [mutate, repository],
  );

  const remove = useCallback(
    (id: string) =>
      mutate(
        (current) => current.filter((record) => record.id !== id),
        () => repository.remove(id),
        "That item could not be deleted.",
      ),
    [mutate, repository],
  );

  const replaceAll = useCallback(
    (next: LifeRecord[]) =>
      mutate(
        () => next,
        () => repository.replaceAll(next),
        "That backup could not be restored.",
      ),
    [mutate, repository],
  );

  return {
    records,
    loading,
    error,
    add,
    update,
    remove,
    replaceAll,
    mode: repository.mode,
  };
}
