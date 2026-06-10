// Deterministic, accessible color from a string — used to tint source avatars.
function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

function initials(name: string): string {
  const words = name.replace(/[—–-]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function SourceAvatar({
  name,
  slug,
  size = 36,
  color,
}: {
  name: string;
  slug: string;
  size?: number;
  /** Explicit color (user-configured feeds); falls back to the slug hash. */
  color?: string | null;
}) {
  const hue = hashHue(slug);
  return (
    <span
      aria-hidden
      className="inline-grid shrink-0 place-items-center rounded-full text-xs font-semibold text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: color || `hsl(${hue}, 55%, 42%)`,
      }}
    >
      {initials(name)}
    </span>
  );
}
