import { useEffect, useState, useRef, useCallback } from "react";
import { collection, query, where, onSnapshot, orderBy, limit } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";

export interface TransactionNotification {
  id: string;
  date: string;
  amount: number;
  type: string;
  category: string;
  note: string;
  timestamp: number;
}

const STORAGE_KEY = "tx-notifications-seen";

function getSeenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveSeenIds(ids: Set<string>) {
  // Keep only last 500 IDs to avoid bloat
  const arr = Array.from(ids).slice(-500);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
}

export function useTransactionNotifications() {
  const { userId } = useAuth();
  const [notifications, setNotifications] = useState<TransactionNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const initialLoadDone = useRef(false);
  const seenIdsRef = useRef<Set<string>>(getSeenIds());

  useEffect(() => {
    if (!userId) return;

    // Get current month period
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const txCol = collection(firestore, "users", userId, "transactions");
    const q = query(txCol, where("month_year", "==", period));

    const unsub = onSnapshot(q, (snapshot) => {
      const allTx: TransactionNotification[] = [];

      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        allTx.push({
          id: doc.id,
          date: (data.date as string) ?? "",
          amount: (data.amount as number) ?? 0,
          type: (data.type as string) ?? "",
          category: (data.sub_category as string) ?? "",
          note: (data.note as string) ?? "",
          timestamp: 0,
        });
      });

      // Sort by date descending, then by id descending for same date
      allTx.sort((a, b) => {
        const cmp = b.date.localeCompare(a.date);
        return cmp !== 0 ? cmp : b.id.localeCompare(a.id);
      });

      const latest5 = allTx.slice(0, 5);

      if (!initialLoadDone.current) {
        initialLoadDone.current = true;
        allTx.forEach((tx) => seenIdsRef.current.add(tx.id));
        saveSeenIds(seenIdsRef.current);
        setNotifications(latest5);
        setUnreadCount(0);
        return;
      }

      const newIds = allTx.filter((tx) => !seenIdsRef.current.has(tx.id));
      setNotifications(latest5);
      setUnreadCount((prev) => prev + newIds.length);

      newIds.forEach((tx) => seenIdsRef.current.add(tx.id));
      saveSeenIds(seenIdsRef.current);
    });

    return () => unsub();
  }, [userId]);

  const markAllRead = useCallback(() => {
    setUnreadCount(0);
  }, []);

  return { notifications, unreadCount, markAllRead };
}
