'use client';
import { useEffect } from 'react';
import { useDisconnect, useAccount } from 'wagmi';

/**
 * Disconnects the wallet automatically when the browser tab/window is closed.
 * Uses the 'beforeunload' event and sessionStorage to detect tab closure
 * (as opposed to page refresh).
 */
export function AutoDisconnect() {
  const { disconnect } = useDisconnect();
  const { isConnected } = useAccount();

  useEffect(() => {
    if (!isConnected) return;

    // Mark the session as active on mount
    sessionStorage.setItem('nb_session_active', '1');

    const handleBeforeUnload = () => {
      // Remove the session marker — on next load, if it's missing, we know
      // the tab was closed (not refreshed, since refresh re-sets it immediately)
      sessionStorage.removeItem('nb_session_active');
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isConnected]);

  // On mount: if no active session marker exists, disconnect any persisted wallet
  useEffect(() => {
    const sessionActive = sessionStorage.getItem('nb_session_active');
    if (!sessionActive && isConnected) {
      disconnect();
    }
    // Set the marker for this session
    sessionStorage.setItem('nb_session_active', '1');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
