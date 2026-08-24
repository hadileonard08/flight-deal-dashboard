/**
 * Custom "Walkers" icon — a stick figure walking while holding a small map
 * with both hands. Matches lucide-react's stroke style (24x24, currentColor).
 */
type Props = {
  size?: number | string;
  className?: string;
  strokeWidth?: number;
};

export default function WalkersIcon({
  size = 24,
  className,
  strokeWidth = 1.75,
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
      <circle cx="12" cy="4.5" r="1.8" />

      {/* Torso */}
      <path d="M12 6.3 L12 12" />

      {/* Both arms reaching forward to hold the map */}
      <path d="M12 8 L9.8 11" />
      <path d="M12 8 L14.2 11" />

      {/* Small map held with both hands */}
      <path d="M9.4 11 L14.6 11 L14.6 13.5 L9.4 13.5 Z" />
      <path d="M12 11 L12 13.5" />

      {/* Legs (walking stride) */}
      <path d="M12 12 L9 17" />
      <path d="M12 12 L15 17" />

      {/* Feet */}
      <path d="M9 17 L7.5 19.5" />
      <path d="M15 17 L16.5 19.5" />
    </svg>
  );
}
