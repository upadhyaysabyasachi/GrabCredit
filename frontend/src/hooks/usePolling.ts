"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Polling hook for checkout status updates.
 * Polls every 2 seconds, stops on terminal state or after maxDuration.
 */
export function usePolling<T>(
  fetcher: () => Promise<T>,
  options: {
    enabled: boolean;
    intervalMs?: number;
    maxDurationMs?: number;
    isTerminal?: (data: T) => boolean;
    onUpdate?: (data: T) => void;
  }
) {
  const {
    enabled,
    intervalMs = 2000,
    maxDurationMs = 5 * 60 * 1000,
    isTerminal,
    onUpdate,
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const startTimeRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  useEffect(() => {
    if (!enabled) {
      stopPolling();
      return;
    }

    setIsPolling(true);
    startTimeRef.current = Date.now();

    const poll = async () => {
      try {
        const result = await fetcher();
        setData(result);
        setError(null);
        onUpdate?.(result);

        if (isTerminal?.(result)) {
          stopPolling();
          return;
        }

        if (Date.now() - startTimeRef.current > maxDurationMs) {
          stopPolling();
          return;
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Polling error");
      }
    };

    // Initial fetch
    poll();

    // Set up interval
    intervalRef.current = setInterval(poll, intervalMs);

    return () => {
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return { data, error, isPolling, stopPolling };
}
