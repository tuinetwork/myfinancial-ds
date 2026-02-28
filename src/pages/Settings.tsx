import { useAuth } from "@/contexts/AuthContext";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { LogOut, User, Mail, Shield } from "lucide-react";

const Settings = () => {
  const { user, signOut } = useAuth();

  const displayName = user?.displayName || "ผู้ใช้";
  const email = user?.email || "";
  const photoURL = user?.photoURL || "";
  const uid = user?.uid || "";
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <>
      <AppSidebar />

      <div className="flex-1 flex flex-col min-h-screen">
        <header className="h-14 flex items-center border-b border-border px-4 bg-card/50 backdrop-blur-sm sticky top-0 z-30">
          <SidebarTrigger />
        </header>

        <main className="flex-1 p-4 md:p-6">
          <div className="max-w-2xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold">ตั้งค่า</h1>

            {/* Profile Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">ข้อมูลผู้ใช้</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={photoURL} alt={displayName} />
                    <AvatarFallback className="text-lg bg-primary/10 text-primary">{initials}</AvatarFallback>
                  </Avatar>
                  <div>
                    <h2 className="text-lg font-semibold">{displayName}</h2>
                    <p className="text-sm text-muted-foreground">{email}</p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground w-20">ชื่อ</span>
                    <span>{displayName}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground w-20">อีเมล</span>
                    <span>{email}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground w-20">UID</span>
                    <span className="font-mono text-xs text-muted-foreground">{uid}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Sign Out */}
            <Card>
              <CardContent className="pt-6">
                <Button variant="destructive" className="w-full gap-2" onClick={signOut}>
                  <LogOut className="h-4 w-4" />
                  ออกจากระบบ
                </Button>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </>
  );
};

export default Settings;
