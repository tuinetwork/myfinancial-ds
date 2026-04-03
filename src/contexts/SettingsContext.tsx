import { createContext, useContext, useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";

interface SettingsContextType {
  includeCarryOver: boolean;
  setIncludeCarryOver: (v: boolean) => void;
  loading: boolean;
}

const SettingsContext = createContext<SettingsContextType>({
  includeCarryOver: true,
  setIncludeCarryOver: () => {},
  loading: true,
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const [includeCarryOver, setIncludeCarryOverState] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    const ref = doc(firestore, "users", userId, "settings", "preferences");
    getDoc(ref).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (typeof data.include_carry_over === "boolean") {
          setIncludeCarryOverState(data.include_carry_over);
        }
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [userId]);

  const setIncludeCarryOver = (v: boolean) => {
    setIncludeCarryOverState(v);
    if (!userId) return;
    const ref = doc(firestore, "users", userId, "settings", "preferences");
    setDoc(ref, { include_carry_over: v }, { merge: true }).catch(console.error);
  };

  return (
    <SettingsContext.Provider value={{ includeCarryOver, setIncludeCarryOver, loading }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
