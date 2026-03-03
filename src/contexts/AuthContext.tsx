import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { getAuth, onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut, GoogleAuthProvider, User } from "firebase/auth";
import { doc, getDoc, setDoc, getDocs, collection, serverTimestamp } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { format } from "date-fns";

const auth = getAuth();
const googleProvider = new GoogleAuthProvider();

const SOURCE_USER_UID = "xgkdmyxxeJVlNiqoahNJWBekqmh2";

interface AuthContextType {
  user: User | null;
  userId: string | null;
  userRole: string | null;
  loading: boolean;
  pendingApproval: boolean;
  signInWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

async function initializeNewUser(userId: string) {
  try {
    // Copy categories (expense & income)
    for (const catType of ["expense", "income"]) {
      const sourceDoc = await getDoc(doc(firestore, "users", SOURCE_USER_UID, "categories", catType));
      if (sourceDoc.exists()) {
        await setDoc(doc(firestore, "users", userId, "categories", catType), sourceDoc.data());
      }
    }

    // Copy current month's budget
    const currentPeriod = format(new Date(), "yyyy-MM");
    const budgetDoc = await getDoc(doc(firestore, "users", SOURCE_USER_UID, "budgets", currentPeriod));
    if (budgetDoc.exists()) {
      const budgetData = { ...budgetDoc.data() };
      // Reset carry_over to 0 for all categories
      if (budgetData.categories && typeof budgetData.categories === "object") {
        for (const key of Object.keys(budgetData.categories)) {
          if (budgetData.categories[key]?.carry_over !== undefined) {
            budgetData.categories[key].carry_over = 0;
          }
        }
      }
      await setDoc(doc(firestore, "users", userId, "budgets", currentPeriod), budgetData);
    }
  } catch (error) {
    console.error("Error initializing new user:", error);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingApproval, setPendingApproval] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userDoc = await getDoc(doc(firestore, "users", firebaseUser.uid));
        if (userDoc.exists()) {
          setUser(firebaseUser);
          setUserRole(userDoc.data()?.role || "user");
          setPendingApproval(false);

          // Check if new user needs initialization (no categories yet)
          const catDoc = await getDoc(doc(firestore, "users", firebaseUser.uid, "categories", "expense"));
          if (!catDoc.exists()) {
            await initializeNewUser(firebaseUser.uid);
          }
        } else {
          // Not in users → check requester
          const reqDoc = await getDoc(doc(firestore, "requester", firebaseUser.uid));
          if (reqDoc.exists()) {
            setUser(firebaseUser);
            setPendingApproval(true);
          } else {
            await firebaseSignOut(auth);
            setUser(null);
            setUserRole(null);
            setPendingApproval(false);
          }
        }
      } else {
        setUser(null);
        setUserRole(null);
        setPendingApproval(false);
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
        // Save to requester collection
        await setDoc(doc(firestore, "requester", result.user.uid), {
          created_at: serverTimestamp(),
          display_name: result.user.displayName || "",
          email: result.user.email || "",
          role: "pending",
        });
        setUser(result.user);
        setPendingApproval(true);
        return { success: true };
      }
      setUser(result.user);
      setUserRole(userDoc.data()?.role || "user");
      setPendingApproval(false);

      // Initialize if needed
      const catDoc = await getDoc(doc(firestore, "users", result.user.uid, "categories", "expense"));
      if (!catDoc.exists()) {
        await initializeNewUser(result.user.uid);
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || "เกิดข้อผิดพลาด" };
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUser(null);
    setUserRole(null);
    setPendingApproval(false);
  };

  return (
    <AuthContext.Provider value={{ user, userId: user?.uid ?? null, userRole, loading, pendingApproval, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
