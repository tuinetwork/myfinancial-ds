import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { icons, type LucideIcon } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

// Curated icon set for financial categories
const ICON_LIST: { name: string; icon: LucideIcon }[] = [
  // Utilities
  { name: "lightbulb", icon: icons.Lightbulb },
  { name: "droplets", icon: icons.Droplets },
  { name: "wifi", icon: icons.Wifi },
  { name: "phone", icon: icons.Phone },
  { name: "zap", icon: icons.Zap },
  { name: "flame", icon: icons.Flame },
  // Housing
  { name: "home", icon: icons.Home },
  { name: "building-2", icon: icons.Building2 },
  { name: "building", icon: icons.Building },
  { name: "warehouse", icon: icons.Warehouse },
  { name: "bed-double", icon: icons.BedDouble },
  { name: "key", icon: icons.Key },
  // Transport
  { name: "car", icon: icons.Car },
  { name: "fuel", icon: icons.Fuel },
  { name: "bus", icon: icons.Bus },
  { name: "train-front", icon: icons.TrainFront },
  { name: "bike", icon: icons.Bike },
  { name: "plane", icon: icons.Plane },
  // Finance
  { name: "landmark", icon: icons.Landmark },
  { name: "credit-card", icon: icons.CreditCard },
  { name: "banknote", icon: icons.Banknote },
  { name: "wallet", icon: icons.Wallet },
  { name: "coins", icon: icons.Coins },
  { name: "piggy-bank", icon: icons.PiggyBank },
  { name: "trending-up", icon: icons.TrendingUp },
  { name: "hand-coins", icon: icons.HandCoins },
  { name: "dollar-sign", icon: icons.DollarSign },
  { name: "receipt", icon: icons.Receipt },
  { name: "calculator", icon: icons.Calculator },
  // Work & Income
  { name: "briefcase", icon: icons.Briefcase },
  { name: "laptop", icon: icons.Laptop },
  { name: "monitor", icon: icons.Monitor },
  { name: "smartphone", icon: icons.Smartphone },
  // Food
  { name: "utensils", icon: icons.Utensils },
  { name: "coffee", icon: icons.Coffee },
  { name: "apple", icon: icons.Apple },
  { name: "pizza", icon: icons.Pizza },
  { name: "cookie", icon: icons.Cookie },
  { name: "wine", icon: icons.Wine },
  { name: "beer", icon: icons.Beer },
  // Shopping
  { name: "shopping-bag", icon: icons.ShoppingBag },
  { name: "shopping-cart", icon: icons.ShoppingCart },
  { name: "store", icon: icons.Store },
  { name: "shirt", icon: icons.Shirt },
  { name: "gift", icon: icons.Gift },
  { name: "package", icon: icons.Package },
  // Health
  { name: "heart", icon: icons.Heart },
  { name: "stethoscope", icon: icons.Stethoscope },
  { name: "pill", icon: icons.Pill },
  { name: "activity", icon: icons.Activity },
  { name: "dumbbell", icon: icons.Dumbbell },
  // Education
  { name: "graduation-cap", icon: icons.GraduationCap },
  { name: "book-open", icon: icons.BookOpen },
  { name: "library", icon: icons.Library },
  { name: "pencil", icon: icons.Pencil },
  // Family & People
  { name: "baby", icon: icons.Baby },
  { name: "users", icon: icons.Users },
  { name: "heart-handshake", icon: icons.HeartHandshake },
  // Entertainment
  { name: "gamepad-2", icon: icons.Gamepad2 },
  { name: "music", icon: icons.Music },
  { name: "film", icon: icons.Film },
  { name: "tv", icon: icons.Tv },
  { name: "camera", icon: icons.Camera },
  { name: "palette", icon: icons.Palette },
  // Subscriptions
  { name: "calendar-check", icon: icons.CalendarCheck },
  { name: "calendar", icon: icons.Calendar },
  { name: "repeat", icon: icons.Repeat },
  { name: "bell", icon: icons.Bell },
  // Pets
  { name: "dog", icon: icons.Dog },
  { name: "cat", icon: icons.Cat },
  { name: "paw-print", icon: icons.PawPrint },
  // Misc
  { name: "wrench", icon: icons.Wrench },
  { name: "settings", icon: icons.Settings },
  { name: "star", icon: icons.Star },
  { name: "sun", icon: icons.Sun },
  { name: "moon", icon: icons.Moon },
  { name: "umbrella", icon: icons.Umbrella },
  { name: "shield", icon: icons.Shield },
  { name: "lock", icon: icons.Lock },
  { name: "tag", icon: icons.Tag },
  { name: "folder", icon: icons.Folder },
  { name: "circle-dot", icon: icons.CircleDot },
  { name: "sparkles", icon: icons.Sparkles },
  { name: "cigarette", icon: icons.Cigarette },
  { name: "scissors", icon: icons.Scissors },
  { name: "map-pin", icon: icons.MapPin },
  { name: "globe", icon: icons.Globe },
  { name: "truck", icon: icons.Truck },
];

export function getIconByName(name: string | undefined): LucideIcon {
  if (!name) return icons.CircleDot;
  const found = ICON_LIST.find((i) => i.name === name);
  return found?.icon ?? icons.CircleDot;
}

interface IconPickerProps {
  value?: string;
  onChange: (iconName: string) => void;
  className?: string;
}

export const IconPicker = ({ value, onChange, className }: IconPickerProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const CurrentIcon = getIconByName(value);

  const filtered = search
    ? ICON_LIST.filter((i) => i.name.includes(search.toLowerCase()))
    : ICON_LIST;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "h-7 w-7 rounded-md flex items-center justify-center border border-border bg-muted/50 hover:bg-muted transition-colors",
            className
          )}
        >
          <CurrentIcon className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2 z-[60]" align="start" side="bottom">
        <Input
          placeholder="Search icon..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 text-xs mb-2"
          autoFocus
        />
        <ScrollArea className="h-48">
          <div className="grid grid-cols-8 gap-1">
            {filtered.map(({ name, icon: Icon }) => (
              <button
                key={name}
                onClick={() => {
                  onChange(name);
                  setOpen(false);
                  setSearch("");
                }}
                className={cn(
                  "h-7 w-7 rounded flex items-center justify-center transition-colors",
                  value === name
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
                title={name}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};
