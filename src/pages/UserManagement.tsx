import { useEffect, useState } from "react";
import { collection, getDocs, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
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
import { Loader2, UsersRound, Pencil, Trash2, Ban, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { th } from "date-fns/locale";

interface UserInfo {
  id: string;
  display_name: string;
  email: string;
  role: string;
  created_at: any;
  banned?: boolean;
}

export default function UserManagement() {
  const { userRole, userId, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Edit dialog
  const [editDialog, setEditDialog] = useState<{ open: boolean; user: UserInfo | null }>({
    open: false, user: null,
  });
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");

  // Confirm dialog
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    type: "delete" | "ban" | "unban";
    user: UserInfo | null;
  }>({ open: false, type: "delete", user: null });

  const isAdmin = userRole === "dev" || userRole === "admin";

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      navigate("/");
    }
  }, [userRole, authLoading, navigate, isAdmin]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const snapshot = await getDocs(collection(firestore, "users"));
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as UserInfo));
      data.sort((a, b) => {
        const roleOrder: Record<string, number> = { dev: 0, admin: 1, user: 2 };
        return (roleOrder[a.role] ?? 3) - (roleOrder[b.role] ?? 3);
      });
      setUsers(data);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถโหลดรายการผู้ใช้ได้", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) fetchUsers();
  }, [isAdmin]);

  const handleEdit = (user: UserInfo) => {
    setEditName(user.display_name);
    setEditRole(user.role);
    setEditDialog({ open: true, user });
  };

  const handleSaveEdit = async () => {
    if (!editDialog.user) return;
    setActionLoading(editDialog.user.id);
    try {
      await updateDoc(doc(firestore, "users", editDialog.user.id), {
        display_name: editName,
        role: editRole,
      });
      setUsers((prev) =>
        prev.map((u) =>
          u.id === editDialog.user!.id ? { ...u, display_name: editName, role: editRole } : u
        )
      );
      toast({ title: "บันทึกสำเร็จ", description: `อัปเดตข้อมูล ${editName} แล้ว` });
      setEditDialog({ open: false, user: null });
    } catch (error) {
      console.error("Edit error:", error);
      toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถแก้ไขผู้ใช้ได้", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (user: UserInfo) => {
    setActionLoading(user.id);
    try {
      await deleteDoc(doc(firestore, "users", user.id));
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      toast({ title: "ลบสำเร็จ", description: `${user.display_name} ถูกลบออกจากระบบแล้ว` });
    } catch (error) {
      console.error("Delete error:", error);
      toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถลบผู้ใช้ได้", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleBanToggle = async (user: UserInfo) => {
    setActionLoading(user.id);
    const newBanned = !user.banned;
    try {
      await updateDoc(doc(firestore, "users", user.id), { banned: newBanned });
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, banned: newBanned } : u))
      );
      toast({
        title: newBanned ? "แบนสำเร็จ" : "ปลดแบนสำเร็จ",
        description: `${user.display_name} ${newBanned ? "ถูกแบนแล้ว" : "ถูกปลดแบนแล้ว"}`,
      });
    } catch (error) {
      console.error("Ban toggle error:", error);
      toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถดำเนินการได้", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const onConfirm = () => {
    if (!confirmDialog.user) return;
    if (confirmDialog.type === "delete") {
      handleDelete(confirmDialog.user);
    } else {
      handleBanToggle(confirmDialog.user);
    }
    setConfirmDialog({ open: false, type: "delete", user: null });
  };

  const formatDate = (val: any) => {
    if (val?.toDate) return format(val.toDate(), "d MMM yyyy HH:mm", { locale: th });
    if (typeof val === "number") return format(new Date(val), "d MMM yyyy HH:mm", { locale: th });
    return "-";
  };

  const roleBadge = (role: string, banned?: boolean) => {
    if (banned)
      return <Badge variant="destructive">แบน</Badge>;
    switch (role) {
      case "dev":
        return <Badge className="bg-purple-600 text-white">Dev</Badge>;
      case "admin":
        return <Badge className="bg-blue-600 text-white">Admin</Badge>;
      default:
        return <Badge variant="secondary">User</Badge>;
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
            <UsersRound className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">จัดการผู้ใช้</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell />
            <UserProfilePopover />
          </div>
        </header>

        <div className="flex-1 p-4 sm:p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UsersRound className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-base font-medium">ผู้ใช้ทั้งหมด</h2>
              <Badge variant="secondary">{users.length}</Badge>
            </div>
            <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "รีเฟรช"}
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <UsersRound className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>ไม่มีผู้ใช้ในระบบ</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ชื่อ</TableHead>
                    <TableHead>อีเมล</TableHead>
                    <TableHead>สถานะ</TableHead>
                    <TableHead>วันที่สร้าง</TableHead>
                    <TableHead className="text-right">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => {
                    const isSelf = user.id === userId;
                    return (
                      <TableRow key={user.id} className={user.banned ? "opacity-50" : ""}>
                        <TableCell className="font-medium">{user.display_name || "-"}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>{roleBadge(user.role, user.banned)}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDate(user.created_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              disabled={actionLoading === user.id}
                              onClick={() => handleEdit(user)}
                              title="แก้ไข"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              disabled={actionLoading === user.id || isSelf}
                              onClick={() =>
                                setConfirmDialog({
                                  open: true,
                                  type: user.banned ? "unban" : "ban",
                                  user,
                                })
                              }
                              title={user.banned ? "ปลดแบน" : "แบน"}
                            >
                              <Ban className={`h-3.5 w-3.5 ${user.banned ? "text-destructive" : ""}`} />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              disabled={actionLoading === user.id || isSelf}
                              onClick={() =>
                                setConfirmDialog({ open: true, type: "delete", user })
                              }
                              title="ลบ"
                            >
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
        </div>
      </main>

      {/* Edit Dialog */}
      <Dialog open={editDialog.open} onOpenChange={(open) => !open && setEditDialog({ open: false, user: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>แก้ไขผู้ใช้</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>ชื่อ</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="dev">Dev</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">อีเมล: {editDialog.user?.email}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog({ open: false, user: null })}>
              ยกเลิก
            </Button>
            <Button onClick={handleSaveEdit} disabled={actionLoading === editDialog.user?.id}>
              {actionLoading === editDialog.user?.id ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              บันทึก
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Dialog */}
      <AlertDialog
        open={confirmDialog.open}
        onOpenChange={(open) => !open && setConfirmDialog({ open: false, type: "delete", user: null })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog.type === "delete"
                ? "ยืนยันการลบ"
                : confirmDialog.type === "ban"
                  ? "ยืนยันการแบน"
                  : "ยืนยันการปลดแบน"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.type === "delete"
                ? `คุณต้องการลบ ${confirmDialog.user?.display_name} (${confirmDialog.user?.email}) ออกจากระบบหรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้`
                : confirmDialog.type === "ban"
                  ? `คุณต้องการแบน ${confirmDialog.user?.display_name} (${confirmDialog.user?.email}) หรือไม่? ผู้ใช้จะไม่สามารถเข้าใช้งานระบบได้`
                  : `คุณต้องการปลดแบน ${confirmDialog.user?.display_name} (${confirmDialog.user?.email}) หรือไม่?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirm}
              className={confirmDialog.type === "delete" || confirmDialog.type === "ban" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              {confirmDialog.type === "delete" ? "ลบ" : confirmDialog.type === "ban" ? "แบน" : "ปลดแบน"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
