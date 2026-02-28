import { useState, useEffect, useRef } from "react";
import { ref, get } from "firebase/database";
import { db } from "@/lib/firebase";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Lock, Loader2 } from "lucide-react";

interface PinLockProps {
  onUnlock: () => void;
}

const PinLock = ({ onUnlock }: PinLockProps) => {
  const [loading, setLoading] = useState(true);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const pinKeyRef = useRef("");

  useEffect(() => {
    const checkSetup = async () => {
      try {
        const setupSnap = await get(ref(db, "users/xgkdmyxxeJVlNiqoahNJWBekqmh2/config/pinSetup"));
        const pinSetup = setupSnap.val();

        if (!pinSetup) {
          onUnlock();
          return;
        }

        const keySnap = await get(ref(db, "users/xgkdmyxxeJVlNiqoahNJWBekqmh2/config/pinKey"));
        pinKeyRef.current = String(keySnap.val() || "");
        setLoading(false);
      } catch {
        setLoading(false);
      }
    };
    checkSetup();
  }, [onUnlock]);

  const handleComplete = (value: string) => {
    if (value === pinKeyRef.current) {
      onUnlock();
    } else {
      setError("PIN ไม่ถูกต้อง");
      setShake(true);
      setTimeout(() => {
        setShake(false);
        setPin("");
      }, 500);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background">
      <div className="flex flex-col items-center gap-2">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Lock className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-xl font-semibold text-foreground">กรุณาใส่ PIN</h1>
        <p className="text-sm text-muted-foreground">ใส่รหัส PIN 6 หลักเพื่อเข้าใช้งาน</p>
      </div>

      <div className={shake ? "animate-shake" : ""}>
        <InputOTP
          maxLength={6}
          value={pin}
          onChange={(val) => {
            setPin(val);
            setError("");
          }}
          onComplete={handleComplete}
        >
          <InputOTPGroup>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <InputOTPSlot key={i} index={i} />
            ))}
          </InputOTPGroup>
        </InputOTP>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
};

export default PinLock;
