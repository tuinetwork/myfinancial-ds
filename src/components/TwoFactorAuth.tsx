import { useState, useEffect } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { generateSecret, generate, verify, generateURI } from "otplib";
import { QRCodeSVG } from "qrcode.react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Loader2, KeyRound, Copy, Check } from "lucide-react";
import { toast } from "sonner";

const MFA_SESSION_KEY = "mfa_verified_at";
const MFA_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export function isMfaSessionValid(): boolean {
  const ts = sessionStorage.getItem(MFA_SESSION_KEY);
  if (!ts) return false;
  return Date.now() - parseInt(ts, 10) < MFA_TIMEOUT_MS;
}

export function setMfaSession() {
  sessionStorage.setItem(MFA_SESSION_KEY, String(Date.now()));
}

export function clearMfaSession() {
  sessionStorage.removeItem(MFA_SESSION_KEY);
}

interface TwoFactorAuthProps {
  open: boolean;
  onVerified: () => void;
  onCancel: () => void;
}

export function TwoFactorAuth({ open, onVerified, onCancel }: TwoFactorAuthProps) {
  const { userId, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [secret, setSecret] = useState<string | null>(null);
  const [isSetup, setIsSetup] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !userId) return;
    setOtpCode("");
    setError("");
    checkMfaStatus();
  }, [open, userId]);

  const checkMfaStatus = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const mfaDoc = await getDoc(doc(firestore, "users", userId, "security", "mfa"));
      if (mfaDoc.exists() && mfaDoc.data()?.secret) {
        setSecret(mfaDoc.data().secret);
        setIsSetup(true);
      } else {
        // Generate new secret for setup
        const newSecret = generateSecret();
        setSecret(newSecret);
        setIsSetup(false);
      }
    } catch (err) {
      console.error("MFA check error:", err);
      toast.error("ไม่สามารถตรวจสอบ MFA ได้");
    }
    setLoading(false);
  };

  const getOtpAuthUrl = () => {
    if (!secret || !user?.email) return "";
    return generateURI({ secret, issuer: "MyFinancial DS", label: user.email });
  };

  const handleCopySecret = () => {
    if (!secret) return;
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleVerify = async () => {
    if (!secret || !userId || otpCode.length !== 6) return;
    setVerifying(true);
    setError("");

    try {
      const isValid = authenticator.verify({ token: otpCode, secret });
      if (isValid) {
        if (!isSetup) {
          // Save secret on first setup
          await setDoc(doc(firestore, "users", userId, "security", "mfa"), {
            secret,
            enabled: true,
            setup_at: Date.now(),
          });
        }
        setMfaSession();
        toast.success("ยืนยัน MFA สำเร็จ");
        onVerified();
      } else {
        setError("รหัส OTP ไม่ถูกต้อง กรุณาลองใหม่");
        setOtpCode("");
      }
    } catch (err) {
      setError("เกิดข้อผิดพลาดในการยืนยัน");
    }
    setVerifying(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <ShieldCheck className="h-5 w-5 text-primary" />
            {isSetup ? "ยืนยันตัวตน 2FA" : "ตั้งค่า Two-Factor Authentication"}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {isSetup
              ? "กรอกรหัส 6 หลักจากแอป Authenticator ของคุณ"
              : "สแกน QR Code ด้วย Google Authenticator หรือ Authy เพื่อเปิดใช้งาน 2FA"}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* QR Code for setup */}
            {!isSetup && secret && (
              <div className="space-y-4">
                <div className="flex justify-center p-4 bg-white rounded-xl">
                  <QRCodeSVG value={getOtpAuthUrl()} size={200} level="M" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    หรือป้อน Secret Key ด้วยตนเอง:
                  </Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 bg-muted rounded-lg text-xs font-mono text-foreground break-all select-all">
                      {secret}
                    </code>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0"
                      onClick={handleCopySecret}
                    >
                      {copied ? <Check className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* OTP Input */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-foreground">
                <KeyRound className="h-3.5 w-3.5" />
                รหัส OTP 6 หลัก
              </Label>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={otpCode}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setOtpCode(v);
                  setError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && otpCode.length === 6 && handleVerify()}
                className="text-center text-2xl tracking-[0.5em] font-mono h-14 bg-muted/50 border-border"
                autoFocus
              />
              {error && (
                <p className="text-xs text-destructive animate-shake">{error}</p>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={onCancel} className="flex-1">
                ยกเลิก
              </Button>
              <Button
                onClick={handleVerify}
                disabled={otpCode.length !== 6 || verifying}
                className="flex-1"
              >
                {verifying && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                {isSetup ? "ยืนยัน" : "เปิดใช้งานและยืนยัน"}
              </Button>
            </div>

            {/* Session info */}
            <p className="text-[11px] text-muted-foreground text-center">
              เซสชันจะหมดอายุหลังจากไม่มีการใช้งาน 30 นาที
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
