"use client";

import { useTransition } from "react";
import { deletePlayer } from "./actions";

interface Props {
  id: string;
  name: string;
}

export function DeleteButton({ id, name }: Props) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Delete ${name}? This removes the player and all their matches.`)) return;
        start(async () => {
          await deletePlayer(id);
        });
      }}
      className="text-destructive text-sm hover:underline disabled:opacity-60"
    >
      {pending ? "Removing…" : "Remove"}
    </button>
  );
}
