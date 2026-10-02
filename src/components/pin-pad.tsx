import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"] as const;

export function PinPad({
  value,
  onChange,
  disabled,
  error,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  error?: boolean;
}) {
  function press(key: string) {
    if (disabled) return;
    if (key === "del") {
      onChange(value.slice(0, -1));
      return;
    }
    if (key && value.length < 4) onChange(value + key);
  }

  return (
    <div className="space-y-5">
      <div className={cn("flex justify-center gap-3", error && "shake")}>
        {Array.from({ length: 4 }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "size-3.5 rounded-full border border-border transition-[background-color,transform] duration-150",
              i < value.length ? "scale-110 bg-primary" : "bg-transparent",
            )}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((key, i) =>
          key === "" ? (
            <span key={i} />
          ) : (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => press(key)}
              className="tap grid h-14 place-items-center rounded-xl bg-surface-2 text-lg font-medium text-fg hover:bg-border"
            >
              {key === "del" ? <Delete className="size-5" /> : key}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
