"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Message and digest only — never the stack, which can carry form values.
    console.error("[jarins] render failed", error.message, error.digest);
  }, [error]);

  return (
    <section className="empty-state">
      <h2>Something went wrong on this screen</h2>
      <p>
        Your saved information is untouched. Try again, and if it keeps
        happening, reload the page.
      </p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
