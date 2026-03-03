import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";

export interface RequesterInfo {
  id: string;
  display_name: string;
  email: string;
  role: string;
  created_at: any;
}

export function useRequesterNotifications() {
  const { userRole } = useAuth();
  const [requesters, setRequesters] = useState<RequesterInfo[]>([]);
  const isAdmin = userRole === "dev" || userRole === "admin";

  useEffect(() => {
    if (!isAdmin) {
      setRequesters([]);
      return;
    }

    const unsub = onSnapshot(collection(firestore, "requester"), (snapshot) => {
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as RequesterInfo));
      data.sort((a, b) => {
        const ta = a.created_at?.toMillis?.() || 0;
        const tb = b.created_at?.toMillis?.() || 0;
        return tb - ta;
      });
      setRequesters(data);
    }, (error) => {
      console.error("Error listening to requesters:", error);
    });

    return () => unsub();
  }, [isAdmin]);

  return { requesters, pendingCount: requesters.length, isAdmin };
}
