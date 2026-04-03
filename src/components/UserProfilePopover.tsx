import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { User, Mail, Shield, Settings, LogOut } from "lucide-react";
import { SettingsDialog } from "@/components/SettingsDialog";

export function UserProfilePopover() {
  const { user, signOut } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const displayName = user?.displayName || "ผู้ใช้";
  const email = user?.email || "";
  const photoURL = user?.photoURL || "";
  const uid = user?.uid || "";
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-full">
            <Avatar className="h-8 w-8">
              <AvatarImage src={photoURL} alt={displayName} />
              <AvatarFallback className="text-xs bg-primary/10 text-primary">{initials}</AvatarFallback>
            </Avatar>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="end" sideOffset={8}>
          {/* Profile Header */}
          <div className="px-4 py-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                <AvatarImage src={photoURL} alt={displayName} />
                <AvatarFallback className="text-sm bg-primary/10 text-primary">{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{displayName}</p>
                <p className="text-xs text-muted-foreground truncate">{email}</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Info */}
          <div className="px-4 py-3 space-y-2.5">
            <div className="flex items-center gap-2.5 text-sm">
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">ชื่อ</span>
              <span className="ml-auto truncate font-medium">{displayName}</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">อีเมล</span>
              <span className="ml-auto truncate text-xs">{email}</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm">
              <Shield className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">UID</span>
              <span className="ml-auto font-mono text-[10px] text-muted-foreground truncate max-w-[120px]">{uid}</span>
            </div>
          </div>

          <Separator />

          {/* Actions */}
          <div className="p-2 space-y-0.5">
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-sm rounded-md hover:bg-muted/50 transition-colors"
            >
              <Settings className="h-4 w-4 text-muted-foreground" />
              ตั้งค่า
            </button>
            <button
              onClick={signOut}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-sm rounded-md hover:bg-destructive/10 text-destructive transition-colors"
            >
              <LogOut className="h-4 w-4" />
              ออกจากระบบ
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
