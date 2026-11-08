export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="14" fill="none" stroke="var(--color-hunter)" strokeWidth="2.5" />
      <circle cx="16" cy="16" r="8" fill="none" stroke="var(--color-hunter)" strokeWidth="2" opacity=".6" />
      <circle cx="19" cy="13" r="4.5" fill="var(--color-shadow)" />
    </svg>
  );
}
