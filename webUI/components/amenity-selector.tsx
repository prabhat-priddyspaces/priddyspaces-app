"use client";

interface AmenityOption {
  id: number;
  name: string;
}

interface AmenitySelectorProps {
  amenities: AmenityOption[];
  selectedIds: number[];
  onChange: (nextIds: number[]) => void;
  disabled?: boolean;
  emptyMessage?: string;
}

export function AmenitySelector({
  amenities,
  selectedIds,
  onChange,
  disabled = false,
  emptyMessage = "No amenities available for this organization yet.",
}: AmenitySelectorProps) {
  function toggleAmenity(id: number) {
    if (disabled) return;
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((value) => value !== id));
      return;
    }
    onChange([...selectedIds, id]);
  }

  if (amenities.length === 0) {
    return <div className="text-sm text-textMuted">{emptyMessage}</div>;
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {amenities.map((amenity) => {
        const checked = selectedIds.includes(amenity.id);
        return (
          <label
            key={amenity.id}
            className="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2 text-sm text-textPrimary"
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={() => toggleAmenity(amenity.id)}
            />
            <span>{amenity.name}</span>
          </label>
        );
      })}
    </div>
  );
}
