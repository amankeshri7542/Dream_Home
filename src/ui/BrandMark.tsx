// The Dream Home mark: a terracotta tile with a little house and a sun.
export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <svg
      className="dh-brand-mark"
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden
    >
      <rect width="40" height="40" rx="12" fill="var(--dh-terracotta-600)" />
      <path d="M9 21.5 20 11.5l11 10V32H9Z" fill="var(--dh-paper-1)" />
      <path d="M17 32v-7a3 3 0 0 1 6 0v7" fill="var(--dh-terracotta-600)" />
      <circle cx="29" cy="11" r="3.2" fill="var(--dh-sun-400)" />
    </svg>
  );
}
