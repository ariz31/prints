import { useState, useRef, useEffect, useCallback, type MutableRefObject } from "react";
import { validSessionPeerMessage, shouldForkSession } from "../../features/projects/logic/tabSessionCollision.ts";

export const ACTIVE_SESSION_KEY = "prints:active-session:v2";

export interface ActiveSession {
  token: string;
  projectId: string | null;
}

export interface ClonedSessionSource {
  id: string;
  token: string;
  projectId: string | null;
}

export interface ActiveSessionHookResult {
  sessionClaimed: boolean;
  activeSession: MutableRefObject<ActiveSession | null>;
  recoveryId: MutableRefObject<string>;
  tabInstanceId: MutableRefObject<string>;
  clonedSource: MutableRefObject<ClonedSessionSource | null>;
  allowLegacyRecovery: MutableRefObject<boolean>;
  hadWorkspace: MutableRefObject<boolean>;
  lastRecoveryRevision: MutableRefObject<number>;
  setActiveProjectPointer: (id: string | null) => void;
  beginDifferentWorkspace: (id: string | null) => void;
}

export function readActiveSession(): ActiveSession {
  try {
    const raw = sessionStorage.getItem(ACTIVE_SESSION_KEY);
    const record = JSON.parse(raw ?? "null") as unknown;
    if (record && typeof record === "object") {
      const value = record as Record<string, unknown>;
      if (
        typeof value.token === "string" &&
        value.token.length > 0 &&
        value.token.length <= 100 &&
        (value.projectId === null || (typeof value.projectId === "string" && value.projectId.length > 0))
      ) {
        return { token: value.token, projectId: value.projectId as string | null };
      }
    }
  } catch {
    /* Storage restrictions leave explicit project recovery available. */
  }
  return { token: crypto.randomUUID(), projectId: null };
}

export function persistActiveSession(value: ActiveSession): void {
  try {
    sessionStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(value));
  } catch {
    /* IndexedDB checkpoints are still available for manual recovery. */
  }
}

export function useActiveSession(): ActiveSessionHookResult {
  const [sessionClaimed, setSessionClaimed] = useState(false);
  const tabInstanceId = useRef(crypto.randomUUID());
  const clonedSource = useRef<ClonedSessionSource | null>(null);
  const lastRecoveryRevision = useRef(0);
  const hadWorkspace = useRef(false);
  const allowLegacyRecovery = useRef(false);

  const recoveryId = useRef<string>("");
  if (!recoveryId.current) {
    try {
      const existing = sessionStorage.getItem("prints:recovery-tab:v1");
      recoveryId.current = existing && existing.length > 0 && existing.length <= 100 ? existing : crypto.randomUUID();
      sessionStorage.setItem("prints:recovery-tab:v1", recoveryId.current);
    } catch {
      recoveryId.current = crypto.randomUUID();
    }
  }

  const activeSession = useRef<ActiveSession | null>(null);
  if (!activeSession.current) {
    try {
      allowLegacyRecovery.current = sessionStorage.getItem(ACTIVE_SESSION_KEY) === null;
    } catch {
      allowLegacyRecovery.current = false;
    }
    activeSession.current = readActiveSession();
    persistActiveSession(activeSession.current);
  }

  const setActiveProjectPointer = useCallback((id: string | null) => {
    const current = activeSession.current!;
    activeSession.current = { ...current, projectId: id };
    persistActiveSession(activeSession.current);
  }, []);

  const beginDifferentWorkspace = useCallback((id: string | null) => {
    recoveryId.current = crypto.randomUUID();
    try {
      sessionStorage.setItem("prints:recovery-tab:v1", recoveryId.current);
    } catch {
      /* Manual recovery entries remain available when storage is restricted. */
    }
    allowLegacyRecovery.current = false;
    activeSession.current = { token: crypto.randomUUID(), projectId: id };
    persistActiveSession(activeSession.current);
    hadWorkspace.current = !!id;
  }, []);

  useEffect(() => {
    let alive = true;
    let claimed = false;
    let channel: BroadcastChannel | null = null;
    let timer: number | undefined;

    const settle = () => {
      if (!alive || claimed) return;
      claimed = true;
      setSessionClaimed(true);
    };

    const fork = () => {
      if (!alive || claimed) return;
      clonedSource.current = {
        id: recoveryId.current,
        token: activeSession.current!.token,
        projectId: activeSession.current!.projectId,
      };
      beginDifferentWorkspace(null);
      settle();
    };

    try {
      const parent = window.opener as Window | null;
      if (parent && parent !== window) {
        const rawParent = parent.sessionStorage.getItem(ACTIVE_SESSION_KEY);
        const inherited = JSON.parse(rawParent ?? "null") as unknown;
        if (
          inherited &&
          typeof inherited === "object" &&
          (inherited as { token?: unknown }).token === activeSession.current?.token
        ) {
          fork();
        }
      }
    } catch {
      /* Opener inaccessible or from another origin: use channel instead. */
    }

    try {
      if (typeof BroadcastChannel !== "undefined") {
        channel = new BroadcastChannel("prints:workspace-ownership:v1");
        channel.onmessage = (event: MessageEvent<unknown>) => {
          const peer = event.data;
          if (
            !validSessionPeerMessage(peer) ||
            peer.token !== activeSession.current?.token ||
            peer.instance === tabInstanceId.current
          ) {
            return;
          }
          if (peer.kind === "probe" && claimed) {
            channel?.postMessage({
              kind: "present",
              token: activeSession.current!.token,
              instance: tabInstanceId.current,
            });
          } else if (shouldForkSession(tabInstanceId.current, peer, claimed)) {
            fork();
          }
        };
        channel.postMessage({
          kind: "probe",
          token: activeSession.current!.token,
          instance: tabInstanceId.current,
        });
        if (!claimed) {
          timer = window.setTimeout(settle, 250);
        }
      } else {
        settle();
      }
    } catch {
      settle();
    }

    return () => {
      alive = false;
      if (timer !== undefined) window.clearTimeout(timer);
      channel?.close();
    };
  }, [beginDifferentWorkspace]);

  return {
    sessionClaimed,
    activeSession,
    recoveryId,
    tabInstanceId,
    clonedSource,
    allowLegacyRecovery,
    hadWorkspace,
    lastRecoveryRevision,
    setActiveProjectPointer,
    beginDifferentWorkspace,
  };
}
