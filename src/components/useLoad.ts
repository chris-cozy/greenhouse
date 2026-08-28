import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import { api } from "../api";

type LoadState<T> = { path: string | null; data: T | null; error: string; loading: boolean; refreshing: boolean; refreshError: string };

/** Background reads keep the current resource mounted; navigation never reuses another resource's data. */
export function useLoad<T>(path: string | null, deps: unknown[] = []) {
  const [state, setState] = useState<LoadState<T>>({ path, data: null, error: "", loading: path !== null, refreshing: false, refreshError: "" });
  const current = useRef(state);
  const currentPath = useRef(path);
  const generation = useRef(0);
  const mounted = useRef(false);
  currentPath.current = path;

  const reload = useCallback(async ({ background = false }: { background?: boolean } = {}) => {
    if (!mounted.current || currentPath.current !== path || path === null) return;
    const request = ++generation.current;
    const previous = current.current;
    const sameResource = previous.path === path;
    const preserve = background && sameResource && previous.data !== null;
    const next: LoadState<T> = {
      path, data: sameResource ? previous.data : null, error: "", refreshError: "",
      loading: !preserve, refreshing: preserve,
    };
    current.current = next;
    setState(next);
    const isCurrent = () => mounted.current && generation.current === request && currentPath.current === path;
    try {
      const data = await api.get<T>(path);
      if (!isCurrent()) return;
      current.current = { ...next, data, loading: false, refreshing: false };
      setState(current.current);
      return data;
    } catch (error) {
      if (!isCurrent()) return;
      const message = error instanceof Error ? error.message : "Could not refresh your greenhouse.";
      current.current = { ...next, loading: false, refreshing: false, error: preserve ? "" : message, refreshError: preserve ? message : "" };
      setState(current.current);
    }
  }, [path]);

  useEffect(() => {
    mounted.current = true;
    if (path === null) {
      generation.current++;
      current.current = { path, data: null, error: "", loading: false, refreshing: false, refreshError: "" };
      setState(current.current);
    } else void reload();
    return () => { mounted.current = false; generation.current++; };
  }, [reload, ...deps]);

  const setData = useCallback((value: SetStateAction<T | null>) => {
    const previous = current.current.path === path ? current.current.data : null;
    const data = typeof value === "function" ? (value as (previous: T | null) => T | null)(previous) : value;
    current.current = { ...current.current, path, data };
    setState(current.current);
  }, [path]);

  const sameResource = state.path === path;
  return {
    data: sameResource ? state.data : null, setData, reload,
    loading: path !== null && (!sameResource || state.loading), error: sameResource ? state.error : "",
    refreshing: sameResource && state.refreshing, refreshError: sameResource ? state.refreshError : "",
  };
}
