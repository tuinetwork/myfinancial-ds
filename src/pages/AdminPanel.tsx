import { useEffect, useState } from "react";
import { collection, getDocs, doc, setDoc, getDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { UserProfilePopover } from "@/components/UserProfilePopover";
import { NotificationBell } from "@/components/NotificationBell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Loader2, ShieldCheck, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { th } from "date-fns/locale";

const SOURCE_USER_UID = "xgkdmyxxeJVlNiqoahNJWBekqmh2";

async function initializeNewUser(userId: string) {
  try {
    // Copy categories (expense & income)
    for (const catType of ["expense", "income"]) {
      const sourceDoc = await getDoc(doc(firestore, "users", SOURCE_USER_UID, "categories", catType));
      if (sourceDoc.exists()) {
        await setDoc(doc(firestore, "users", userId, "categories", catType), sourceDoc.data());
      }
    }

    // Copy current month's budget with carry_over reset to 0
    const currentPeriod = format(new Date(), "yyyy-MM");
    const budgetDoc = await getDoc(doc(firestore, "users", SOURCE_USER_UID, "budgets", currentPeriod));
    if (budgetDoc.exists()) {
      const budgetData = { ...budgetDoc.data() };
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

interface Requester {
  id: string;
  display_name: string;
  email: string;
  role: string;
  created_at: any;
}

export default function AdminPanel() {
  const { userRole, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [requesters, setRequesters] = useState<Requester[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    type: "approve" | "reject";
    requester: Requester | null;
  }>({ open: false, type: "approve", requester: null });

  useEffect(() => {
    if (!authLoading && userRole !== "dev" && userRole !== "admin") {
      navigate("/");
    }
  }, [userRole, authLoading, navigate]);

  const fetchRequesters = async () => {
    setLoading(true);
    try {
      const snapshot = await getDocs(collection(firestore, "requester"));
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Requester));
      data.sort((a, b) => {
        const ta = a.created_at?.toMillis?.() || 0;
        const tb = b.created_at?.toMillis?.() || 0;
        return tb - ta;
      });
      setRequesters(data);
    } catch (error) {
      console.error("Error fetching requesters:", error);
      toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถโหลดรายการ requester ได้", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userRole === "dev" || userRole === "admin") {
      fetchRequesters();
    }
  }, [userRole]);

  const handleApprove = async (req: Requester) => {
    setActionLoading(req.id);
    try {
      // 1. Create user document
      await setDoc(doc(firestore, "users", req.id), {
        display_name: req.display_name,
        email: req.email,
        role: "user",
        created_at: serverTimestamp(),
      });

      // 2. Initialize categories & budget for new user
      await initializeNewUser(req.id);

      // 3. Remove from requester
      await deleteDoc(doc(firestore, "requester", req.id));
      setRequesters((prev) => prev.filter((r) => r.id !== req.id));
      toast({ title: "อนุมัติสำเร็จ", description: `${req.display_name} ได้รับการอนุมัติและเริ่มต้นข้อมูลแล้ว` });
    } catch (error) {
      console.error("Approve error:", error);
      toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถอนุมัติผู้ใช้ได้", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (req: Requester) => {
    setActionLoading(req.id);
    try {
      await deleteDoc(doc(firestore, "requester", req.id));
      setRequesters((prev) => prev.filter((r) => r.id !== req.id));
      toast({ title: "ปฏิเสธสำเร็จ", description: `${req.display_name} ถูกปฏิเสธแล้ว` });
    } catch (error) {
      console.error("Reject error:", error);
      toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถปฏิเสธผู้ใช้ได้", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const onConfirm = () => {
    if (!confirmDialog.requester) return;
    if (confirmDialog.type === "approve") {
      handleApprove(confirmDialog.requester);
    } else {
      handleReject(confirmDialog.requester);
    }
    setConfirmDialog({ open: false, type: "approve", requester: null });
  };

  if (authLoading || (userRole !== "dev" && userRole !== "admin")) {
    return null;
  }

  return (
    <>
      <AppSidebar />
      <main className="flex-1 flex flex-col min-h-screen overflow-auto">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 sm:px-6">
          <SidebarTrigger />
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Admin Panel</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell />
            <UserProfilePopover />
          </div>
        </header>

        <div className="flex-1 p-4 sm:p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-base font-medium">รายการผู้ใช้ที่รออนุมัติ</h2>
              <Badge variant="secondary">{requesters.length}</Badge>
            </div>
            <Button variant="outline" size="sm" onClick={fetchRequesters} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "รีเฟรช"}
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : requesters.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>ไม่มีผู้ใช้ที่รออนุมัติ</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ชื่อ</TableHead>
                    <TableHead>อีเมล</TableHead>
                    <TableHead>สถานะ</TableHead>
                    <TableHead>วันที่สมัคร</TableHead>
                    <TableHead className="text-right">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requesters.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium">{req.display_name || "-"}</TableCell>
                      <TableCell>{req.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-yellow-600 border-yellow-300 bg-yellow-50">
                          {req.role || "pending"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {req.created_at?.toDate
                          ? format(req.created_at.toDate(), "d MMM yyyy HH:mm", { locale: th })
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="default"
                            disabled={actionLoading === req.id}
                            onClick={() => setConfirmDialog({ open: true, type: "approve", requester: req })}
                          >
                            {actionLoading === req.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CheckCircle className="h-3.5 w-3.5 mr-1" />
                            )}
                            อนุมัติ
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={actionLoading === req.id}
                            onClick={() => setConfirmDialog({ open: true, type: "reject", requester: req })}
                          >
                            {actionLoading === req.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5 mr-1" />
                            )}
                            ปฏิเสธ
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </main>

      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => !open && setConfirmDialog({ open: false, type: "approve", requester: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog.type === "approve" ? "ยืนยันการอนุมัติ" : "ยืนยันการปฏิเสธ"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.type === "approve"
                ? `คุณต้องการอนุมัติ ${confirmDialog.requester?.display_name} (${confirmDialog.requester?.email}) ให้เข้าใช้งานระบบหรือไม่?`
                : `คุณต้องการปฏิเสธ ${confirmDialog.requester?.display_name} (${confirmDialog.requester?.email}) หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirm}
              className={confirmDialog.type === "reject" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              {confirmDialog.type === "approve" ? "อนุมัติ" : "ปฏิเสธ"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
