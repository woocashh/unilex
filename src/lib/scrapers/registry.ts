import type { SourceAdapter } from "./types";
import { knfAdapter } from "./adapters/knf";
import { knfKomunikatyAdapter } from "./adapters/knf-komunikaty";
import { uodoAdapter } from "./adapters/uodo";
import { uokikAdapter } from "./adapters/uokik";
import { govPlNewsAdapter } from "./adapters/gov-pl-news";
import { govPlWplipAdapter } from "./adapters/gov-pl-wplip";
import { ecHaveYourSayAdapter } from "./adapters/ec-haveyoursay";
import { sejmPrintsAdapter } from "./adapters/sejm-prints";
import { sejmProcessesAdapter } from "./adapters/sejm-processes";
import { sejmPoskomAdapter } from "./adapters/sejm-poskom";
import { sejmInterpelacjeAdapter } from "./adapters/sejm-interpelacje";
import { rclLegislacjaAdapter } from "./adapters/rcl-legislacja";

const adapters: SourceAdapter[] = [
  knfAdapter,
  knfKomunikatyAdapter,
  uodoAdapter,
  uokikAdapter,
  govPlNewsAdapter,
  govPlWplipAdapter,
  ecHaveYourSayAdapter,
  sejmPrintsAdapter,
  sejmProcessesAdapter,
  sejmPoskomAdapter,
  sejmInterpelacjeAdapter,
  rclLegislacjaAdapter,
];

export const adapterRegistry: Record<string, SourceAdapter> = Object.fromEntries(
  adapters.map((a) => [a.key, a]),
);

export function getAdapter(key: string): SourceAdapter | undefined {
  return adapterRegistry[key];
}
