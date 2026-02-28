import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { getAuth, onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut, GoogleAuthProvider, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";

const auth = getAuth();
const googleProvider = new GoogleAuthProvider();

interface AuthContextType {
  user: User | null;
  userId: string | null;
  loading: boolean;
  signInWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Verify user exists in Firestore
        const userDoc = await getDoc(doc(firestore, "users", firebaseUser.uid));
        if (userDoc.exists()) {
          setUser(firebaseUser);
        } else {
          await firebaseSignOut(auth);
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const userDoc = await getDoc(doc(firestore, "users", result.user.uid));
      if (!userDoc.exists()) {
        await firebaseSignOut(auth);
        setUser(null);
        return { success: false, error: "ไม่พบข้อมูลผู้ใช้ในระบบ" };
      }
      setUser(result.user);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || "เกิดข้อผิดพลาด" };
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, userId: user?.uid ?? null, loading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
