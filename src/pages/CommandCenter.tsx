import { useState, useEffect, useRef, useCallback } from "react";
import { doc, getDoc, setDoc, onSnapshot, collection, getDocs, updateDoc, deleteDoc, writeBatch, query, where, orderBy, limit } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { UserProfilePopover } from "@/components/UserProfilePopover";
import { NotificationBell } from "@/components/NotificationBell";
import { AppFooter } from "@/components/AppFooter";
import { TwoFactorAuth, isMfaSessionValid, clearMfaSession } from "@/components/TwoFactorAuth";
import {
  runBudgetMigration, runAccountMigration, detectOrphanedData, exportAllData,
  type OperationLog, type OrphanedRecord,
} from "@/lib/migration-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Terminal, ShieldCheck, Database, Download, Upload, Radio, AlertTriangle,
  Loader2, Search, RefreshCw, Megaphone, Power, Plug, CheckCircle, XCircle,
  Info, Trash2, Code, Play,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Textarea } from "@/components/ui/textarea";

// ===== Operation Terminal Log Item =====
function LogItem({ log }: { log: OperationLog }) {
  const iconMap: Record<string, React.ReactNode> = {
    info: <Info className="h-3 w-3 text-primary shrink-0" />,
    success: <CheckCircle className="h-3 w-3 text-accent shrink-0" />,
    error: <XCircle className="h-3 w-3 text-destructive shrink-0" />,
    warn: <AlertTriangle className="h-3 w-3 text-[hsl(var(--debt))] shrink-0" />,
  };
  const colorMap: Record<string, string> = {
    info: "text-primary",
    success: "text-accent",
    error: "text-destructive",
    warn: "text-[hsl(var(--debt))]",
  };

  return (
    <div className="flex items-start gap-2 px-3 py-1.5 font-mono text-xs hover:bg-muted/30 transition-colors">
      {iconMap[log.level]}
      <span className="text-muted-foreground shrink-0">{format(log.timestamp, "HH:mm:ss")}</span>
      <span className={colorMap[log.level]}>{log.message}</span>
    </div>
  );
}

