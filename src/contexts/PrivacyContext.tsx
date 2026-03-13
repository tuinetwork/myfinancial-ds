import { createContext, useContext, useState, ReactNode } from "react";

interface PrivacyContextType {
  privacyMode: boolean;
  togglePrivacy: () => void;
  maskValue: (value: string | number) => string;
}

const PrivacyContext = createContext<PrivacyContextType | null>(null);

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [privacyMode, setPrivacyMode] = useState(false);

  const togglePrivacy = () => setPrivacyMode((p) => !p);

  const maskValue = (value: string | number): string => {
    if (privacyMode) return "***";
    return typeof value === "number" ? value.toLocaleString() : value;
  };

  return (
    <PrivacyContext.Provider value={{ privacyMode, togglePrivacy, maskValue }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export function usePrivacy() {
  const context = useContext(PrivacyContext);
  if (!context) throw new Error("usePrivacy must be used within PrivacyProvider");
  return context;
}
