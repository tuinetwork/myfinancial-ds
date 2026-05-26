import { useEffect, useState } from "react";
import { fetchTrueNetWorth } from "@/lib/wallet-balance";

/**
 * trueNetWorth = sum(income) − sum(expense) จาก transactions ของผู้ใช้
 * (โหลดครั้งเดียวเมื่อ userId เปลี่ยน)
 */
export function useTrueNetWorth(userId: string | null | undefined): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!userId) {
      setValue(0);
      return;
    }
    let cancelled = false;
    fetchTrueNetWorth(userId).then((v) => {
      if (!cancelled) setValue(v);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return value;
}