export default function CommandCenter() {
  const { userRole, userId, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const isDev = userRole === "dev";

  // MFA
  const [mfaVerified, setMfaVerified] = useState(false);
  const [showMfa, setShowMfa] = useState(false);

  // Operation logs
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  // States
  const [migrating, setMigrating] = useState<string | null>(null);
  const [orphans, setOrphans] = useState<OrphanedRecord[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Global controls
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [currentBroadcast, setCurrentBroadcast] = useState("");

  // Confirm dialogs
  const [confirmAction, setConfirmAction] = useState<{
    open: boolean; title: string; desc: string; action: () => void;
  }>({ open: false, title: "", desc: "", action: () => {} });

  // Import
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importData, setImportData] = useState<Record<string, any> | null>(null);
  const [showDiff, setShowDiff] = useState(false);

  // Script editor
  const [scriptCode, setScriptCode] = useState<string>(
`// Migration Script Editor
// ใช้ตัวแปรที่พร้อมใช้: db (firestore), log(msg), collection, doc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, query, where, orderBy, limit
// ตัวอย่าง:
// const users = await getDocs(collection(db, "users"));
// log(\`พบ \${users.size} ผู้ใช้\`);
`);
  const [scriptRunning, setScriptRunning] = useState(false);

  // Idle timeout
  const idleRef = useRef<ReturnType<typeof setTimeout>>();

  const addLog = useCallback((log: OperationLog) => {
    setLogs((prev) => [...prev, log]);
  }, []);

  // Scroll logs to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Access guard
  useEffect(() => {
    if (!authLoading && !isDev) navigate("/");
  }, [userRole, authLoading, navigate, isDev]);

  // Check MFA on mount
  useEffect(() => {
    if (isDev) {
      if (isMfaSessionValid()) {
        setMfaVerified(true);
        addLog({ timestamp: Date.now(), level: "info", message: "MFA session ยังไม่หมดอายุ — เข้าถึงได้" });
      } else {
        setShowMfa(true);
      }
    }
  }, [isDev]);

  // Idle timeout for MFA (30 min)
  useEffect(() => {
    if (!mfaVerified) return;
    const resetTimer = () => {
      clearTimeout(idleRef.current);
      idleRef.current = setTimeout(() => {
        clearMfaSession();
        setMfaVerified(false);
        setShowMfa(true);
        addLog({ timestamp: Date.now(), level: "warn", message: "เซสชัน MFA หมดอายุ — กรุณายืนยันตัวตนใหม่" });
      }, 30 * 60 * 1000);
    };
    resetTimer();
    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, resetTimer));
    return () => {
      clearTimeout(idleRef.current);
      events.forEach((e) => window.removeEventListener(e, resetTimer));
    };
  }, [mfaVerified]);

  // Listen to system_config for maintenance/broadcast
  useEffect(() => {
    if (!mfaVerified) return;
    const unsub = onSnapshot(doc(firestore, "system_config", "global"), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setMaintenanceMode(data.maintenance_mode ?? false);
        setCurrentBroadcast(data.broadcast_message ?? "");
      }
    });
    return () => unsub();
  }, [mfaVerified]);

  // ===== Handlers =====
  const handleMfaVerified = () => {
    setMfaVerified(true);
    setShowMfa(false);
    addLog({ timestamp: Date.now(), level: "success", message: "MFA ยืนยันสำเร็จ — เข้าสู่ Command Center" });
  };

  const handleBudgetMigration = async () => {
    setMigrating("budget");
    addLog({ timestamp: Date.now(), level: "info", message: "เริ่ม Budget Migration..." });
    try {
      await runBudgetMigration(undefined, addLog);
    } catch (err: any) {
      addLog({ timestamp: Date.now(), level: "error", message: `Budget Migration ล้มเหลว: ${err.message}` });
    }
    setMigrating(null);
  };

  const handleAccountMigration = async () => {
    setMigrating("account");
    addLog({ timestamp: Date.now(), level: "info", message: "เริ่ม Account Migration..." });
    try {
      await runAccountMigration(undefined, addLog);
    } catch (err: any) {
      addLog({ timestamp: Date.now(), level: "error", message: `Account Migration ล้มเหลว: ${err.message}` });
    }
    setMigrating(null);
  };

  const handleOrphanScan = async () => {
    setScanning(true);
    addLog({ timestamp: Date.now(), level: "info", message: "เริ่มสแกนข้อมูลกำพร้า..." });
    try {
      const result = await detectOrphanedData(addLog);
      setOrphans(result);
    } catch (err: any) {
      addLog({ timestamp: Date.now(), level: "error", message: `สแกนล้มเหลว: ${err.message}` });
    }
    setScanning(false);
  };

  const handleExport = async () => {
    setExporting(true);
    addLog({ timestamp: Date.now(), level: "info", message: "กำลังสำรองข้อมูล..." });
    try {
      const data = await exportAllData(addLog);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup-${format(new Date(), "yyyy-MM-dd-HHmmss")}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("สำรองข้อมูลสำเร็จ");
    } catch (err: any) {
      addLog({ timestamp: Date.now(), level: "error", message: `สำรองข้อมูลล้มเหลว: ${err.message}` });
      toast.error("สำรองข้อมูลล้มเหลว");
    }
    setExporting(false);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        setImportData(data);
        setShowDiff(true);
        addLog({ timestamp: Date.now(), level: "info", message: `โหลดไฟล์สำเร็จ: ${Object.keys(data.users || {}).length} ผู้ใช้` });
      } catch {
        toast.error("ไม่สามารถอ่านไฟล์ JSON ได้");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleImportConfirm = async () => {
    if (!importData?.users) return;
    addLog({ timestamp: Date.now(), level: "info", message: "เริ่มนำเข้าข้อมูล..." });
    try {
      for (const [uid, userData] of Object.entries(importData.users as Record<string, any>)) {
        const { subcollections, ...userFields } = userData;
        await setDoc(doc(firestore, "users", uid), userFields, { merge: true });
        if (subcollections) {
          for (const [subName, docs] of Object.entries(subcollections as Record<string, Record<string, any>>)) {
            for (const [docId, docData] of Object.entries(docs)) {
              await setDoc(doc(firestore, "users", uid, subName, docId), docData, { merge: true });
            }
          }
        }
      }
      addLog({ timestamp: Date.now(), level: "success", message: "นำเข้าข้อมูลสำเร็จ" });
      toast.success("นำเข้าข้อมูลสำเร็จ");
    } catch (err: any) {
      addLog({ timestamp: Date.now(), level: "error", message: `นำเข้าล้มเหลว: ${err.message}` });
      toast.error("นำเข้าข้อมูลล้มเหลว");
    }
    setImportData(null);
    setShowDiff(false);
  };

  const handleToggleMaintenance = async () => {
    const newVal = !maintenanceMode;
    setConfirmAction({
      open: true,
      title: newVal ? "เปิด Maintenance Mode" : "ปิด Maintenance Mode",
      desc: newVal
        ? "ผู้ใช้ทั่วไปจะไม่สามารถเขียนข้อมูลได้ขณะเปิดโหมดนี้"
        : "ผู้ใช้ทั่วไปจะสามารถใช้งานได้ตามปกติ",
      action: async () => {
        await setDoc(doc(firestore, "system_config", "global"), { maintenance_mode: newVal }, { merge: true });
        addLog({ timestamp: Date.now(), level: newVal ? "warn" : "success", message: `Maintenance Mode: ${newVal ? "เปิด" : "ปิด"}` });
      },
    });
  };

  const handleBroadcast = async () => {
    if (!broadcastMsg.trim()) return;
    setConfirmAction({
      open: true,
      title: "ส่งข้อความประกาศ",
      desc: `ข้อความ: "${broadcastMsg}" จะแสดงให้ผู้ใช้ทุกคนเห็น`,
      action: async () => {
        await setDoc(doc(firestore, "system_config", "global"), { broadcast_message: broadcastMsg.trim() }, { merge: true });
        addLog({ timestamp: Date.now(), level: "success", message: `ส่งประกาศ: "${broadcastMsg.trim()}"` });
        setBroadcastMsg("");
      },
    });
  };

  const handleClearBroadcast = async () => {
    await setDoc(doc(firestore, "system_config", "global"), { broadcast_message: "" }, { merge: true });
    addLog({ timestamp: Date.now(), level: "info", message: "ลบข้อความประกาศ" });
  };

  const handleRunScript = async () => {
    if (!scriptCode.trim()) return;
    setScriptRunning(true);
    addLog({ timestamp: Date.now(), level: "info", message: "▶ เริ่มรันสคริปต์..." });

    const logFn = (msg: string) => {
      addLog({ timestamp: Date.now(), level: "info", message: `[script] ${msg}` });
    };

    try {
      const asyncFn = new Function(
        "db", "log", "collection", "doc", "getDocs", "getDoc", "setDoc", "updateDoc", "deleteDoc", "writeBatch", "query", "where", "orderBy", "limit",
        `return (async () => { ${scriptCode} })();`
      );
      await asyncFn(
        firestore, logFn, collection, doc, getDocs, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, query, where, orderBy, limit
      );
      addLog({ timestamp: Date.now(), level: "success", message: "✔ สคริปต์ทำงานเสร็จสมบูรณ์" });
      toast.success("สคริปต์ทำงานเสร็จสมบูรณ์");
    } catch (err: any) {
      addLog({ timestamp: Date.now(), level: "error", message: `✖ สคริปต์ล้มเหลว: ${err.message}` });
      toast.error(`สคริปต์ล้มเหลว: ${err.message}`);
    }
    setScriptRunning(false);
  };

  const handleForceRefresh = () => {
    setConfirmAction({
      open: true,
      title: "Force Refresh ทุกอุปกรณ์",
      desc: "แอปของผู้ใช้ทุกคนจะถูกรีโหลดทันที การกระทำนี้ไม่สามารถย้อนกลับได้",
      action: async () => {
        await setDoc(doc(firestore, "system_config", "global"), { force_refresh: Date.now() }, { merge: true });
        addLog({ timestamp: Date.now(), level: "warn", message: "ส่งสัญญาณ Force Refresh ไปยังทุกอุปกรณ์" });
      },
    });
  };

  if (authLoading || !isDev) return null;

  // MFA gate
  if (!mfaVerified) {
    return (
      <>
        <AppSidebar />
        <main className="flex-1 flex items-center justify-center min-h-screen bg-background">
          <div className="text-center space-y-4">
            <ShieldCheck className="h-16 w-16 mx-auto text-primary opacity-50" />
            <h2 className="text-xl font-semibold text-foreground">Command Center</h2>
            <p className="text-sm text-muted-foreground">กรุณายืนยัน 2FA เพื่อเข้าถึง</p>
            <Button onClick={() => setShowMfa(true)}>ยืนยันตัวตน</Button>
          </div>
          <TwoFactorAuth open={showMfa} onVerified={handleMfaVerified} onCancel={() => navigate("/")} />
        </main>
      </>
    );
  }

  return (
    <>
      <AppSidebar />
      <main className="flex-1 flex flex-col min-h-screen overflow-auto">
        {/* Header */}
        <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 sm:px-6">
          <SidebarTrigger />
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold text-foreground">Command Center</h1>
          </div>
          <Badge variant="outline" className="text-xs gap-1.5 border-accent text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
            Production
          </Badge>
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell />
            <UserProfilePopover />
          </div>
        </header>

        <div className="flex-1 p-4 sm:p-6 space-y-6">
          {/* ===== Operation Terminal ===== */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-primary" />
                  Operation Terminal
                </CardTitle>
                <Button size="sm" variant="ghost" onClick={() => setLogs([])} className="h-7 text-xs">
                  <Trash2 className="h-3 w-3 mr-1" /> Clear
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-48 bg-muted/30 rounded-b-lg border-t border-border">
                <div className="py-1">
                  {logs.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-8 font-mono">
                      $ waiting for commands...
                    </p>
                  ) : (
                    logs.map((log, i) => <LogItem key={i} log={log} />)
                  )}
                  <div ref={logEndRef} />
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ===== Data Migration ===== */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Database className="h-4 w-4 text-primary" />
                  Data Migration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  onClick={() => setConfirmAction({
                    open: true, title: "รัน Budget Migration", desc: "อัปเดตโครงสร้างงบประมาณของทุกผู้ใช้",
                    action: handleBudgetMigration,
                  })}
                  disabled={!!migrating}
                  size="sm"
                  className="w-full justify-start gap-2"
                >
                  {migrating === "budget" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                  Budget Migration
                </Button>
                <Button
                  onClick={() => setConfirmAction({
                    open: true, title: "รัน Account Migration", desc: "สร้างบัญชีหลักและเชื่อมโยงธุรกรรมทั้งหมด",
                    action: handleAccountMigration,
                  })}
                  disabled={!!migrating}
                  size="sm"
                  variant="outline"
                  className="w-full justify-start gap-2"
                >
                  {migrating === "account" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                  Account Migration
                </Button>
                <Separator />
                <Button
                  onClick={handleOrphanScan}
                  disabled={scanning}
                  size="sm"
                  variant="outline"
                  className="w-full justify-start gap-2"
                >
                  {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Orphaned Data Scan
                </Button>
                {orphans !== null && (
                  <div className="text-xs p-3 rounded-lg bg-muted/50 space-y-1">
                    <p className="font-medium text-foreground">
                      ผลลัพธ์: พบ {orphans.length} รายการกำพร้า
                    </p>
                    {orphans.slice(0, 5).map((o, i) => (
                      <p key={i} className="text-muted-foreground">
                        • {o.id.slice(0, 15)}... — {o.issue}
                      </p>
                    ))}
                    {orphans.length > 5 && (
                      <p className="text-muted-foreground">...และอีก {orphans.length - 5} รายการ</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ===== Disaster Recovery ===== */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Download className="h-4 w-4 text-primary" />
                  Disaster Recovery
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  onClick={() => setConfirmAction({
                    open: true, title: "สำรองข้อมูล", desc: "ดาวน์โหลดข้อมูล Firestore ทั้งหมดเป็นไฟล์ JSON",
                    action: handleExport,
                  })}
                  disabled={exporting}
                  size="sm"
                  className="w-full justify-start gap-2"
                >
                  {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Backup to JSON
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleImportFile}
                  className="hidden"
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  size="sm"
                  variant="outline"
                  className="w-full justify-start gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Import from JSON
                </Button>

                {/* Diff Preview */}
                {showDiff && importData && (
                  <div className="text-xs p-3 rounded-lg bg-muted/50 space-y-2">
                    <p className="font-medium text-foreground">Import Preview:</p>
                    <p className="text-muted-foreground">
                      ผู้ใช้: {Object.keys(importData.users || {}).length} | 
                      Exported: {importData.exported_at || "N/A"}
                    </p>
                    {Object.entries(importData.users || {}).slice(0, 3).map(([uid, data]: [string, any]) => (
                      <div key={uid} className="pl-2 border-l-2 border-primary/30">
                        <p className="text-foreground">{uid.slice(0, 12)}...</p>
                        <p className="text-muted-foreground">
                          Subcollections: {Object.keys(data.subcollections || {}).join(", ")}
                        </p>
                      </div>
                    ))}
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="destructive" onClick={() => { setImportData(null); setShowDiff(false); }} className="flex-1">
                        ยกเลิก
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setConfirmAction({
                          open: true, title: "ยืนยันนำเข้าข้อมูล",
                          desc: `จะ merge ข้อมูล ${Object.keys(importData.users || {}).length} ผู้ใช้เข้าสู่ฐานข้อมูล`,
                          action: handleImportConfirm,
                        })}
                        className="flex-1"
                      >
                        ยืนยันนำเข้า
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ===== Global Controls ===== */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Radio className="h-4 w-4 text-primary" />
                  Global Controls
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Maintenance Mode */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium text-foreground">Maintenance Mode</Label>
                    <p className="text-xs text-muted-foreground">จำกัดการเขียนข้อมูลสำหรับผู้ใช้ทั่วไป</p>
                  </div>
                  <Switch
                    checked={maintenanceMode}
                    onCheckedChange={handleToggleMaintenance}
                  />
                </div>
                <Separator />

                {/* Broadcast */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-1.5 text-foreground">
                    <Megaphone className="h-3.5 w-3.5" />
                    System Broadcast
                  </Label>
                  {currentBroadcast && (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-[hsl(var(--debt))]/10 border border-[hsl(var(--debt))]/20">
                      <p className="text-xs flex-1 text-foreground">{currentBroadcast}</p>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={handleClearBroadcast}>
                        ลบ
                      </Button>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      value={broadcastMsg}
                      onChange={(e) => setBroadcastMsg(e.target.value)}
                      placeholder="ข้อความประกาศ..."
                      className="flex-1 h-9 text-sm"
                      maxLength={200}
                    />
                    <Button size="sm" onClick={handleBroadcast} disabled={!broadcastMsg.trim()} className="h-9">
                      ส่ง
                    </Button>
                  </div>
                </div>
                <Separator />

                {/* Force Refresh */}
                <Button
                  onClick={handleForceRefresh}
                  size="sm"
                  variant="destructive"
                  className="w-full justify-start gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Force Refresh All Clients
                </Button>
              </CardContent>
            </Card>

            {/* ===== Cross-App Connector ===== */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Plug className="h-4 w-4 text-primary" />
                  Cross-App Connector
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="p-4 rounded-lg border border-dashed border-border text-center space-y-2">
                  <Plug className="h-8 w-8 mx-auto text-muted-foreground/50" />
                  <p className="text-sm font-medium text-foreground">Inventory App Connector</p>
                  <p className="text-xs text-muted-foreground">
                    เชื่อมต่อระบบสต็อกสินค้ากับบัญชีสินทรัพย์การเงิน — กำลังพัฒนา
                  </p>
                  <Badge variant="outline" className="text-xs">Coming Soon</Badge>
                </div>
                <Button size="sm" variant="outline" className="w-full gap-2" disabled>
                  <Plug className="h-4 w-4" />
                  Run Diagnostic
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
        <AppFooter />
      </main>

      {/* MFA Dialog */}
      <TwoFactorAuth open={showMfa} onVerified={handleMfaVerified} onCancel={() => navigate("/")} />

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmAction.open} onOpenChange={(o) => !o && setConfirmAction((p) => ({ ...p, open: false }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAction.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmAction.desc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              try {
                await confirmAction.action();
              } catch (err: any) {
                addLog({ timestamp: Date.now(), level: "error", message: `Action failed: ${err.message}` });
                toast.error(err.message || "ดำเนินการล้มเหลว");
              }
              setConfirmAction((p) => ({ ...p, open: false }));
            }}>
              ยืนยัน
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
