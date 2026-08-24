/**
 * Custom "Walker" icon — a big stick figure in a walking stride.
 * Matches lucide-react's stroke style (24x24 viewBox, currentColor).
 */
type Props = {
  size?: number | string;
  className?: string;
  strokeWidth?: number;
};

export default function WalkersIcon({
  size = 24,
  className,
  strokeWidth = 1.5,
}: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* Head */}
      <circle cx="13" cy="4" r="2" />

      {/* Torso (leaning slightly forward) */}
      <path d="M12.5 6 L10.5 13" />

      {/* Back arm (swinging back) */}
      <path d="M12 8 L8.5 10" />

      {/* Front arm (reaching forward) */}
      <path d="M12 8 L15.5 6.5" />

      {/* Front leg (stepping forward) */}
      <path d="M10.5 13 L14 18" />

      {/* Back leg (pushing off) */}
      <path d="M10.5 13 L6 16" />

      {/* Front foot */}
      <path d="M14 18 L16.5 19.5" />

      {/* Back foot */}
      <path d="M6 16 L3.5 18" />
    </svg>
  );
}
