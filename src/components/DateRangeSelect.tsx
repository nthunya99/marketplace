"use client";

const PRESETS = [
  { value: "today", label: "Today" },
  { value: "last7days", label: "Last 7 days" },
  { value: "last30days", label: "Last 30 days" },
  { value: "thisMonth", label: "This month" },
  { value: "previousMonth", label: "Previous month" },
];

export default function DateRangeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select className="input w-44" value={value} onChange={(e) => onChange(e.target.value)}>
      {PRESETS.map((p) => (
        <option key={p.value} value={p.value}>
          {p.label}
        </option>
      ))}
    </select>
  );
}
