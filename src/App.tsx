import React, { useEffect, useState, Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { PrivacyProvider } from "@/contexts/PrivacyContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { doc, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { applyRecurringRules } from "@/lib/recurring-service";
import GoogleLogin from "./components/GoogleLogin";
import AddTransactionFAB from "./components/AddTransactionFAB";
import { BottomNavbar } from "./components/BottomNavbar";
import { GlobalInsights } from "./components/GlobalInsights";
import { Loader2, AlertTriangle, X, Megaphone } from "lucide-react";

// Lazy load all page components for code splitting
const SharedReportPage = lazy(() => import("./pages/SharedReportPage"));
const OverviewPage = lazy(() => import("./pages/OverviewPage"));
const Index = lazy(() => import("./pages/Index"));
const Transactions = lazy(() => import("./pages/Transactions"));
const Analysis = lazy(() => import("./pages/Analysis"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const Settings = lazy(() => import("./pages/Settings"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const AccountsPage = lazy(() => import("./pages/AccountsPage"));
const InvestmentsPage = lazy(() => import("./pages/InvestmentsPage"));
const GoalsPage = lazy(() => import("./pages/GoalsPage"));
const DebtPlannerPage = lazy(() => import("./pages/DebtPlannerPage"));
const CommandCenter = lazy(() => import("./pages/CommandCenter"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Loading fallback for lazy-loaded pages
function PageLoader() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

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
          <h1 className="text-lg font-bold text-destructive mb-2">Error: {this.state.error?.message}</h1>
          <pre className="whitespace-pre-wrap text-xs bg-muted p-4 rounded overflow-auto max-h-96">
            {this.state.errorInfo?.componentStack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient();

// ===== Global System Listeners =====
function SystemOverlays() {
  const { user, userRole } = useAuth();
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [dismissedBroadcast, setDismissedBroadcast] = useState("");
  const [forceRefreshTs, setForceRefreshTs] = useState(0);

  useEffect(() => {
    const unsub = onSnapshot(doc(firestore, "system_config", "global"), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setMaintenanceMode(data.maintenance_mode ?? false);
      setBroadcastMessage(data.broadcast_message ?? "");

      // Force refresh: if timestamp is newer than our baseline, reload
      const newTs = data.force_refresh ?? 0;
      if (forceRefreshTs > 0 && newTs > forceRefreshTs) {
        window.location.reload();
      }
      if (newTs > 0) setForceRefreshTs(newTs);
    }, () => {
      // Ignore errors (doc may not exist yet)
    });
    return () => unsub();
  }, [forceRefreshTs]);

  const isDev = userRole === "dev";

  return (
    <>
      {/* Maintenance Overlay - show for non-dev users */}
      {maintenanceMode && !isDev && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-sm">
          <div className="text-center space-y-4 p-8">
            <AlertTriangle className="h-16 w-16 mx-auto text-[hsl(var(--debt))]" />
            <h2 className="text-2xl font-bold text-foreground">ระบบอยู่ระหว่างปรับปรุง</h2>
            <p className="text-muted-foreground max-w-sm mx-auto">
              ขณะนี้ระบบอยู่ในโหมดบำรุงรักษา กรุณารอสักครู่แล้วลองใหม่อีกครั้ง
            </p>
          </div>
        </div>
      )}

      {/* Broadcast Banner */}
      {broadcastMessage && broadcastMessage !== dismissedBroadcast && (
        <div className="fixed top-0 left-0 right-0 z-[90] bg-[hsl(var(--debt))] text-[hsl(var(--debt-foreground))] px-4 py-2.5 flex items-center justify-center gap-3 shadow-lg">
          <Megaphone className="h-4 w-4 shrink-0" />
          <p className="text-sm font-medium">{broadcastMessage}</p>
          <button
            onClick={() => setDismissedBroadcast(broadcastMessage)}
            className="shrink-0 h-6 w-6 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </>
  );
}

function AdminRoute({ element }: { element: React.ReactNode }) {
  const { userRole, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (userRole !== "dev" && userRole !== "admin") return <Navigate to="/" replace />;
  return <>{element}</>;
}

function useApplyRecurring() {
  const { userId } = useAuth();
  useEffect(() => {
    if (!userId) return;
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    applyRecurringRules(userId, period).catch(() => {/* silent */});
  }, [userId]);
}

function AuthenticatedApp() {
  const { user, loading, pendingApproval } = useAuth();
  const [fabOpen, setFabOpen] = useState(false);
  useApplyRecurring();

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
    <SidebarProvider>
      <SystemOverlays />
      <div className="min-h-screen flex w-full">
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/dashboard" element={<Index />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/analysis" element={<Analysis />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/admin" element={<AdminRoute element={<AdminPanel />} />} />
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/investments" element={<InvestmentsPage />} />
            <Route path="/goals" element={<GoalsPage />} />
            <Route path="/debt-planner" element={<DebtPlannerPage />} />
            <Route path="/command-center" element={<CommandCenter />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        <GlobalInsights />
        <AddTransactionFAB open={fabOpen} onOpenChange={setFabOpen} />
        <BottomNavbar onAddClick={() => setFabOpen(true)} />
      </div>
    </SidebarProvider>
  );
}

const AppContent = () => {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public routes — no auth required */}
          <Route path="/report/:token" element={<SharedReportPage />} />
          {/* Auth-gated app */}
          <Route path="/*" element={<AuthenticatedApp />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};

const AppWrapper = () => {
  return (
    <div id="app-root">
      <Toaster />
      <Sonner />
      <TooltipProvider delayDuration={0}>
        <ThemeProvider>
          <AuthProvider>
            <SettingsProvider>
              <PrivacyProvider>
                <ErrorBoundary>
                  <AppContent />
                </ErrorBoundary>
              </PrivacyProvider>
            </SettingsProvider>
          </AuthProvider>
        </ThemeProvider>
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
