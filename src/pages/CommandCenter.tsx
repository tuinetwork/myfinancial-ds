import { useState, useEffect, useRef, useCallback } from "react";
import { doc, getDoc, setDoc, onSnapshot, collection, getDocs, updateDoc, deleteDoc, writeBatch, query, where, orderBy, limit } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { UserProfilePopover } from "@/components/UserProfilePopover";
import { NotificationBell } from "@/components/NotificationBell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { GlobalInsights } from "@/components/GlobalInsights";
import { AppFooter } from "@/components/AppFooter";
import { TwoFactorAuth, isMfaSessionValid, clearMfaSession } from "@/components/TwoFactorAuth";
import {
  detectOrphanedData, exportAllData,
  type OperationLog, type OrphanedRecord,
} from "@/lib/migration-service";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  Loader2, Search, RefreshCw, Megaphone, Plug, CheckCircle, XCircle,
  Info, Trash2, Code, Play, FileJson, Plus, Edit, Save, X, ShieldAlert, 
  Bookmark, BookmarkPlus, PlayCircle, Ban, Unlock, BarChart3, DatabaseBackup
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Textarea } from "@/components/ui/textarea";

// ===== Types =====
interface SchemaDoc {
  id: string; 
  description: string;
  schemaJson: string; 
  updatedAt: number;
}

interface ScriptTemplate {
  id: string;
  name: string;
  code: string;
  updatedAt: number;
  isDefault?: boolean;
}

