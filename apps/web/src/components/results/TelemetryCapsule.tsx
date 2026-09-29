import { formatDurationCompact } from "../../lib/format";
import { shortPlaceName } from "../../lib/stationView";
import { GasStationIcon, NavigateIcon } from "../icons";

interface TelemetryCapsuleProps {
  origin: string;
  destination: string;
  distanceKm: number;
  durationMinutes: number;
  stationCount: number;
}

/** Capsula in alto sulla mappa: tratta, distanza, durata e stazioni trovate (DESIGN.md — Screen 2). */
export function TelemetryCapsule({ origin, destination, distanceKm, durationMinutes, stationCount }: TelemetryCapsuleProps) {
  return (
    <div className="absolute top-space-md inset-x-space-md z-10 flex items-center justify-between gap-space-xs bg-surface-container-lowest/90 backdrop-blur-md pl-space-md pr-space-sm py-space-xs rounded-full shadow-md">
      <div className="flex items-center gap-1 min-w-0">
        <NavigateIcon className="w-[18px] h-[18px] text-secondary" />
        <span className="text-headline-sm font-headline-sm text-[12px] text-on-surface truncate">
          {shortPlaceName(origin)} → {shortPlaceName(destination)}
        </span>
        <span aria-hidden="true" className="text-outline text-body-sm shrink-0">
          •
        </span>
        <span className="text-label-md font-label-md text-on-surface-variant tabular-nums shrink-0">{Math.round(distanceKm)} km</span>
        <span aria-hidden="true" className="text-outline text-body-sm shrink-0">
          •
        </span>
        <span className="text-label-md font-label-md text-on-surface-variant tabular-nums shrink-0">{formatDurationCompact(durationMinutes)}</span>
      </div>
      <div className="flex items-center gap-1 bg-surface-container-high px-2 py-0.5 rounded-full shrink-0">
        <GasStationIcon className="w-[13px] h-[13px] text-primary" />
        <span className="text-label-sm font-label-sm text-primary tabular-nums">{stationCount} staz.</span>
      </div>
    </div>
  );
}
