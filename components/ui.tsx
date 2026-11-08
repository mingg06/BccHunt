"use client";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Player, Role } from "@/lib/types";

export const cn = (...c: ClassValue[]) => twMerge(clsx(c));

type Variant = "primary" | "hunter" | "shadow" | "ghost" | "danger" | "outline";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-bg hover:bg-white",
  hunter: "bg-hunter text-black hover:brightness-110 shadow-[0_8px_30px_-8px_var(--color-hunter)]",
  shadow: "bg-shadow text-white hover:brightness-110 shadow-[0_8px_30px_-8px_var(--color-shadow)]",
  ghost: "bg-white/5 text-ink hover:bg-white/10",
  outline: "border border-line-strong text-ink hover:bg-white/5",
  danger: "bg-danger text-white hover:brightness-110 shadow-[0_8px_30px_-10px_var(--color-danger)]",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" | "xl"; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100 select-none",
        size === "sm" && "h-9 px-3 text-sm rounded-xl",
        size === "md" && "h-11 px-4 text-[15px]",
        size === "lg" && "h-14 px-6 text-base",
        size === "xl" && "h-16 px-6 text-lg",
        VARIANTS[variant],
        className,
      )}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-3xl border border-line bg-surface p-4", className)}>{children}</div>;
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[13px] font-medium text-muted">{children}</span>
      {hint && <span className="text-[13px] font-mono text-ink tabular">{hint}</span>}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className={cn("flex rounded-xl bg-surface-2 p-1", disabled && "opacity-50 pointer-events-none")}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "relative flex-1 rounded-lg px-2 py-1.5 text-[13px] font-medium transition",
            value === o.value ? "text-ink" : "text-muted hover:text-ink",
          )}
        >
          {value === o.value && (
            <motion.span layoutId={`seg-${options.map((x) => x.value).join()}`} className="absolute inset-0 rounded-lg bg-white/10" />
          )}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-40",
        checked ? "bg-shadow" : "bg-surface-2 border border-line",
      )}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 600, damping: 35 }}
        className={cn("absolute top-1 size-5 rounded-full bg-white", checked ? "right-1" : "left-1")}
      />
    </button>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  accent,
  disabled,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  accent?: string;
  disabled?: boolean;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ ["--fill" as string]: `${fill}%`, ["--accent" as string]: accent }}
      className="disabled:opacity-40"
    />
  );
}

export const ROLE_META: Record<Role, { label: string; color: string; icon: string; tagline: string }> = {
  hunter: { label: "Hunter", color: "var(--color-hunter)", icon: "🎯", tagline: "Track the pings. Tag every Shadow." },
  shadow: { label: "Shadow", color: "var(--color-shadow)", icon: "🌑", tagline: "Stay hidden. Outlast the clock." },
  spectator: { label: "Spectator", color: "var(--color-zone)", icon: "👁️", tagline: "Watch everything unfold." },
};

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  const m = ROLE_META[role];
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider", className)}
      style={{ color: m.color, background: `color-mix(in oklab, ${m.color} 16%, transparent)` }}
    >
      {m.label}
    </span>
  );
}

export function Avatar({ player, size = 36, dim }: { player: Pick<Player, "emoji" | "color">; size?: number; dim?: boolean }) {
  return (
    <span
      className={cn("inline-grid shrink-0 place-items-center rounded-full", dim && "grayscale opacity-50")}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.52,
        background: `color-mix(in oklab, ${player.color} 28%, #0f1119)`,
        boxShadow: `inset 0 0 0 2px ${player.color}`,
      }}
    >
      {player.emoji}
    </span>
  );
}

/** Bottom sheet with a backdrop. */
export function Sheet({
  open,
  onClose,
  children,
  title,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: ReactNode;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[85dvh] max-w-lg overflow-y-auto rounded-t-[28px] border-t border-line bg-surface safe-bottom"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 420, damping: 40 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, i) => (i.offset.y > 120 || i.velocity.y > 600) && onClose()}
          >
            <div className="sticky top-0 z-10 bg-surface px-5 pb-2 pt-3">
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-white/15" />
              {title && <div className="text-lg font-semibold">{title}</div>}
            </div>
            <div className="px-5 pb-4">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export const EMOJIS = ["🦊", "🐺", "🦉", "🐱", "🐼", "🦁", "🐸", "🐙", "🦄", "🐲", "👻", "🤖", "👽", "🥷", "🕵️", "🧙", "🦖", "🐝", "🦈", "🐧"];
