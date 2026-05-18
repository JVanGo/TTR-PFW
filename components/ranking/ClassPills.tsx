import Link from "next/link";
import { PLAYER_CLASSES } from "@/lib/conversions";

interface Props {
  selected: string;
  counts: Record<string, number>;
  total: number;
}

export function ClassPills({ selected, counts, total }: Props) {
  const entries: Array<{ label: string; href: string; count: number; active: boolean }> = [
    {
      label: "All",
      href: "/",
      count: total,
      active: selected === "All",
    },
    ...PLAYER_CLASSES.map((kl) => ({
      label: kl,
      href: `/?kl=${kl}`,
      count: counts[kl] ?? 0,
      active: selected === kl,
    })),
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {entries.map((p) => (
        <Link
          key={p.label}
          href={p.href}
          aria-current={p.active ? "page" : undefined}
          className={
            "rounded-full border px-3 py-1 text-sm transition-colors " +
            (p.active
              ? "border-foreground bg-foreground text-background"
              : "border-input hover:bg-accent hover:text-accent-foreground")
          }
        >
          <span className="font-medium">{p.label}</span>
          <span className="ml-1 tabular-nums opacity-70">({p.count.toLocaleString()})</span>
        </Link>
      ))}
    </div>
  );
}
