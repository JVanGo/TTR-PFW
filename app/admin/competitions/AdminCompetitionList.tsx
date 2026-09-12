"use client";

import { useState } from "react";
import { CompetitionForm } from "./CompetitionForm";
import { DeleteButton } from "./DeleteButton";

export interface AdminCompetitionRow {
  id: string;
  name: string;
  max_age_category: string | null;
  fixed_team_count: number | null;
  team_size: number;
  small_last_team_counts: Record<string, number>;
}

interface Props {
  competitions: AdminCompetitionRow[];
}

export function AdminCompetitionList({ competitions }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[700px] text-sm">
        <thead className="bg-muted/60 text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Name</th>
            <th className="px-3 py-2 text-right font-medium">Team size</th>
            <th className="px-3 py-2 text-right font-medium">Fixed teams</th>
            <th className="px-3 py-2 text-left font-medium">Max age category</th>
            <th className="px-3 py-2 text-left font-medium">Smaller last team</th>
            <th className="px-3 py-2 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {competitions.map((c) => (
            <RowOrEditor
              key={c.id}
              competition={c}
              editing={editingId === c.id}
              onEdit={() => setEditingId(c.id)}
              onCancel={() => setEditingId(null)}
            />
          ))}
          {competitions.length === 0 && (
            <tr>
              <td colSpan={6} className="text-muted-foreground px-3 py-8 text-center">
                No competitions yet — add one above.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

interface RowProps {
  competition: AdminCompetitionRow;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
}

function RowOrEditor({ competition, editing, onEdit, onCancel }: RowProps) {
  if (editing) {
    return (
      <tr>
        <td colSpan={6} className="bg-muted/30 border-t px-3 py-4">
          <CompetitionForm mode="edit" initial={competition} />
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
      <td className="px-3 py-2">{competition.name}</td>
      <td className="px-3 py-2 text-right tabular-nums">{competition.team_size}</td>
      <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
        {competition.fixed_team_count ?? "club chooses"}
      </td>
      <td className="text-muted-foreground px-3 py-2">
        {competition.max_age_category ? `${competition.max_age_category} or younger` : "—"}
      </td>
      <td className="text-muted-foreground px-3 py-2">
        {Object.keys(competition.small_last_team_counts).length > 0
          ? Object.entries(competition.small_last_team_counts)
              .map(([club, count]) => (count > 1 ? `${club} (${count})` : club))
              .join(", ")
          : "—"}
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onEdit} className="text-sm hover:underline">
            Edit
          </button>
          <DeleteButton id={competition.id} name={competition.name} />
        </div>
      </td>
    </tr>
  );
}
