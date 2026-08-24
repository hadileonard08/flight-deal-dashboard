/**
 * Walker icon — uses the uploaded PNG image as the Jalan brand mark.
 */
type Props = {
  size?: number | string;
  className?: string;
};

export default function WalkersIcon({ size = 24, className }: Props) {
  return (
    <img
      src="/walker-icon.png"
      alt=""
      width={size}
      height={size}
      className={className}
      style={{ objectFit: 'contain' }}
      aria-hidden="true"
    />
  );
}
