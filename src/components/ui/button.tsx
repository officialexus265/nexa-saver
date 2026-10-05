import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

export const buttonVariants = cva(
  "tap inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-[opacity,background-color,color,border-color,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 min-h-11 px-4 text-sm",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-fg hover:opacity-90",
        secondary: "bg-surface-2 text-fg border border-border hover:bg-surface",
        ghost: "text-fg hover:bg-surface-2",
        danger: "bg-danger text-fg hover:opacity-90",
        outline: "border border-border bg-transparent text-fg hover:bg-surface-2",
      },
      size: {
        md: "min-h-11 px-4",
        sm: "min-h-9 px-3 text-sm",
        lg: "min-h-12 px-5 text-base",
        icon: "size-11 p-0",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  type = "button",
  loading,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    loading?: boolean;
  }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {loading ? <Spinner size="sm" className="border-t-current" /> : null}
      {children}
    </button>
  );
}
