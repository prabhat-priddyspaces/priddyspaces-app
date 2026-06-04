import { CheckCircle2 } from "lucide-react";

export interface IncludedItemsProps {
  items: string[];
}

export function IncludedItems({ items }: IncludedItemsProps) {
  if (items.length === 0) return null;
  return (
    <section className="border-b border-line pb-8">
      <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-text">Included With Your Reservation</h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item} className="flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-text-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
