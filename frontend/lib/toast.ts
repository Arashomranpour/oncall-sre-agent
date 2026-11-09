export type ToastType = "success" | "error" | "info";
export interface ToastMsg { id: number; type: ToastType; message: string }

type Listener = (t: ToastMsg) => void;
const listeners: Listener[] = [];
let counter = 0;

export function onToast(fn: Listener) {
  listeners.push(fn);
  return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
}

export function showToast(type: ToastType, message: string) {
  const t = { id: ++counter, type, message };
  listeners.forEach((l) => l(t));
}
