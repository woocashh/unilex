"use client";

import { useEffect, useRef } from "react";
import { markRead } from "@/app/alert/[id]/actions";

/**
 * Marks the current alert as read in alert_reads when this component mounts.
 * Used on /alert/[id]. Idempotent — fires once per mount.
 */
export function MarkReadOnView({ alertId }: { alertId: string }) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    void markRead(alertId);
  }, [alertId]);
  return null;
}
