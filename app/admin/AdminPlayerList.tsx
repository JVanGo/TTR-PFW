"use client";

import { useMemo, useState } from "react";
import { PlayerForm } from "./PlayerForm";
import { DeleteButton } from "./DeleteButton";
import { formatPfw } from "@/lib/format";

export interface AdminPlayerRow {
  id: string;
  name: string;
  class: string;
  pfw: number;
  club: string | null;
  is_active: boolean;
  classement_points: number | null;
  age_category: string | null;
  starting_dtr: number | null;
}

interface Props {
  players: AdminPlayerRow[];
}

export function AdminPlayerList({ players }: Props) {
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return players;
    return players.filter((p) => p.name.toLowerCase().includes(needle));
  }, [players, search]);

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        placeholder="Search by name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="border-input bg-background rounded-md border px-3 py-2 text-sm"
      />
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[700px] text-sm">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Name</th>
              <th className="px-3 py-2 text-left font-medium">Class</th>
              <th className="px-3 py-2 text-right font-medium">PFW</th>
              <th className="px-3 py-2 text-left font-medium">Club</th>
              <th className="px-3 py-2 text-left font-medium">Active</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <RowOrEditor
                key={p.id}
                player={p}
                editing={editingId === p.id}
                onEdit={() => setEditingId(p.id)}
                onCancel={() => setEditingId(null)}
              />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="text-muted-foreground px-3 py-8 text-center">
                  No players match the search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface RowProps {
  player: AdminPlayerRow;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
}

function RowOrEditor({ player, editing, onEdit, onCancel }: RowProps) {
  if (editing) {
    return (
      <tr>
        <td colSpan={6} className="bg-muted/30 border-t px-3 py-4">
          <PlayerForm mode="edit" initial={player} />
          <button
            type="button"
            onClick={onCancel}
            className="text-muted-foreground mt-2 text-sm hover:underline"
          >
            Close
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t">
      <td className="px-3 py-2">{player.name}</td>
      <td className="px-3 py-2">{player.class}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatPfw(player.pfw)}</td>
      <td className="text-muted-foreground px-3 py-2">{player.club ?? "—"}</td>
      <td className="px-3 py-2">{player.is_active ? "Yes" : "No"}</td>
      <td className="px-3 py-2 text-right">
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onEdit} className="text-sm hover:underline">
            Edit
          </button>
          <DeleteButton id={player.id} name={player.name} />
        </div>
      </td>
    </tr>
  );
}
