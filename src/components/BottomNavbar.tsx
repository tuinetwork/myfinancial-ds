import { useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Receipt, Wallet, Settings, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  onAddClick: () => void;
}

const navItems = [
  { label: "หน้าหลัก", icon: LayoutDashboard, href: "/" },
  { label: "รายการ", icon: Receipt, href: "/transactions" },
  null, // center FAB placeholder
  { label: "กระเป๋า", icon: Wallet, href: "/accounts" },
  { label: "ตั้งค่า", icon: Settings, href: "/settings" },
];

export function BottomNavbar({ onAddClick }: Props) {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (href: string) => {
    if (href === "/") return location.pathname === "/" || location.pathname === "";
    return location.pathname.startsWith(href);
  };

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border safe-bottom">
      <div className="flex items-end justify-around px-2 h-16">
        {navItems.map((item, i) => {
          if (!item) {
            // Center FAB button
            return (
              <button
                key="fab"
                onClick={onAddClick}
                className="relative -top-4 flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/30 active:scale-95 transition-transform duration-150"
                aria-label="เพิ่มรายการ"
              >
                <Plus className="h-7 w-7" />
              </button>
            );
          }

          const active = isActive(item.href);
          return (
            <button
              key={item.href}
              onClick={() => navigate(item.href)}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 flex-1 h-full pt-1 transition-colors duration-150",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <item.icon className={cn("h-5 w-5", active && "scale-110 transition-transform")} />
              <span className="text-[10px] font-medium">{item.label}</span>
              {active && <div className="absolute top-0 w-8 h-0.5 rounded-full bg-primary" />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
