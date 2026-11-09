import { useEffect, useState } from "react";
import { onToast, ToastMsg } from "@/lib/toast";

export default function ToastHost() {
  const [items, setItems] = useState<ToastMsg[]>([]);
  useEffect(
    () =>
      onToast((t) => {
        setItems((x) => [...x, t]);
        setTimeout(() => setItems((x) => x.filter((i) => i.id !== t.id)), 4000);
      }),
    []
  );
  const color = { success: "bg-success", error: "bg-error", info: "bg-primary" } as const;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {items.map((t) => (
        <div key={t.id} className={`${color[t.type]} animate-slide-in max-w-sm rounded-lg px-4 py-3 text-sm text-white shadow-lg`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
