import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";

const GoogleLogin = () => {
  const { signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    setLoading(true);
    setError("");
    const result = await signInWithGoogle();
    if (!result.success) {
      setError(result.error || "เกิดข้อผิดพลาด");
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[hsl(210,30%,96%)] overflow-hidden">
      {/* Decorative circles */}
      <div className="absolute top-[-8%] right-[20%] w-[420px] h-[420px] rounded-full bg-[hsl(162,55%,52%)] opacity-90" />
      <div className="absolute bottom-[-12%] left-[5%] w-[480px] h-[480px] rounded-full bg-[hsl(207,70%,52%)] opacity-90" />
      <div className="absolute top-[52%] right-[12%] w-3 h-3 rounded-full bg-[hsl(162,55%,42%)]" />
      <div className="absolute top-[50%] left-[15%] w-3 h-3 rounded-full bg-[hsl(190,80%,55%)]" />

      {/* Login card */}
      <div className="relative z-10 w-full max-w-sm bg-white rounded-xl shadow-lg px-8 py-10 flex flex-col items-center gap-6">
        {/* Logo & title */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-lg">
            F
          </div>
          <span className="text-lg font-semibold text-foreground">ระบบจัดการการเงิน</span>
        </div>

        <h1 className="text-2xl font-bold text-foreground">เข้าสู่ระบบ</h1>

        {/* Google sign-in button */}
        <Button
          onClick={handleLogin}
          disabled={loading}
          className="w-full gap-3 h-11 text-sm font-medium"
          size="lg"
        >
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
          )}
          เข้าสู่ระบบด้วย Google
        </Button>

        {error && (
          <Alert variant="destructive" className="w-full">
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        <p className="text-xs text-muted-foreground text-center">
          เฉพาะบัญชีที่ได้รับอนุญาตเท่านั้น
        </p>
      </div>
    </div>
  );
};

export default GoogleLogin;
