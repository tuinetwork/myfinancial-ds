import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { PrivacyProvider } from "@/contexts/PrivacyContext";
import Index from "./pages/Index";
import Transactions from "./pages/Transactions";
import Analysis from "./pages/Analysis";
import CalendarPage from "./pages/CalendarPage";
import Settings from "./pages/Settings";
import AdminPanel from "./pages/AdminPanel";
import AccountsPage from "./pages/AccountsPage";
import InvestmentsPage from "./pages/InvestmentsPage";
import GoalsPage from "./pages/GoalsPage";
import NotFound from "./pages/NotFound";
import GoogleLogin from "./components/GoogleLogin";
import AddTransactionFAB from "./components/AddTransactionFAB";
import { Loader2 } from "lucide-react";

// Error Boundary to catch and log component stack
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null; errorInfo: React.ErrorInfo | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error.message);
    console.error("Component stack:", errorInfo.componentStack);
    this.setState({ errorInfo });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-sm">
          <h1 className="text-lg font-bold text-red-600 mb-2">Error: {this.state.error?.message}</h1>
          <pre className="whitespace-pre-wrap text-xs bg-gray-100 p-4 rounded overflow-auto max-h-96">
            {this.state.errorInfo?.componentStack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

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
          <ErrorBoundary>
            <AppContent />
          </ErrorBoundary>
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
