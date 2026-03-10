import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Index from "./pages/Index";
import Transactions from "./pages/Transactions";
import Analysis from "./pages/Analysis";
import CalendarPage from "./pages/CalendarPage";
import Settings from "./pages/Settings";
import AdminPanel from "./pages/AdminPanel";
import NotFound from "./pages/NotFound";
import GoogleLogin from "./components/GoogleLogin";
import AddTransactionFAB from "./components/AddTransactionFAB";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

const AppContent = () => {
  const { user, loading, pendingApproval } = useAuth();

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user || pendingApproval) {
    return <GoogleLogin />;
  }

  return (
    <BrowserRouter>
      <SidebarProvider>
        <div className="min-h-screen flex w-full">
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/analysis" element={<Analysis />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          <AddTransactionFAB />
        </div>
      </SidebarProvider>
    </BrowserRouter>
  );
};

const AppWrapper = () => {
  return (
    <div id="app-root">
      <Toaster />
      <Sonner />
      <TooltipProvider delayDuration={0}>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </TooltipProvider>
    </div>
  );
};

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AppWrapper />
    </QueryClientProvider>
  );
};

export default App;
