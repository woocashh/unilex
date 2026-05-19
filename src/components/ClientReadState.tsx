"use client";

import { useEffect } from "react";

const STORAGE_KEY = "unilex.read";

function loadRead(): Record<string, true> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, true>) : {};
  } catch {
    return {};
  }
}

function saveRead(map: Record<string, true>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota / disabled — silently ignore */
  }
}

/**
 * Marks an alert as read in localStorage when this component mounts.
 * Used on /alert/[id]. Persists across the session until auth is wired up.
 */
export function MarkReadOnView({ alertId }: { alertId: string }) {
  useEffect(() => {
    const map = loadRead();
    if (!map[alertId]) {
      map[alertId] = true;
      saveRead(map);
    }
  }, [alertId]);
  return null;
}

/**
 * Hides the NEW pill on feed cards whose alert id is already in localStorage.
 * Targets elements with [data-unread="<id>"].
 */
export function ApplyReadState() {
  useEffect(() => {
    const map = loadRead();
    if (!Object.keys(map).length) return;
    for (const el of document.querySelectorAll<HTMLElement>("[data-unread]")) {
      const id = el.dataset.unread;
      if (id && map[id]) el.style.display = "none";
    }
  }, []);
  return null;
}
