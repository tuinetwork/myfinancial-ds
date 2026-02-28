import { useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import PinLock from "./components/PinLock";

const queryClient = new QueryClient();
const SESSION_KEY = "finance-dashboard-unlocked";

const App = () => {
  const [isUnlocked, setIsUnlocked] = useState(() => sessionStorage.getItem(SESSION_KEY) === "true");

  const handleUnlock = () => {
    sessionStorage.setItem(SESSION_KEY, "true");
    setIsUnlocked(true);
  };

  if (!isUnlocked) {
    return <PinLock onUnlock={handleUnlock} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <SidebarProvider>
            <div className="min-h-screen flex w-full">
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </div>
          </SidebarProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
