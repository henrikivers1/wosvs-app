"use client";

// A PIN input: digits only, 6 to 12 of them, hidden like a password.
export function PinField({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password" | "off";
}) {
  return (
    <label>
      {label}
      <input
        type="password"
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, ""))}
        required
        minLength={6}
        maxLength={12}
        pattern="[0-9]{6,12}"
        autoComplete={autoComplete}
      />
    </label>
  );
}
