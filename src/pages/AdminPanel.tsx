import { useEffect, useState } from "react";
import { collection, getDocs, doc, setDoc, getDoc, deleteDoc, updateDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { AppFooter } from "@/components/AppFooter";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { UserProfilePopover } from "@/components/UserProfilePopover";
import { NotificationBell } from "@/components/NotificationBell";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CheckCircle, XCircle, Loader2, ShieldCheck, Users, UsersRound,
  Pencil, Trash2, Ban, Database,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import { runBudgetMigration, type MigrationProgress } from "@/scripts/migrateBudgetStructure";

const SOURCE_USER_UID = "xgkdmyxxeJVlNiqoahNJWBekqmh2";

async function initializeNewUser(userId: string) {
  try {
    for (const catType of ["expense", "income"]) {
      const sourceDoc = await getDoc(doc(firestore, "users", SOURCE_USER_UID, "categories", catType));
      if (sourceDoc.exists()) {
        await setDoc(doc(firestore, "users", userId, "categories", catType), sourceDoc.data());
      }
    }
    const currentPeriod = format(new Date(), "yyyy-MM");
    const budgetDoc = await getDoc(doc(firestore, "users", SOURCE_USER_UID, "budgets", currentPeriod));
    if (budgetDoc.exists()) {
      const sourceData = budgetDoc.data();
      const newBudgetData: Record<string, any> = { carry_over: 0, period: currentPeriod };
      for (const fieldKey of Object.keys(sourceData)) {
        if (fieldKey === "carry_over" || fieldKey === "period") continue;
        const fieldValue = sourceData[fieldKey];
        if (fieldValue && typeof fieldValue === "object") {
          const resetGroup: Record<string, any> = {};
          for (const groupKey of Object.keys(fieldValue)) {
            const groupValue = fieldValue[groupKey];
            if (groupValue && typeof groupValue === "object") {
              const resetSubcats: Record<string, number> = {};
              for (const subKey of Object.keys(groupValue)) resetSubcats[subKey] = 0;
              resetGroup[groupKey] = resetSubcats;
            } else {
              resetGroup[groupKey] = 0;
            }
          }
          newBudgetData[fieldKey] = resetGroup;
        } else {
          newBudgetData[fieldKey] = 0;
        }
      }
      await setDoc(doc(firestore, "users", userId, "budgets", currentPeriod), newBudgetData);
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

interface UserInfo {
  id: string;
  display_name: string;
  email: string;
  role: string;
  created_at: any;
  banned?: boolean;
}

export default function AdminPanel() {
  const { userRole, userId, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const isDev = userRole === "dev";
  const isAdmin = userRole === "dev" || userRole === "admin";

  // ===== Requester state =====
  const [requesters, setRequesters] = useState<Requester[]>([]);
  const [reqLoading, setReqLoading] = useState(true);
  const [reqActionLoading, setReqActionLoading] = useState<string | null>(null);
  const [reqConfirm, setReqConfirm] = useState<{
    open: boolean; type: "approve" | "reject"; requester: Requester | null;
  }>({ open: false, type: "approve", requester: null });

  // ===== User Management state =====
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [userActionLoading, setUserActionLoading] = useState<string | null>(null);
  const [editDialog, setEditDialog] = useState<{ open: boolean; user: UserInfo | null }>({ open: false, user: null });
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [userConfirm, setUserConfirm] = useState<{
    open: boolean; type: "delete" | "ban" | "unban"; user: UserInfo | null;
  }>({ open: false, type: "delete", user: null });
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  useEffect(() => {
    if (!authLoading && !isAdmin) navigate("/");
  }, [userRole, authLoading, navigate, isAdmin]);

  // ===== Realtime Requester listener =====
  useEffect(() => {
    if (!isAdmin) return;
    setReqLoading(true);
    const unsub = onSnapshot(collection(firestore, "requester"), (snapshot) => {
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Requester));
      data.sort((a, b) => (b.created_at?.toMillis?.() || 0) - (a.created_at?.toMillis?.() || 0));
      setRequesters(data);
      setReqLoading(false);
    }, (error) => {
      console.error("Error listening to requesters:", error);
      toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถโหลดรายการ requester ได้", variant: "destructive" });
      setReqLoading(false);
    });
    return () => unsub();
  }, [isAdmin]);

  // ===== Requester functions =====
  const handleApprove = async (req: Requester) => {
    setReqActionLoading(req.id);
    try {
      await setDoc(doc(firestore, "users", req.id), {
        display_name: req.display_name, email: req.email, role: "user", created_at: serverTimestamp(),
      });
      await initializeNewUser(req.id);
      await deleteDoc(doc(firestore, "requester", req.id));
      toast({ title: "อนุมัติสำเร็จ", description: `${req.display_name} ได้รับการอนุมัติแล้ว` });
    } catch {
      toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถอนุมัติผู้ใช้ได้", variant: "destructive" });
    } finally {
      setReqActionLoading(null);
    }
  };

  const handleReject = async (req: Requester) => {
    setReqActionLoading(req.id);
    try {
      await deleteDoc(doc(firestore, "requester", req.id));
      toast({ title: "ปฏิเสธสำเร็จ", description: `${req.display_name} ถูกปฏิเสธแล้ว` });
    } catch {
      toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถปฏิเสธผู้ใช้ได้", variant: "destructive" });
    } finally {
      setReqActionLoading(null);
    }
  };

  // ===== Realtime User listener =====
  useEffect(() => {
    if (!isAdmin) return;
    setUsersLoading(true);
    const unsub = onSnapshot(collection(firestore, "users"), (snapshot) => {
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as UserInfo));
      const roleOrder: Record<string, number> = { dev: 0, admin: 1, user: 2 };
      data.sort((a, b) => (roleOrder[a.role] ?? 3) - (roleOrder[b.role] ?? 3));
      setUsers(data);
      setUsersLoading(false);
    }, (error) => {
      console.error("Error listening to users:", error);
      toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถโหลดรายการผู้ใช้ได้", variant: "destructive" });
      setUsersLoading(false);
    });
    return () => unsub();
  }, [isAdmin]);

  const canManage = (targetUser: UserInfo) => {
    if (targetUser.id === userId) return false;
    if (targetUser.role === "dev") return false;
    if (isDev) return true;
    if (userRole === "admin" && targetUser.role === "user") return true;
    return false;
  };

  const handleEdit = (user: UserInfo) => {
    setEditName(user.display_name);
    setEditRole(user.role);
    setEditDialog({ open: true, user });
  };

  const handleSaveEdit = async () => {
    if (!editDialog.user) return;
    setUserActionLoading(editDialog.user.id);
    try {
      await updateDoc(doc(firestore, "users", editDialog.user.id), { display_name: editName, role: editRole });
      setUsers((prev) => prev.map((u) => u.id === editDialog.user!.id ? { ...u, display_name: editName, role: editRole } : u));
      toast({ title: "บันทึกสำเร็จ", description: `อัปเดตข้อมูล ${editName} แล้ว` });
      setEditDialog({ open: false, user: null });
    } catch {
      toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถแก้ไขผู้ใช้ได้", variant: "destructive" });
    } finally {
      setUserActionLoading(null);
    }
  };

  const deleteSubcollection = async (userId: string, subcol: string) => {
    const snap = await getDocs(collection(firestore, "users", userId, subcol));
    const deletes = snap.docs.map((d) => deleteDoc(d.ref));
    await Promise.all(deletes);
  };

  const handleDeleteUser = async (user: UserInfo) => {
    setUserActionLoading(user.id);
    try {
      await Promise.all([
        deleteSubcollection(user.id, "transactions"),
        deleteSubcollection(user.id, "budgets"),
        deleteSubcollection(user.id, "categories"),
      ]);
      await deleteDoc(doc(firestore, "users", user.id));
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      toast({ title: "ลบสำเร็จ", description: `${user.display_name} และข้อมูลทั้งหมดถูกลบออกจากระบบแล้ว` });
    } catch {
      toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถลบผู้ใช้ได้", variant: "destructive" });
    } finally {
      setUserActionLoading(null);
    }
  };

  const handleBanToggle = async (user: UserInfo) => {
    setUserActionLoading(user.id);
    const newBanned = !user.banned;
    try {
      await updateDoc(doc(firestore, "users", user.id), { banned: newBanned });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, banned: newBanned } : u)));
      toast({
        title: newBanned ? "แบนสำเร็จ" : "ปลดแบนสำเร็จ",
        description: `${user.display_name} ${newBanned ? "ถูกแบนแล้ว" : "ถูกปลดแบนแล้ว"}`,
      });
    } catch {
      toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถดำเนินการได้", variant: "destructive" });
    } finally {
      setUserActionLoading(null);
    }
  };


  const formatDate = (val: any) => {
    if (val?.toDate) return format(val.toDate(), "d MMM yyyy HH:mm", { locale: th });
    if (typeof val === "number") return format(new Date(val), "d MMM yyyy HH:mm", { locale: th });
    return "-";
  };

  const roleBadge = (role: string, banned?: boolean) => {
    if (banned) return <Badge variant="destructive">แบน</Badge>;
    switch (role) {
      case "dev": return <Badge className="bg-purple-600 text-white">Dev</Badge>;
      case "admin": return <Badge className="bg-blue-600 text-white">Admin</Badge>;
      default: return <Badge variant="secondary">User</Badge>;
    }
  };

  if (authLoading || !isAdmin) return null;

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
          {/* ===== Migration Tool (Dev only) ===== */}
          {isDev && <MigrationCard />}

          {/* ===== ตารางที่ 1: รออนุมัติ (Realtime) ===== */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">รออนุมัติ</CardTitle>
                  {requesters.length > 0 && (
                    <Badge variant="destructive" className="h-5 px-1.5 text-xs animate-pulse">
                      {requesters.length}
                    </Badge>
                  )}
                </div>
                <Badge variant="outline" className="text-xs gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                  Realtime
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {reqLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : requesters.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">ไม่มีผู้ใช้ที่รออนุมัติ</p>
                </div>
              ) : (
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ชื่อ</TableHead>
                        <TableHead className="hidden sm:table-cell">อีเมล</TableHead>
                        <TableHead className="hidden md:table-cell">สถานะ</TableHead>
                        <TableHead className="hidden lg:table-cell">วันที่สมัคร</TableHead>
                        <TableHead className="text-right">จัดการ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {requesters.map((req) => (
                        <TableRow key={req.id}>
                          <TableCell>
                            <div className="font-medium">{req.display_name || "-"}</div>
                            <div className="text-xs text-muted-foreground sm:hidden">{req.email}</div>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">{req.email}</TableCell>
                          <TableCell className="hidden md:table-cell">
                            <Badge variant="outline" className="text-yellow-600 border-yellow-300 bg-yellow-50">
                              {req.role || "pending"}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">{formatDate(req.created_at)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1 sm:gap-2">
                              <Button size="sm" variant="default" disabled={reqActionLoading === req.id}
                                onClick={() => setReqConfirm({ open: true, type: "approve", requester: req })}>
                                {reqActionLoading === req.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5 sm:mr-1" />}
                                <span className="hidden sm:inline">อนุมัติ</span>
                              </Button>
                              <Button size="sm" variant="destructive" disabled={reqActionLoading === req.id}
                                onClick={() => setReqConfirm({ open: true, type: "reject", requester: req })}>
                                {reqActionLoading === req.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5 sm:mr-1" />}
                                <span className="hidden sm:inline">ปฏิเสธ</span>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ===== ตารางที่ 2: จัดการผู้ใช้ ===== */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UsersRound className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">จัดการผู้ใช้</CardTitle>
                  <Badge variant="secondary">{users.length}</Badge>
                </div>
                <Badge variant="outline" className="text-xs gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                  Realtime
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {usersLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : users.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <UsersRound className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">ไม่มีผู้ใช้ในระบบ</p>
                </div>
              ) : (
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ชื่อ</TableHead>
                        <TableHead className="hidden sm:table-cell">อีเมล</TableHead>
                        <TableHead>สถานะ</TableHead>
                        <TableHead className="hidden lg:table-cell">วันที่สร้าง</TableHead>
                        <TableHead className="text-right">จัดการ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((user) => {
                        const manageable = canManage(user);
                        return (
                          <TableRow key={user.id} className={user.banned ? "opacity-50" : ""}>
                            <TableCell>
                              <div className="font-medium">{user.display_name || "-"}</div>
                              <div className="text-xs text-muted-foreground sm:hidden">{user.email}</div>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">{user.email}</TableCell>
                            <TableCell>{roleBadge(user.role, user.banned)}</TableCell>
                            <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">{formatDate(user.created_at)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button size="icon" variant="ghost" className="h-8 w-8"
                                  disabled={userActionLoading === user.id || !manageable}
                                  onClick={() => handleEdit(user)} title="แก้ไข">
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8"
                                  disabled={userActionLoading === user.id || !manageable}
                                  onClick={() => setUserConfirm({ open: true, type: user.banned ? "unban" : "ban", user })}
                                  title={user.banned ? "ปลดแบน" : "แบน"}>
                                  <Ban className={`h-3.5 w-3.5 ${user.banned ? "text-destructive" : ""}`} />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive"
                                  disabled={userActionLoading === user.id || !manageable}
                                  onClick={() => setUserConfirm({ open: true, type: "delete", user })}
                                  title="ลบ">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        <AppFooter />
      </main>

      {/* Requester Confirm Dialog */}
      <AlertDialog open={reqConfirm.open} onOpenChange={(open) => !open && setReqConfirm({ open: false, type: "approve", requester: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{reqConfirm.type === "approve" ? "ยืนยันการอนุมัติ" : "ยืนยันการปฏิเสธ"}</AlertDialogTitle>
            <AlertDialogDescription>
              {reqConfirm.type === "approve"
                ? `คุณต้องการอนุมัติ ${reqConfirm.requester?.display_name} (${reqConfirm.requester?.email}) ให้เข้าใช้งานระบบหรือไม่?`
                : `คุณต้องการปฏิเสธ ${reqConfirm.requester?.display_name} (${reqConfirm.requester?.email}) หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!reqConfirm.requester) return;
                reqConfirm.type === "approve" ? handleApprove(reqConfirm.requester) : handleReject(reqConfirm.requester);
                setReqConfirm({ open: false, type: "approve", requester: null });
              }}
              className={reqConfirm.type === "reject" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              {reqConfirm.type === "approve" ? "อนุมัติ" : "ปฏิเสธ"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit User Dialog */}
      <Dialog open={editDialog.open} onOpenChange={(open) => !open && setEditDialog({ open: false, user: null })}>
        <DialogContent>
          <DialogHeader><DialogTitle>แก้ไขผู้ใช้</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>ชื่อ</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  {isDev && <SelectItem value="admin">Admin</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">อีเมล: {editDialog.user?.email}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog({ open: false, user: null })}>ยกเลิก</Button>
            <Button onClick={handleSaveEdit} disabled={userActionLoading === editDialog.user?.id}>
              {userActionLoading === editDialog.user?.id && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              บันทึก
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User Action Confirm Dialog - Delete with name typing */}
      {userConfirm.type === "delete" ? (
        <Dialog open={userConfirm.open} onOpenChange={(open) => {
          if (!open) { setUserConfirm({ open: false, type: "delete", user: null }); setDeleteConfirmText(""); }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-destructive">ยืนยันการลบผู้ใช้</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                การลบ <span className="font-semibold text-foreground">{userConfirm.user?.display_name}</span> ({userConfirm.user?.email}) จะลบข้อมูลทั้งหมดรวมถึงธุรกรรม งบประมาณ และหมวดหมู่ การกระทำนี้ไม่สามารถย้อนกลับได้
              </p>
              <div className="space-y-2">
                <Label>พิมพ์ชื่อ <span className="font-semibold">{userConfirm.user?.display_name}</span> เพื่อยืนยัน</Label>
                <Input
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder={userConfirm.user?.display_name || ""}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setUserConfirm({ open: false, type: "delete", user: null }); setDeleteConfirmText(""); }}>ยกเลิก</Button>
              <Button
                variant="destructive"
                disabled={deleteConfirmText !== userConfirm.user?.display_name || userActionLoading === userConfirm.user?.id}
                onClick={() => {
                  if (!userConfirm.user) return;
                  handleDeleteUser(userConfirm.user);
                  setUserConfirm({ open: false, type: "delete", user: null });
                  setDeleteConfirmText("");
                }}
              >
                {userActionLoading === userConfirm.user?.id && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                ลบผู้ใช้
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : (
        <AlertDialog open={userConfirm.open} onOpenChange={(open) => !open && setUserConfirm({ open: false, type: "delete", user: null })}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {userConfirm.type === "ban" ? "ยืนยันการแบน" : "ยืนยันการปลดแบน"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {userConfirm.type === "ban"
                  ? `คุณต้องการแบน ${userConfirm.user?.display_name} (${userConfirm.user?.email}) หรือไม่?`
                  : `คุณต้องการปลดแบน ${userConfirm.user?.display_name} (${userConfirm.user?.email}) หรือไม่?`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (!userConfirm.user) return;
                  handleBanToggle(userConfirm.user);
                  setUserConfirm({ open: false, type: "delete", user: null });
                }}
                className={userConfirm.type === "ban" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
              >
                {userConfirm.type === "ban" ? "แบน" : "ปลดแบน"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
