"use client";

import { useRef } from "react";

import { Input } from "@/components/ui/input";
import {
  PlaceDetails,
  useAddressAutocomplete,
} from "@/components/use-address-autocomplete";

export type { PlaceDetails } from "@/components/use-address-autocomplete";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSelect: (place: PlaceDetails) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function PlaceAutocomplete({ value, onChange, onSelect, id, placeholder, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { warning } = useAddressAutocomplete(inputRef, onSelect);

  return (
    <div className="space-y-1">
      <Input
        ref={inputRef}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Start typing an address…"}
        disabled={disabled}
        autoComplete="off"
      />
      {warning && <p className="text-xs text-textSecondary">{warning}</p>}
    </div>
  );
}
