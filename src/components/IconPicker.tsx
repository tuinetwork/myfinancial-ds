import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Lightbulb, Droplets, Wifi, Phone, Zap, Flame,
  Home, Building2, Building, Warehouse, BedDouble, Key,
  Car, Fuel, Bus, TrainFront, Bike, Plane,
  Landmark, CreditCard, Banknote, Wallet, Coins, PiggyBank, TrendingUp, HandCoins, DollarSign, Receipt, Calculator,
  Briefcase, Laptop, Monitor, Smartphone,
  Utensils, Coffee, Apple, Pizza, Cookie, Wine, Beer,
  ShoppingBag, ShoppingCart, Store, Shirt, Gift, Package,
  Heart, Stethoscope, Pill, Activity, Dumbbell,
  GraduationCap, BookOpen, Library, Pencil,
  Baby, Users, HeartHandshake,
  Gamepad2, Music, Film, Tv, Camera, Palette,
  CalendarCheck, Calendar, Repeat, Bell,
  Dog, Cat, PawPrint,
  Wrench, Settings, Star, Sun, Moon, Umbrella, Shield, Lock, Tag, Folder, CircleDot, Sparkles, Cigarette, Scissors, MapPin, Globe, Truck,
  type LucideIcon,
} from "lucide-react";

// Curated icon set for financial categories
const ICON_LIST: { name: string; icon: LucideIcon }[] = [
  // Utilities
  { name: "lightbulb", icon: Lightbulb },
  { name: "droplets", icon: Droplets },
  { name: "wifi", icon: Wifi },
  { name: "phone", icon: Phone },
  { name: "zap", icon: Zap },
  { name: "flame", icon: Flame },
  // Housing
  { name: "home", icon: Home },
  { name: "building-2", icon: Building2 },
  { name: "building", icon: Building },
  { name: "warehouse", icon: Warehouse },
  { name: "bed-double", icon: BedDouble },
  { name: "key", icon: Key },
  // Transport
  { name: "car", icon: Car },
  { name: "fuel", icon: Fuel },
  { name: "bus", icon: Bus },
  { name: "train-front", icon: TrainFront },
  { name: "bike", icon: Bike },
  { name: "plane", icon: Plane },
  // Finance
  { name: "landmark", icon: Landmark },
  { name: "credit-card", icon: CreditCard },
  { name: "banknote", icon: Banknote },
  { name: "wallet", icon: Wallet },
  { name: "coins", icon: Coins },
  { name: "piggy-bank", icon: PiggyBank },
  { name: "trending-up", icon: TrendingUp },
  { name: "hand-coins", icon: HandCoins },
  { name: "dollar-sign", icon: DollarSign },
  { name: "receipt", icon: Receipt },
  { name: "calculator", icon: Calculator },
  // Work & Income
  { name: "briefcase", icon: Briefcase },
  { name: "laptop", icon: Laptop },
  { name: "monitor", icon: Monitor },
  { name: "smartphone", icon: Smartphone },
  // Food
  { name: "utensils", icon: Utensils },
  { name: "coffee", icon: Coffee },
  { name: "apple", icon: Apple },
  { name: "pizza", icon: Pizza },
  { name: "cookie", icon: Cookie },
  { name: "wine", icon: Wine },
  { name: "beer", icon: Beer },
  // Shopping
  { name: "shopping-bag", icon: ShoppingBag },
  { name: "shopping-cart", icon: ShoppingCart },
  { name: "store", icon: Store },
  { name: "shirt", icon: Shirt },
  { name: "gift", icon: Gift },
  { name: "package", icon: Package },
  // Health
  { name: "heart", icon: Heart },
  { name: "stethoscope", icon: Stethoscope },
  { name: "pill", icon: Pill },
  { name: "activity", icon: Activity },
  { name: "dumbbell", icon: Dumbbell },
  // Education
  { name: "graduation-cap", icon: GraduationCap },
  { name: "book-open", icon: BookOpen },
  { name: "library", icon: Library },
  { name: "pencil", icon: Pencil },
  // Family & People
  { name: "baby", icon: Baby },
  { name: "users", icon: Users },
  { name: "heart-handshake", icon: HeartHandshake },
  // Entertainment
  { name: "gamepad-2", icon: Gamepad2 },
  { name: "music", icon: Music },
  { name: "film", icon: Film },
  { name: "tv", icon: Tv },
  { name: "camera", icon: Camera },
  { name: "palette", icon: Palette },
  // Subscriptions
  { name: "calendar-check", icon: CalendarCheck },
  { name: "calendar", icon: Calendar },
  { name: "repeat", icon: Repeat },
  { name: "bell", icon: Bell },
  // Pets
  { name: "dog", icon: Dog },
  { name: "cat", icon: Cat },
  { name: "paw-print", icon: PawPrint },
  // Misc
  { name: "wrench", icon: Wrench },
  { name: "settings", icon: Settings },
  { name: "star", icon: Star },
  { name: "sun", icon: Sun },
  { name: "moon", icon: Moon },
  { name: "umbrella", icon: Umbrella },
  { name: "shield", icon: Shield },
  { name: "lock", icon: Lock },
  { name: "tag", icon: Tag },
  { name: "folder", icon: Folder },
  { name: "circle-dot", icon: CircleDot },
  { name: "sparkles", icon: Sparkles },
  { name: "cigarette", icon: Cigarette },
  { name: "scissors", icon: Scissors },
  { name: "map-pin", icon: MapPin },
  { name: "globe", icon: Globe },
  { name: "truck", icon: Truck },
];

const ICON_MAP = new Map(ICON_LIST.map((i) => [i.name, i.icon]));

export function getIconByName(name: string | undefined): LucideIcon {
  if (!name) return CircleDot;
  return ICON_MAP.get(name) ?? CircleDot;
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