// ===== Default Script Templates =====
const DEFAULT_SCRIPTS: ScriptTemplate[] = [
  {
    id: "default-recount",
    name: "Recount Balances",
    isDefault: true,
    updatedAt: 0,
    code: `// ใช้ userId ของคุณ
const userId = "YOUR_USER_ID";
log("▶ เริ่มตรวจสอบบัญชีทั้งหมด...");

const accSnap = await getDocs(collection(db, "users", userId, "accounts"));
log(\`พบบัญชีทั้งหมด \${accSnap.size} บัญชี\`);

accSnap.forEach((docSnap) => {
  const d = docSnap.data();
  log(\`  \${d.name}: \${d.balance}\`);
});

log("✅ ตรวจสอบเสร็จสิ้น");`
  },
  {
    id: "default-orphan",
    name: "Fix Orphaned Transactions",
    isDefault: true,
    updatedAt: 0,
    code: `// ใช้ userId ของคุณ
const userId = "YOUR_USER_ID";
log("▶ กำลังค้นหาธุรกรรมกำพร้า...");

const txSnap = await getDocs(collection(db, "users", userId, "transactions"));
let orphanedCount = 0;

txSnap.forEach((d) => {
  const t = d.data();
  if (!t.month_year || !t.date) orphanedCount++;
});

log(\`✅ สแกนเสร็จสิ้น (พบ Orphaned \${orphanedCount} รายการ จาก \${txSnap.size} ทั้งหมด)\`);`
  }
];

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

  // Tools States
  const [orphans, setOrphans] = useState<OrphanedRecord[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [exporting, setExporting] = useState(false);
  
  // Database Tab States
  const [dbTab, setDbTab] = useState<"schemas" | "recovery">("schemas");
  
  // Schema States
  const [schemas, setSchemas] = useState<SchemaDoc[]>([]);
  const [isSchemaModalOpen, setIsSchemaModalOpen] = useState(false);
  const [schemaForm, setSchemaForm] = useState<Partial<SchemaDoc>>({
    id: "", description: "", schemaJson: "{\n  \"field_name\": \"string\"\n}"
  });
  const [isEditingSchema, setIsEditingSchema] = useState(false);

  // Script Templates States
  const [savedScripts, setSavedScripts] = useState<ScriptTemplate[]>([]);
  const [isSaveScriptModalOpen, setIsSaveScriptModalOpen] = useState(false);
  const [newScriptName, setNewScriptName] = useState("");

  // User Management States
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [searchedUser, setSearchedUser] = useState<any>(null);
  const [isSearchingUser, setIsSearchingUser] = useState(false);

  // Global & Feature Flags
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [currentBroadcast, setCurrentBroadcast] = useState("");
  const [flags, setFlags] = useState({ inventory: true, investment: false });

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

  // Listen to system_config, schemas & scripts
  useEffect(() => {
    if (!mfaVerified) return;
    
    const unsubConfig = onSnapshot(doc(firestore, "system_config", "global"), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setMaintenanceMode(data.maintenance_mode ?? false);
        setCurrentBroadcast(data.broadcast_message ?? "");
        setFlags({
          inventory: data.feature_inventory ?? true,
          investment: data.feature_investment ?? false,
        });
      }
    });

    const unsubSchemas = onSnapshot(collection(firestore, "system_schemas"), (snap) => {
      const fetchedSchemas = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as SchemaDoc[];
      fetchedSchemas.sort((a, b) => a.id.localeCompare(b.id));
      setSchemas(fetchedSchemas);
    });

    const unsubScripts = onSnapshot(collection(firestore, "system_scripts"), (snap) => {
      const fetchedScripts = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ScriptTemplate[];
      fetchedScripts.sort((a, b) => b.updatedAt - a.updatedAt);
      setSavedScripts(fetchedScripts);
    });

    return () => {
      unsubConfig();
      unsubSchemas();
      unsubScripts();
    };
  }, [mfaVerified]);

  // ===== Handlers =====
  const handleMfaVerified = () => {
    setMfaVerified(true);
    setShowMfa(false);
    addLog({ timestamp: Date.now(), level: "success", message: "MFA ยืนยันสำเร็จ — เข้าสู่ Command Center" });
  };

  // --- User Management ---
  const handleSearchUser = async () => {
    if (!userSearchQuery.trim()) return;
    setIsSearchingUser(true);
    setSearchedUser(null);
    addLog({ timestamp: Date.now(), level: "info", message: `ค้นหาผู้ใช้: ${userSearchQuery}` });
    try {
      let foundUser = null;
      let uid = "";
      if (userSearchQuery.includes("@")) {
        const q = query(collection(firestore, "users"), where("email", "==", userSearchQuery.trim()), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
          foundUser = snap.docs[0].data();
          uid = snap.docs[0].id;
        }
      } else {
        const docRef = doc(firestore, "users", userSearchQuery.trim());
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          foundUser = snap.data();
          uid = snap.id;
        }
      }

      if (foundUser) {
        setSearchedUser({ uid, ...foundUser });
        addLog({ timestamp: Date.now(), level: "success", message: `พบผู้ใช้: ${foundUser.email || uid}` });
      } else {
        toast.error("ไม่พบผู้ใช้งานในระบบ");
        addLog({ timestamp: Date.now(), level: "warn", message: "ไม่พบผู้ใช้ที่ค้นหา" });
      }
    } catch (e: any) {
      addLog({ timestamp: Date.now(), level: "error", message: `ค้นหาผู้ใช้ล้มเหลว: ${e.message}` });
    }
    setIsSearchingUser(false);
  };

  const handleUserAction = (action: string, uid: string) => {
    setConfirmAction({
      open: true,
      title: `ยืนยันการทำรายการ: ${action}`,
      desc: `คุณกำลังจะ ${action} บัญชีของ ${uid} ดำเนินการต่อหรือไม่?`,
      action: async () => {
        addLog({ timestamp: Date.now(), level: "warn", message: `[UserAction] ${action} -> UID: ${uid} (Simulated)` });
        toast.success(`ดำเนินการ ${action} สำเร็จ`);
        if (action === "Suspend") setSearchedUser({ ...searchedUser, isSuspended: true });
        if (action === "Unsuspend") setSearchedUser({ ...searchedUser, isSuspended: false });
      }
    });
  };

  // --- Feature Flags ---
  const handleToggleFlag = async (flagName: "feature_inventory" | "feature_investment", currentVal: boolean) => {
    const newVal = !currentVal;
    try {
      await setDoc(doc(firestore, "system_config", "global"), { [flagName]: newVal }, { merge: true });
      addLog({ timestamp: Date.now(), level: "info", message: `Feature Flag '${flagName}' -> ${newVal ? "ON" : "OFF"}` });
    } catch (e: any) {
      toast.error("อัปเดต Flag ล้มเหลว");
    }
  };

  // --- Manual Tasks ---
  const handleManualTask = (taskName: string) => {
    addLog({ timestamp: Date.now(), level: "info", message: `▶ เริ่มรัน Task: ${taskName}...` });
    setTimeout(() => {
      addLog({ timestamp: Date.now(), level: "success", message: `✔ Task: ${taskName} ดำเนินการเสร็จสมบูรณ์` });
      toast.success(`${taskName} เรียบร้อย`);
    }, 1500);
  };

  // --- Core Handlers (Schemas, Script, Settings) ---
  const handleOpenSchemaModal = (schema?: SchemaDoc) => {
    if (schema) { setSchemaForm(schema); setIsEditingSchema(true); } 
    else { setSchemaForm({ id: "", description: "", schemaJson: "{\n  \"field_name\": \"type\"\n}" }); setIsEditingSchema(false); }
    setIsSchemaModalOpen(true);
  };

  const handleSaveSchema = async () => {
    if (!schemaForm.id?.trim()) return toast.error("กรุณาระบุชื่อ Collection");
    try {
      JSON.parse(schemaForm.schemaJson || "{}");
      await setDoc(doc(firestore, "system_schemas", schemaForm.id.trim()), {
        description: schemaForm.description || "",
        schemaJson: schemaForm.schemaJson || "{}",
        updatedAt: Date.now()
      }, { merge: true });
      addLog({ timestamp: Date.now(), level: "success", message: `บันทึก Schema: ${schemaForm.id.trim()} สำเร็จ` });
      setIsSchemaModalOpen(false);
    } catch { toast.error("รูปแบบ JSON ไม่ถูกต้อง"); }
  };

  const handleDeleteSchema = (schemaId: string) => {
    setConfirmAction({
      open: true, title: "ลบ Schema", desc: `ยืนยันการลบ Schema ของ ${schemaId}?`,
      action: async () => {
        await deleteDoc(doc(firestore, "system_schemas", schemaId));
        addLog({ timestamp: Date.now(), level: "info", message: `ลบ Schema: ${schemaId}` });
      },
    });
  };

  const handleSaveScriptTemplate = async () => {
    if (!newScriptName.trim()) return;
    try {
      const scriptId = newScriptName.trim().toLowerCase().replace(/\s+/g, '-');
      await setDoc(doc(firestore, "system_scripts", scriptId), {
        name: newScriptName.trim(), code: scriptCode, updatedAt: Date.now()
      });
      addLog({ timestamp: Date.now(), level: "success", message: `บันทึก Template: ${newScriptName.trim()}` });
      setIsSaveScriptModalOpen(false); setNewScriptName("");
    } catch { toast.error("บันทึกล้มเหลว"); }
  };

  const handleDeleteScriptTemplate = (scriptId: string) => {
    setConfirmAction({
      open: true, title: "ลบ Script Template", desc: "ลบ Template นี้ใช่หรือไม่?",
      action: async () => {
        await deleteDoc(doc(firestore, "system_scripts", scriptId));
        addLog({ timestamp: Date.now(), level: "info", message: `ลบ Script Template: ${scriptId}` });
      }
    });
  };

  const handleRunScript = async () => {
    if (!scriptCode.trim()) return;

    // Security: block dangerous patterns before execution
    const blocked = ["window", "document", "localStorage", "sessionStorage", "fetch(", "XMLHttpRequest", "eval(", "Function(", "import(", "require("];
    const lower = scriptCode.toLowerCase();
    const found = blocked.find((b) => lower.includes(b.toLowerCase()));
    if (found) {
      addLog({ timestamp: Date.now(), level: "error", message: `✖ สคริปต์ถูกบล็อค: ไม่อนุญาตให้ใช้ "${found}" เพื่อความปลอดภัย` });
      return;
    }

    setScriptRunning(true);
    addLog({ timestamp: Date.now(), level: "info", message: "▶ เริ่มรันสคริปต์..." });
    const logFn = (msg: string) => addLog({ timestamp: Date.now(), level: "info", message: `[script] ${msg}` });
    try {
      const asyncFn = new Function("db", "log", "collection", "doc", "getDocs", "getDoc", "setDoc", "updateDoc", "deleteDoc", "writeBatch", "query", "where", "orderBy", "limit", `return (async () => { ${scriptCode} })();`);
      await asyncFn(firestore, logFn, collection, doc, getDocs, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, query, where, orderBy, limit);
      addLog({ timestamp: Date.now(), level: "success", message: "✔ สคริปต์ทำงานเสร็จสมบูรณ์" });
    } catch (err: any) { addLog({ timestamp: Date.now(), level: "error", message: `✖ สคริปต์ล้มเหลว: ${err.message}` }); }
    setScriptRunning(false);
  };

  const handleToggleMaintenance = async () => {
    const newVal = !maintenanceMode;
    setConfirmAction({
      open: true, title: newVal ? "เปิด Maintenance" : "ปิด Maintenance", desc: "ยืนยันการเปลี่ยนสถานะระบบ?",
      action: async () => {
        await setDoc(doc(firestore, "system_config", "global"), { maintenance_mode: newVal }, { merge: true });
        addLog({ timestamp: Date.now(), level: newVal ? "warn" : "success", message: `Maintenance Mode -> ${newVal ? "ON" : "OFF"}` });
      },
    });
  };

  const handleBroadcast = async () => {
    if (!broadcastMsg.trim()) return;
    setConfirmAction({
      open: true, title: "ส่งข้อความประกาศ", desc: "ข้อความนี้จะแสดงให้ทุกคนเห็น?",
      action: async () => {
        await setDoc(doc(firestore, "system_config", "global"), { broadcast_message: broadcastMsg.trim() }, { merge: true });
        addLog({ timestamp: Date.now(), level: "success", message: `ส่งประกาศ: ${broadcastMsg.trim()}` });
        setBroadcastMsg("");
      },
    });
  };

  const handleClearBroadcast = async () => {
    await setDoc(doc(firestore, "system_config", "global"), { broadcast_message: "" }, { merge: true });
    addLog({ timestamp: Date.now(), level: "info", message: "ลบข้อความประกาศ" });
  };

  const handleForceRefresh = () => {
    setConfirmAction({
      open: true, title: "Force Refresh", desc: "แอปของผู้ใช้จะถูกรีโหลดทันที ยืนยัน?",
      action: async () => {
        await setDoc(doc(firestore, "system_config", "global"), { force_refresh: Date.now() }, { merge: true });
        addLog({ timestamp: Date.now(), level: "warn", message: "ส่งสัญญาณ Force Refresh ไปยังทุกอุปกรณ์" });
      },
    });
  };

  const handleOrphanScan = async () => {
    setScanning(true);
    addLog({ timestamp: Date.now(), level: "info", message: "เริ่มสแกนข้อมูลกำพร้า..." });
    try { setOrphans(await detectOrphanedData(addLog)); } 
    catch (err: any) { addLog({ timestamp: Date.now(), level: "error", message: `สแกนล้มเหลว: ${err.message}` }); }
    setScanning(false);
  };

  const handleExport = async () => {
    setExporting(true); addLog({ timestamp: Date.now(), level: "info", message: "กำลังสำรองข้อมูล..." });
    try {
      const data = await exportAllData(addLog);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `backup-${format(new Date(), "yyyy-MM-dd-HHmmss")}.json`; a.click(); URL.revokeObjectURL(url);
      toast.success("สำรองข้อมูลสำเร็จ");
    } catch { toast.error("สำรองข้อมูลล้มเหลว"); }
    setExporting(false);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try { const data = JSON.parse(ev.target?.result as string); setImportData(data); setShowDiff(true); } 
      catch { toast.error("อ่านไฟล์ไม่สำเร็จ"); }
    };
    reader.readAsText(file); e.target.value = "";
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
    } catch { toast.error("นำเข้าข้อมูลล้มเหลว"); }
    setImportData(null); setShowDiff(false);
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
      <main className="flex-1 flex flex-col min-h-screen overflow-auto relative bg-muted/10">
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
            <GlobalInsights />
            <ThemeToggle />
            <NotificationBell />
            <UserProfilePopover />
          </div>
        </header>

        <div className="flex-1 p-4 sm:p-6 space-y-6 pb-20">

          {/* ===== 1. Operation Terminal (Full Width) ===== */}
          <Card className="border-border">
            <CardHeader className="pb-3 px-4 pt-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-primary" />
                  Operation Terminal
                </CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setLogs([])} className="h-7 text-xs">
                    <Trash2 className="h-3 w-3 mr-1" /> Clear
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-40 bg-black/90 rounded-b-lg border-t border-border">
                <div className="py-2">
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

          {/* ===== 2. Migration Script Editor (Full Width) ===== */}
          <Card className="border-primary/20 shadow-sm">
            <CardHeader className="pb-3 bg-primary/5 border-b border-primary/10">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Code className="h-4 w-4 text-primary" />
                  Migration Script Editor
                </CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setIsSaveScriptModalOpen(true)} className="gap-1.5 h-7 text-xs bg-background">
                    <BookmarkPlus className="h-3 w-3" /> Save Template
                  </Button>
                  <Button size="sm" onClick={() => setConfirmAction({
                      open: true, title: "รันสคริปต์", desc: "สคริปต์จะทำงานโดยตรงกับฐานข้อมูล ยืนยัน?", action: handleRunScript
                    })} disabled={scriptRunning || !scriptCode.trim()} className="gap-1.5 h-7 text-xs"
                  >
                    {scriptRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />} Run
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              {/* Script Templates Quick Load */}
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                <span className="text-xs font-semibold text-muted-foreground shrink-0 flex items-center gap-1">
                  <Bookmark className="h-3 w-3" /> Templates:
                </span>
                {DEFAULT_SCRIPTS.map(script => (
                  <Badge key={script.id} variant="secondary" className="cursor-pointer whitespace-nowrap hover:bg-secondary/80 text-[10px]" onClick={() => { setScriptCode(script.code); toast.success(`โหลด: ${script.name}`); }}>
                    {script.name}
                  </Badge>
                ))}
                {savedScripts.map(script => (
                  <Badge key={script.id} variant="outline" className="cursor-pointer whitespace-nowrap flex items-center gap-1 hover:bg-muted text-[10px] border-primary/30" onClick={() => { setScriptCode(script.code); toast.success(`โหลด: ${script.name}`); }}>
                    {script.name}
                    <div className="ml-1 p-0.5 rounded-full hover:bg-destructive/20 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDeleteScriptTemplate(script.id); }}>
                      <X className="h-2 w-2" />
                    </div>
                  </Badge>
                ))}
              </div>

              <Textarea
                value={scriptCode}
                onChange={(e) => setScriptCode(e.target.value)}
                className="font-mono text-xs min-h-[220px] bg-muted/30 border-border resize-y leading-relaxed"
                placeholder="// เขียนสคริปต์ migration หรือโหลดจาก Template..."
                spellCheck={false}
              />
            </CardContent>
          </Card>

          {/* ===== 3. Split Layout (Left / Right) with Equal Bottom Heights ===== */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            
            {/* ========== LEFT COLUMN ========== */}
            <div className="xl:col-span-5 flex flex-col gap-6">
              
              {/* Global Controls & Feature Flags */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Radio className="h-4 w-4 text-primary" />
                    Global & Feature Flags
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Global */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium text-foreground">Maintenance Mode</Label>
                      <p className="text-xs text-muted-foreground">จำกัดการเขียนข้อมูลชั่วคราว</p>
                    </div>
                    <Switch checked={maintenanceMode} onCheckedChange={handleToggleMaintenance} />
                  </div>
                  
                  <Separator />
                  
                  {/* Flags */}
                  <div className="space-y-3">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Feature Flags</Label>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Inventory Module</Label>
                      <Switch checked={flags.inventory} onCheckedChange={() => handleToggleFlag("feature_inventory", flags.inventory)} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Investment Module</Label>
                      <Switch checked={flags.investment} onCheckedChange={() => handleToggleFlag("feature_investment", flags.investment)} />
                    </div>
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
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={handleClearBroadcast}>ลบ</Button>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Input value={broadcastMsg} onChange={(e) => setBroadcastMsg(e.target.value)} placeholder="ข้อความประกาศ..." className="flex-1 h-8 text-xs" maxLength={200} />
                      <Button size="sm" onClick={handleBroadcast} disabled={!broadcastMsg.trim()} className="h-8 text-xs">ส่ง</Button>
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <Button onClick={handleForceRefresh} size="sm" variant="destructive" className="w-full justify-start gap-2 h-8 text-xs">
                    <RefreshCw className="h-3.5 w-3.5" /> Force Refresh Clients
                  </Button>
                </CardContent>
              </Card>

              {/* Manual Task Triggers (Flex-1 เพื่อให้ยืดลงไปบรรจบกับขอบล่างของฝั่งขวา) */}
              <Card className="flex flex-col flex-1">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <PlayCircle className="h-4 w-4 text-primary" />
                    Manual Task Triggers
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 flex-1">
                  <Button variant="outline" size="sm" className="w-full justify-start text-xs" onClick={() => handleManualTask("Daily Summary Aggregation")}>
                    <BarChart3 className="h-3.5 w-3.5 mr-2 text-muted-foreground" /> อัปเดตยอดสรุปประจำวัน (Daily Summary)
                  </Button>
                  <Button variant="outline" size="sm" className="w-full justify-start text-xs" onClick={() => handleManualTask("Clear Temp Data")}>
                    <Trash2 className="h-3.5 w-3.5 mr-2 text-muted-foreground" /> ล้างข้อมูลขยะ (Clear Temp Data)
                  </Button>
                  <Button variant="outline" size="sm" className="w-full justify-start text-xs" onClick={() => handleManualTask("Sync Inventory Indexes")}>
                    <Database className="h-3.5 w-3.5 mr-2 text-muted-foreground" /> รีเซ็ตดัชนีสต็อกสินค้า (Sync Inventory)
                  </Button>
                </CardContent>
              </Card>

            </div>

            {/* ========== RIGHT COLUMN ========== */}
            <div className="xl:col-span-7 flex flex-col gap-6">

              {/* Quick User Management (ย้ายมาฝั่งนี้แล้ว) */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Search className="h-4 w-4 text-primary" />
                    Quick User Management
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input 
                      placeholder="ค้นหาด้วย UID หรือ Email..." 
                      className="h-9 text-xs" 
                      value={userSearchQuery}
                      onChange={(e) => setUserSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearchUser()}
                    />
                    <Button size="sm" className="h-9 w-9 p-0 shrink-0" onClick={handleSearchUser} disabled={isSearchingUser}>
                      {isSearchingUser ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </Button>
                  </div>

                  {searchedUser && (
                    <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-sm text-foreground">{searchedUser.email || "No Email"}</p>
                          <p className="text-xs text-muted-foreground font-mono mt-0.5">UID: {searchedUser.uid}</p>
                        </div>
                        {searchedUser.isSuspended && <Badge variant="destructive" className="text-[10px]">Suspended</Badge>}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
                        <Button size="sm" variant="outline" className="text-xs h-8 gap-1" onClick={() => handleUserAction("Force Logout", searchedUser.uid)}>
                          <Unlock className="h-3 w-3" /> Force Logout
                        </Button>
                        <Button 
                          size="sm" 
                          variant={searchedUser.isSuspended ? "default" : "destructive"} 
                          className="text-xs h-8 gap-1" 
                          onClick={() => handleUserAction(searchedUser.isSuspended ? "Unsuspend" : "Suspend", searchedUser.uid)}
                        >
                          <Ban className="h-3 w-3" /> {searchedUser.isSuspended ? "Unsuspend" : "Suspend"}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Database Schemas */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Database className="h-4 w-4 text-primary" />
                      Database Schemas
                    </CardTitle>
                    <Button size="sm" onClick={() => handleOpenSchemaModal()} className="h-7 text-xs gap-1">
                      <Plus className="h-3 w-3" /> Add Schema
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {schemas.length === 0 ? (
                    <div className="text-center py-6 border border-dashed rounded-lg bg-muted/30">
                      <FileJson className="h-6 w-6 mx-auto text-muted-foreground/50 mb-2" />
                      <p className="text-xs text-muted-foreground">ยังไม่มีข้อมูล Schema</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {schemas.map((schema) => (
                        <div key={schema.id} className="relative p-3 rounded-lg border border-border bg-card hover:bg-muted/10 transition-colors group">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <h3 className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                                <FileJson className="h-3 w-3 text-primary" /> {schema.id}
                              </h3>
                              <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{schema.description || "ไม่มีคำอธิบาย"}</p>
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-primary" onClick={() => handleOpenSchemaModal(schema)}><Edit className="h-3 w-3" /></Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteSchema(schema.id)}><Trash2 className="h-3 w-3" /></Button>
                            </div>
                          </div>
                          <div className="bg-muted/50 p-2 rounded text-[10px] font-mono text-muted-foreground h-16 overflow-hidden relative">
                            <pre>{schema.schemaJson}</pre>
                            <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-muted/50 to-transparent" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Scan & Recovery (Flex-1 เพื่อให้ยืดลงไปบรรจบกับขอบล่างของฝั่งซ้าย) */}
              <Card className="flex flex-col flex-1">
                <CardHeader className="pb-3 border-b border-border">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-primary" />
                    Scan & Recovery
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-6 flex-1">
                  
                  {/* --- Section: Data Migration --- */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <DatabaseBackup className="h-4 w-4 text-primary" />
                      <h4 className="text-sm font-semibold text-foreground">Data Migration</h4>
                    </div>
                    <div className="space-y-2">
                      <Button 
                        onClick={() => handleManualTask("Budget Migration")} 
                        size="sm" 
                        className="w-full justify-start gap-2 bg-blue-600 hover:bg-blue-700 text-white h-9"
                      >
                        <Database className="h-4 w-4" /> Budget Migration
                      </Button>
                      <Button 
                        onClick={() => handleManualTask("Account Migration")} 
                        size="sm" 
                        variant="outline"
                        className="w-full justify-start gap-2 h-9"
                      >
                        <Database className="h-4 w-4 text-muted-foreground" /> Account Migration
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  {/* --- Section: Data Scan --- */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Search className="h-3.5 w-3.5 text-muted-foreground" /> Data Scan & Integrity</h4>
                    <Button onClick={handleOrphanScan} disabled={scanning} size="sm" variant="outline" className="w-full justify-start gap-2 border-dashed text-xs h-8">
                      {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} Orphaned Data Scan
                    </Button>
                    {orphans !== null && (
                      <div className="text-xs p-3 rounded-lg bg-muted/50 space-y-1 border border-border">
                        <p className="font-medium text-foreground">ผลลัพธ์: พบ {orphans.length} รายการกำพร้า</p>
                        <div className="max-h-24 overflow-y-auto space-y-1 mt-1">
                          {orphans.slice(0, 5).map((o, i) => <p key={i} className="text-muted-foreground">• {o.id.slice(0, 15)}... — {o.issue}</p>)}
                          {orphans.length > 5 && <p className="text-muted-foreground italic pl-2">...และอีก {orphans.length - 5} รายการ</p>}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <Separator />
                  
                  {/* --- Section: Disaster Recovery --- */}
                  <div className="space-y-3">
                    <div className="flex items-start gap-2">
                      <ShieldAlert className="h-4 w-4 text-[hsl(var(--debt))] shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-semibold text-foreground">Disaster Recovery</h4>
                        <p className="text-[10px] text-muted-foreground">เครื่องมือสำรอง/กู้คืนฐานข้อมูล ระมัดระวังในการใช้งาน</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <Button onClick={() => setConfirmAction({ open: true, title: "สำรองข้อมูล", desc: "ดาวน์โหลดข้อมูลเป็น JSON", action: handleExport })} disabled={exporting} size="sm" className="w-full gap-2 text-xs h-8">
                        {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Backup JSON
                      </Button>
                      <input ref={fileInputRef} type="file" accept=".json" onChange={handleImportFile} className="hidden" />
                      <Button onClick={() => fileInputRef.current?.click()} size="sm" variant="outline" className="w-full gap-2 text-xs h-8">
                        <Upload className="h-3.5 w-3.5" /> Import JSON
                      </Button>
                    </div>
                    {/* Diff Preview */}
                    {showDiff && importData && (
                      <div className="text-xs p-3 mt-2 rounded-lg bg-[hsl(var(--debt))]/10 border border-[hsl(var(--debt))]/20 space-y-2">
                        <p className="font-medium text-foreground">Import Preview:</p>
                        <p className="text-muted-foreground">พบข้อมูล: <span className="text-foreground">{Object.keys(importData.users || {}).length}</span> users</p>
                        <div className="flex gap-2 pt-2 border-t border-[hsl(var(--debt))]/20">
                          <Button size="sm" variant="ghost" onClick={() => { setImportData(null); setShowDiff(false); }} className="flex-1 h-7 text-xs">ยกเลิก</Button>
                          <Button size="sm" variant="destructive" onClick={() => setConfirmAction({ open: true, title: "ยืนยันนำเข้า (อันตราย)", desc: `Merge ข้อมูล ${Object.keys(importData.users || {}).length} users?`, action: handleImportConfirm })} className="flex-1 h-7 text-xs">ยืนยันนำเข้า</Button>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

            </div>
          </div>
        </div>
        <AppFooter />
      </main>

      {/* ===== Custom Native Modal for Schema Form ===== */}
      {isSchemaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="bg-card text-card-foreground border border-border shadow-lg rounded-xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <FileJson className="h-5 w-5 text-primary" />
                {isEditingSchema ? "แก้ไข Schema" : "สร้าง Schema ใหม่"}
              </h2>
              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" onClick={() => setIsSchemaModalOpen(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              <div className="space-y-1.5"><Label>Collection Name *</Label><Input value={schemaForm.id} onChange={(e) => setSchemaForm(p => ({ ...p, id: e.target.value }))} disabled={isEditingSchema} /></div>
              <div className="space-y-1.5"><Label>คำอธิบาย</Label><Input value={schemaForm.description} onChange={(e) => setSchemaForm(p => ({ ...p, description: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>โครงสร้าง JSON *</Label><Textarea value={schemaForm.schemaJson} onChange={(e) => setSchemaForm(p => ({ ...p, schemaJson: e.target.value }))} className="font-mono text-xs min-h-[200px]" spellCheck={false} /></div>
            </div>
            <div className="px-5 py-4 border-t bg-muted/30 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsSchemaModalOpen(false)}>ยกเลิก</Button>
              <Button onClick={handleSaveSchema}>บันทึก</Button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Custom Native Modal for Save Script Form ===== */}
      {isSaveScriptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="bg-card text-card-foreground border border-border shadow-lg rounded-xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <BookmarkPlus className="h-5 w-5 text-primary" />
                บันทึก Script Template
              </h2>
              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" onClick={() => setIsSaveScriptModalOpen(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1.5"><Label>ตั้งชื่อ Template *</Label><Input value={newScriptName} onChange={(e) => setNewScriptName(e.target.value)} autoFocus /></div>
            </div>
            <div className="px-5 py-4 border-t bg-muted/30 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsSaveScriptModalOpen(false)}>ยกเลิก</Button>
              <Button onClick={handleSaveScriptTemplate} disabled={!newScriptName.trim()}>บันทึก</Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      <AlertDialog open={confirmAction.open} onOpenChange={(o) => !o && setConfirmAction((p) => ({ ...p, open: false }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAction.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmAction.desc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              try { await confirmAction.action(); } catch (err: any) { toast.error(err.message || "ล้มเหลว"); }
              setConfirmAction((p) => ({ ...p, open: false }));
            }}>ยืนยัน</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
