interface RoadIconProps {
  size?: number;
  className?: string;
}

function RoadBase() {
  return (
    <>
      {/* Road edges — diagonal bottom-left to top-right */}
      <line x1="2" y1="19" x2="16" y2="5" />
      <line x1="8" y1="22" x2="22" y2="8" />
      {/* Dashed center line — centered between both edges */}
      <line x1="7" y1="18.5" x2="9" y2="16.5" />
      <line x1="11" y1="14.5" x2="13" y2="12.5" />
      <line x1="15" y1="10.5" x2="17" y2="8.5" />
    </>
  );
}

export function RoadIcon({ size = 24, className }: RoadIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <RoadBase />
    </svg>
  );
}

export function BuildRoadIcon({ size = 24, className }: RoadIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <RoadBase />
      {/* Plus sign — build indicator (top-left) */}
      <line x1="4" y1="2" x2="4" y2="8" />
      <line x1="1" y1="5" x2="7" y2="5" />
    </svg>
  );
}

export function RemoveRoadIcon({ size = 24, className }: RoadIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <RoadBase />
      {/* Minus sign — remove indicator (top-left) */}
      <line x1="1" y1="5" x2="7" y2="5" />
    </svg>
  );
}
