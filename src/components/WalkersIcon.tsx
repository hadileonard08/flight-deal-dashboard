/**
 * Custom "Walkers" icon — stick people walking and holding a map.
 * Designed to match lucide-react's stroke style (24x24 viewBox, currentColor).
 */
type Props = {
  size?: number | string;
  className?: string;
  strokeWidth?: number;
};

export default function WalkersIcon({
  size = 24,
  className,
  strokeWidth = 2,
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
      {/* Map held by the walkers */}
      <path d="M8 7 L12 8 L16 7 L16 12 L12 13 L8 12 Z" />
      <path d="M12 8 L12 13" />
      {/* Fold lines on the map */}
      <path d="M8 9.5 L16 10.5" opacity="0.5" />

      {/* Person 1 (left, walking, holding map) */}
      <circle cx="6" cy="15" r="1.4" />
      <path d="M6 16.4 L7 19" />
      <path d="M6 16.4 L4.5 18" />
      <path d="M6 16.4 L8 17 L8 7" />
      <path d="M7 19 L5.5 22" />
      <path d="M7 19 L9 21.5" />

      {/* Person 2 (right, walking) */}
      <circle cx="18" cy="15" r="1.4" />
      <path d="M18 16.4 L19 19" />
      <path d="M18 16.4 L16.5 18" />
      <path d="M18 16.4 L20 17" />
      <path d="M19 19 L17.5 22" />
      <path d="M19 19 L21 21.5" />
    </svg>
  );
}
