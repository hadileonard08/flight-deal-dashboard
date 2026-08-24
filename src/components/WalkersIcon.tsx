/**
 * Custom "Walkers" icon — a stick figure viewed from the side, walking and
 * holding a small map with both hands in front. The side angle makes both
 * the person and the map clearly visible. Matches lucide-react's stroke
 * style (24x24 viewBox, currentColor).
 */
type Props = {
  size?: number | string;
  className?: string;
  strokeWidth?: number;
};

export default function WalkersIcon({
  size = 24,
  className,
  strokeWidth = 1.25,
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
      {/* Head (facing right) */}
      <circle cx="6" cy="5" r="1.7" />

      {/* Torso */}
      <path d="M6 6.7 L6 12" />

      {/* Both arms reaching forward to hold the map */}
      <path d="M6 8.3 L10 9.2" />
      <path d="M6 8.8 L10 10" />

      {/* Small map held in front (to the right of the figure) */}
      <path d="M10 8.5 L15.5 8.5 L15.5 12.5 L10 12.5 Z" />
      {/* Fold line down the middle of the map */}
      <path d="M12.75 8.5 L12.75 12.5" />
      {/* A little route/path drawn on the map */}
      <path d="M11 10.2 L12 9.8 L13 10.5 L14.5 10" opacity="0.6" />

      {/* Legs in a walking stride */}
      <path d="M6 12 L9 17" />
      <path d="M6 12 L3 16" />

      {/* Feet */}
      <path d="M9 17 L11 18.5" />
      <path d="M3 16 L1.5 18" />
    </svg>
  );
}
