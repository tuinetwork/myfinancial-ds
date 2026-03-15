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
  detectOrphanedData, exportAllData,
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
  Loader2, Search, RefreshCw, Megaphone, Plug, CheckCircle, XCircle,
  Info, Trash2, Code, Play, FileJson, Plus, Edit, Save, X, Server, ShieldAlert
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Textarea } from "@/components/ui/textarea";

// ===== Types =====
interface SchemaDoc {
  id: string; // ชื่อ Collection
  description: string;
  schemaJson: string; // โครงสร้าง Fields แบบ JSON
  updatedAt: number;
}

// ===== Tree Node Component สำหรับแสดงข้อมูลแบบ Tree (สีขาว) =====
const TreeNode = ({ label, value, defaultOpen = false, depth = 0 }: { label: string; value: any; defaultOpen?: boolean; depth?: number }) => {
  // กาง Tree โดยอัตโนมัติใน 3 ระดับแรก เพื่อให้เห็นข้อมูลทันที
  const [isOpen, setIsOpen] = useState(defaultOpen || depth < 3);
  
  if (value === null || value === undefined) {
    return (
      <div className="pl-4 py-0.5 border-l border-white/20 font-mono text-xs flex gap-2">
        <span className="text-white opacity-90">{label}:</span>
        <span className="text-white/50 italic">null</span>
      </div>
    );
  }

  if (typeof value === "object" && typeof value.toDate === "function") {
      return (
      <div className="pl-4 py-0.5 border-l border-white/20 font-mono text-xs flex gap-2">
        <span className="text-white opacity-90">{label}:</span>
        <span className="text-white">"{value.toDate().toLocaleString()}"</span>
      </div>
    );
  }

  const isObject = typeof value === "object";
  const isArray = Array.isArray(value);

  if (!isObject) {
    return (
      <div className="pl-4 py-0.5 border-l border-white/20 font-mono text-xs flex gap-2 items-start">
        <span className="text-white opacity-90 shrink-0">{label}:</span>
        <span className="text-white break-all">
          {typeof value === 'string' ? `"${value}"` : String(value)}
        </span>
      </div>
    );
  }

  const keys = Object.keys(value);
  
  if (keys.length === 0) {
    return (
      <div className="pl-4 py-0.5 border-l border-white/20 font-mono text-xs flex gap-2">
        <span className="text-white opacity-90">{label}:</span>
        <span className="text-white/50">{isArray ? "[]" : "{}"}</span>
      </div>
    );
  }

  return (
    <div className="pl-4 py-0.5 border-l border-white/20 font-mono text-xs">
      <div 
        className="flex items-center gap-1 cursor-pointer hover:bg-white/10 rounded px-1 -ml-1 transition-colors select-none w-fit"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="text-white/50 w-3 text-[10px]">{isOpen ? '▼' : '▶'}</span>
        <span className="text-white font-semibold">{label}</span>
        <span className="text-white/50 text-[10px]">
          {isArray ? `[${keys.length}]` : `{${keys.length}}`}
        </span>
      </div>
      {isOpen && (
        <div className="ml-2 mt-0.5">
          {keys.map((key) => (
            <TreeNode key={key} label={key} value={value[key]} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

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
  const [orphans, setOrphans] = useState<OrphanedRecord[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Database Tab States
  const [dbTab, setDbTab] = useState<"schemas" | "data" | "recovery">("schemas");
  
  // Schema States
  const [schemas, setSchemas] = useState<SchemaDoc[]>([]);
  const [isSchemaModalOpen, setIsSchemaModalOpen] = useState(false);
  const [schemaForm, setSchemaForm] = useState<Partial<SchemaDoc>>({
    id: "", description: "", schemaJson: "{\n  \"field_name\": \"string\"\n}"
  });
  const [isEditingSchema, setIsEditingSchema] = useState(false);
  
  // Tree States
  const [allUsersData, setAllUsersData] = useState<Record<string, any> | null>(null);
  const [loadingDataTree, setLoadingDataTree] = useState(false);

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

  // Listen to system_config & schemas
  useEffect(() => {
    if (!mfaVerified) return;
    
    const unsubConfig = onSnapshot(doc(firestore, "system_config", "global"), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setMaintenanceMode(data.maintenance_mode ?? false);
        setCurrentBroadcast(data.broadcast_message ?? "");
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

    return () => {
      unsubConfig();
      unsubSchemas();
    };
  }, [mfaVerified]);

  // ===== Handlers =====
  const handleMfaVerified = () => {
    setMfaVerified(true);
    setShowMfa(false);
    addLog({ timestamp: Date.now(), level: "success", message: "MFA ยืนยันสำเร็จ — เข้าสู่ Command Center" });
  };

  // Schema Handlers
  const handleOpenSchemaModal = (schema?: SchemaDoc) => {
    if (schema) {
      setSchemaForm(schema);
      setIsEditingSchema(true);
    } else {
      setSchemaForm({ id: "", description: "", schemaJson: "{\n  \"field_name\": \"type\"\n}" });
      setIsEditingSchema(false);
    }
    setIsSchemaModalOpen(true);
  };

  const handleSaveSchema = async () => {
    if (!schemaForm.id?.trim()) {
      toast.error("กรุณาระบุชื่อ Collection");
      return;
    }
    try {
      JSON.parse(schemaForm.schemaJson || "{}");
      const schemaData = {
        description: schemaForm.description || "",
        schemaJson: schemaForm.schemaJson || "{}",
        updatedAt: Date.now()
      };
      await setDoc(doc(firestore, "system_schemas", schemaForm.id.trim()), schemaData, { merge: true });
      addLog({ timestamp: Date.now(), level: "success", message: `บันทึก Schema: ${schemaForm.id.trim()} สำเร็จ` });
      toast.success("บันทึก Schema สำเร็จ");
      setIsSchemaModalOpen(false);
    } catch (err: any) {
      toast.error("รูปแบบ JSON ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง");
      addLog({ timestamp: Date.now(), level: "error", message: `JSON Invalid: ${err.message}` });
    }
  };

  const handleDeleteSchema = (schemaId: string) => {
    setConfirmAction({
      open: true,
      title: "ลบ Schema",
      desc: `คุณแน่ใจหรือไม่ที่จะลบ Schema ของ ${schemaId}?`,
      action: async () => {
        await deleteDoc(doc(firestore, "system_schemas", schemaId));
        addLog({ timestamp: Date.now(), level: "info", message: `ลบ Schema: ${schemaId}` });
        toast.success("ลบ Schema สำเร็จ");
      },
    });
  };

  // ดึงข้อมูลแบบแสดงทุกอย่าง (All Collections)
  const fetchAllDataTree = async () => {
    setLoadingDataTree(true);
    addLog({ timestamp: Date.now(), level: "info", message: "กำลังโหลดข้อมูล Live Tree จากทุก Collection ที่ระบุ..." });
    try {
      // 💡 เพิ่มหรือแก้ไขชื่อ Collection ที่เจ้านายมีในระบบตรง Array นี้ได้เลยครับ
      const collectionsToFetch = ["users", "system_schemas", "system_config", "transactions", "inventory", "accounts", "budgets"];
      
      const dbData: Record<string, any> = {};
      let totalDocs = 0;

      for (const colName of collectionsToFetch) {
        try {
          const snap = await getDocs(collection(firestore, colName));
          if (!snap.empty) {
            dbData[colName] = {};
            snap.forEach(doc => {
              dbData[colName][doc.id] = doc.data();
              totalDocs++;
            });
          }
        } catch (e) {
          // ข้าม Collection ที่ไม่มีสิทธิ์เข้าถึงหรือยังไม่มีอยู่จริง
        }
      }

      setAllUsersData(dbData);
      addLog({ timestamp: Date.now(), level: "success", message: `โหลดข้อมูลสำเร็จ พบทั้งหมด ${totalDocs} documents` });
    } catch (error: any) {
      toast.error("ดึงข้อมูลล้มเหลว");
      addLog({ timestamp: Date.now(), level: "error", message: `ดึงข้อมูลล้มเหลว: ${error.message}` });
    }
    setLoadingDataTree(false);
  };

  const handleTabChange = (tab: "schemas" | "data" | "recovery") => {
    setDbTab(tab);
    if (tab === "data" && !allUsersData) {
      fetchAllDataTree();
    }
  };

  // Other Handlers
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
      <main className="flex-1 flex flex-col min-h-screen overflow-auto relative">
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

        <div className="flex-1 p-4 sm:p-6 space-y-6 pb-20">
          
          {/* ===== 1. Operation Terminal (เต็มความกว้างด้านบน) ===== */}
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

          {/* ===== 2. Migration Script Editor (เต็มความกว้าง ต่อจาก Terminal) ===== */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Code className="h-4 w-4 text-primary" />
                  Migration Script Editor
                </CardTitle>
                <Button
                  size="sm"
                  onClick={() => setConfirmAction({
                    open: true,
                    title: "รันสคริปต์ Migration",
                    desc: "สคริปต์จะทำงานโดยตรงกับฐานข้อมูล การกระทำนี้ไม่สามารถย้อนกลับได้ กรุณาตรวจสอบโค้ดให้แน่ใจก่อนดำเนินการ",
                    action: handleRunScript,
                  })}
                  disabled={scriptRunning || !scriptCode.trim()}
                  className="gap-1.5 h-8"
                >
                  {scriptRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  Run Script
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xs text-muted-foreground flex flex-wrap gap-1.5">
                <Badge variant="outline" className="text-[10px] font-mono">db</Badge>
                <Badge variant="outline" className="text-[10px] font-mono">log(msg)</Badge>
                <Badge variant="outline" className="text-[10px] font-mono">collection</Badge>
                <Badge variant="outline" className="text-[10px] font-mono">doc</Badge>
                <Badge variant="outline" className="text-[10px] font-mono">getDocs</Badge>
                <Badge variant="outline" className="text-[10px] font-mono">setDoc</Badge>
                <Badge variant="outline" className="text-[10px] font-mono">updateDoc</Badge>
                <Badge variant="outline" className="text-[10px] font-mono">deleteDoc</Badge>
                <Badge variant="outline" className="text-[10px] font-mono">writeBatch</Badge>
                <Badge variant="outline" className="text-[10px] font-mono">query</Badge>
                <Badge variant="outline" className="text-[10px] font-mono">where</Badge>
              </div>
              <Textarea
                value={scriptCode}
                onChange={(e) => setScriptCode(e.target.value)}
                className="font-mono text-xs min-h-[200px] bg-muted/30 border-border resize-y leading-relaxed"
                placeholder="// เขียนสคริปต์ migration ที่นี่..."
                spellCheck={false}
              />
            </CardContent>
          </Card>

          {/* ===== 3. แบ่ง 2 คอลัมน์ (ซ้าย - ขวา) สำหรับเครื่องมืออื่นๆ ===== */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            
            {/* ========== คอลัมน์ซ้าย ========== */}
            <div className="space-y-6">
              
              {/* Data Scan & Integrity */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Search className="h-4 w-4 text-primary" />
                    Data Scan & Integrity
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
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

              {/* Global Controls */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Radio className="h-4 w-4 text-primary" />
                    Global Controls
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
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

              {/* Cross-App Connector */}
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

            {/* ========== คอลัมน์ขวา ========== */}
            <div className="space-y-6">
              
              {/* Combined Database & Disaster Recovery Card */}
              <Card>
                <CardHeader className="pb-0 border-b border-border">
                  <div className="flex items-center justify-between mb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Database className="h-4 w-4 text-primary" />
                      Database Explorer & Recovery
                    </CardTitle>
                    {dbTab === "schemas" && (
                      <Button size="sm" onClick={() => handleOpenSchemaModal()} className="h-8 gap-1">
                        <Plus className="h-4 w-4" /> Add Schema
                      </Button>
                    )}
                    {dbTab === "data" && (
                      <Button size="sm" onClick={fetchAllDataTree} disabled={loadingDataTree} variant="outline" className="h-8 gap-1">
                        <RefreshCw className={`h-3.5 w-3.5 ${loadingDataTree ? 'animate-spin' : ''}`} /> Reload Data
                      </Button>
                    )}
                  </div>
                  {/* Tabs */}
                  <div className="flex gap-4 overflow-x-auto no-scrollbar">
                    <button 
                      className={`pb-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${dbTab === 'schemas' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                      onClick={() => handleTabChange('schemas')}
                    >
                      <FileJson className="h-3.5 w-3.5" /> Schema
                    </button>
                    <button 
                      className={`pb-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${dbTab === 'data' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                      onClick={() => handleTabChange('data')}
                    >
                      <Server className="h-3.5 w-3.5" /> Live Tree
                    </button>
                    <button 
                      className={`pb-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${dbTab === 'recovery' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                      onClick={() => handleTabChange('recovery')}
                    >
                      <ShieldAlert className="h-3.5 w-3.5" /> Recovery
                    </button>
                  </div>
                </CardHeader>
                
                <CardContent className="pt-4">
                  {/* ----- Tab 1: Schemas ----- */}
                  {dbTab === "schemas" && (
                    schemas.length === 0 ? (
                      <div className="text-center py-8 border border-dashed rounded-lg bg-muted/30">
                        <FileJson className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                        <p className="text-sm text-muted-foreground">ยังไม่มีข้อมูล Schema ในระบบ</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-4">
                        {schemas.map((schema) => (
                          <div key={schema.id} className="relative p-4 rounded-lg border border-border bg-card hover:bg-muted/10 transition-colors group">
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <h3 className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                                  <FileJson className="h-3.5 w-3.5 text-primary" /> {schema.id}
                                </h3>
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                  {schema.description || "ไม่มีคำอธิบาย"}
                                </p>
                              </div>
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => handleOpenSchemaModal(schema)}>
                                  <Edit className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteSchema(schema.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                            <div className="bg-muted/50 p-2 rounded text-[10px] font-mono text-muted-foreground h-20 overflow-hidden relative">
                              <pre>{schema.schemaJson}</pre>
                              <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-muted/50 to-transparent" />
                            </div>
                            <p className="text-[9px] text-muted-foreground mt-2 text-right">
                              Updated: {format(schema.updatedAt, "dd MMM yyyy HH:mm")}
                            </p>
                          </div>
                        ))}
                      </div>
                    )
                  )}

                  {/* ----- Tab 2: Data Tree ----- */}
                  {dbTab === "data" && (
                    <div className="rounded-md border border-border bg-[#1e1e1e] overflow-hidden">
                      {loadingDataTree ? (
                        <div className="flex flex-col items-center justify-center h-[450px] space-y-3">
                          <Loader2 className="h-6 w-6 animate-spin text-primary" />
                          <p className="text-xs text-muted-foreground">กำลังโหลดข้อมูลจากทุก Collection...</p>
                        </div>
                      ) : allUsersData ? (
                        <ScrollArea className="h-[500px] w-full p-4">
                          <TreeNode label="database_root" value={allUsersData} defaultOpen={true} depth={0} />
                        </ScrollArea>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-[450px] space-y-3 text-muted-foreground">
                          <Server className="h-8 w-8 opacity-20" />
                          <p className="text-xs">คลิก "Reload Data" เพื่อดึงข้อมูลทั้งหมด</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ----- Tab 3: Disaster Recovery ----- */}
                  {dbTab === "recovery" && (
                    <div className="space-y-4">
                      <div className="p-4 rounded-lg bg-[hsl(var(--debt))]/10 border border-[hsl(var(--debt))]/20 flex items-start gap-3">
                        <ShieldAlert className="h-5 w-5 text-[hsl(var(--debt))] shrink-0 mt-0.5" />
                        <div>
                          <h4 className="text-sm font-semibold text-foreground">Disaster Recovery Zone</h4>
                          <p className="text-xs text-muted-foreground mt-1">เครื่องมือสำหรับสำรองและกู้คืนฐานข้อมูล กรุณาใช้งานด้วยความระมัดระวัง</p>
                        </div>
                      </div>

                      <div className="space-y-3 pt-2">
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
                          className="w-full justify-start gap-2 border-dashed"
                        >
                          <Upload className="h-4 w-4" />
                          Import from JSON
                        </Button>
                      </div>

                      {/* Diff Preview */}
                      {showDiff && importData && (
                        <div className="text-xs p-3 mt-4 rounded-lg bg-muted/50 space-y-2 border border-border">
                          <p className="font-medium text-foreground">Import Preview:</p>
                          <p className="text-muted-foreground">
                            พบผู้ใช้: <span className="text-foreground">{Object.keys(importData.users || {}).length}</span> รายการ | 
                            วันที่ Export: <span className="text-foreground">{importData.exported_at || "N/A"}</span>
                          </p>
                          <div className="max-h-32 overflow-y-auto space-y-1 my-2">
                            {Object.entries(importData.users || {}).slice(0, 5).map(([uid, data]: [string, any]) => (
                              <div key={uid} className="pl-2 border-l-2 border-primary/30">
                                <p className="text-foreground">{uid.slice(0, 15)}...</p>
                                <p className="text-muted-foreground text-[10px]">
                                  Sub: {Object.keys(data.subcollections || {}).join(", ") || "none"}
                                </p>
                              </div>
                            ))}
                            {Object.keys(importData.users || {}).length > 5 && (
                              <p className="text-muted-foreground italic pl-2">...และอีกมากมาย</p>
                            )}
                          </div>
                          <div className="flex gap-2 pt-2 border-t border-border">
                            <Button size="sm" variant="ghost" onClick={() => { setImportData(null); setShowDiff(false); }} className="flex-1">
                              ยกเลิก
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setConfirmAction({
                                open: true, title: "ยืนยันนำเข้าข้อมูล (อันตราย)",
                                desc: `ระบบจะทำการ Merge ข้อมูล ${Object.keys(importData.users || {}).length} ผู้ใช้ เข้าสู่ฐานข้อมูลหลักทันที คุณแน่ใจหรือไม่?`,
                                action: handleImportConfirm,
                              })}
                              className="flex-1 gap-1"
                            >
                              <ShieldAlert className="h-3.5 w-3.5" /> ยืนยันนำเข้า
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
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
              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" onClick={() => setIsSchemaModalOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              <div className="space-y-1.5">
                <Label htmlFor="schema-id">Collection Name <span className="text-destructive">*</span></Label>
                <Input 
                  id="schema-id" 
                  placeholder="เช่น users, transactions" 
                  value={schemaForm.id} 
                  onChange={(e) => setSchemaForm(p => ({ ...p, id: e.target.value }))}
                  disabled={isEditingSchema}
                />
              </div>
              
              <div className="space-y-1.5">
                <Label htmlFor="schema-desc">คำอธิบาย</Label>
                <Input 
                  id="schema-desc" 
                  placeholder="เช่น ข้อมูลผู้ใช้งานระบบ" 
                  value={schemaForm.description} 
                  onChange={(e) => setSchemaForm(p => ({ ...p, description: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="schema-json" className="flex items-center justify-between">
                  <span>โครงสร้าง JSON <span className="text-destructive">*</span></span>
                  <Badge variant="outline" className="text-[10px] font-mono">Format: JSON</Badge>
                </Label>
                <Textarea 
                  id="schema-json" 
                  placeholder='{ "field_name": "string" }' 
                  value={schemaForm.schemaJson} 
                  onChange={(e) => setSchemaForm(p => ({ ...p, schemaJson: e.target.value }))}
                  className="font-mono text-xs min-h-[200px]"
                  spellCheck={false}
                />
              </div>
            </div>

            <div className="px-5 py-4 border-t bg-muted/30 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsSchemaModalOpen(false)}>ยกเลิก</Button>
              <Button onClick={handleSaveSchema} className="gap-2">
                <Save className="h-4 w-4" /> บันทึก
              </Button>
            </div>
          </div>
        </div>
      )}

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
