import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { initialWorkspace, loadWorkspace, STORAGE_KEY } from "./state";

export function usePersistentWorkspace() {
  const [workspace, setWorkspace] = useState(initialWorkspace),
    [ready, setReady] = useState(false),
    [storageError, setStorageError] = useState("");
  const revision = useRef(0),
    current = useRef(workspace),
    queue = useRef(Promise.resolve()),
    failed = useRef(false),
    lastSaved = useRef(workspace);
  current.current = workspace;
  useEffect(() => {
    let alive = true;
    api("/workspace")
      .then(async (r) => {
        let value = r.value;
        revision.current = r.revision;
        let legacy;
        try {
          legacy = loadWorkspace(sessionStorage);
        } catch {
          legacy = initialWorkspace();
        }
        const empty =
          !value ||
          (!value.records.length &&
            !value.session &&
            !value.sessions.length &&
            !value.draft.jd &&
            !value.draft.resume);
        if (
          !value ||
          (empty &&
            (legacy.records.length || legacy.draft.jd || legacy.draft.resume))
        ) {
          value = legacy;
          const saved = await api("/workspace", {
            method: "PUT",
            body: { value, revision: r.revision },
          });
          revision.current = saved.revision;
          try {
            sessionStorage.removeItem(STORAGE_KEY);
          } catch {
            /* Browser storage is optional. */
          }
        }
        value = {
          ...value,
          draft: {
            ...initialWorkspace().draft,
            ...(value?.draft || {}),
          },
        };
        lastSaved.current = value;
        if (alive) {
          setWorkspace(value);
          setReady(true);
        }
      })
      .catch((e) => {
        if (alive) setStorageError(e.message);
      });
    return () => {
      alive = false;
    };
  }, []);
  function persist(value = current.current) {
    queue.current = queue.current
      .catch(() => {})
      .then(async () => {
        if (failed.current) throw new Error("存在保存冲突，请刷新页面后再继续");
        try {
          const r = await api("/workspace", {
            method: "PUT",
            body: { value, revision: revision.current },
          });
          revision.current = r.revision;
          lastSaved.current = value;
          setStorageError("");
        } catch (e) {
          if (e.status === 409) failed.current = true;
          setStorageError(e.message + "；本地数据库尚未保存本次更改。");
          throw e;
        }
      });
    return queue.current;
  }
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      persist(workspace).catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [workspace, ready]);
  useEffect(() => {
    const leave = (e) => {
      if (lastSaved.current !== current.current || storageError) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [storageError]);
  return {
    workspace,
    setWorkspace,
    ready,
    storageError,
    persist,
    replace: async (value) => {
      await queue.current.catch(() => {});
      const r = await api("/workspace");
      revision.current = r.revision;
      failed.current = false;
      setWorkspace(value || r.value || initialWorkspace());
    },
  };
}
