import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { AuthGate } from "@/components/AuthGate";
import { ThemeProvider } from "@/hooks/use-theme";
import ChatPage from "@/pages/ChatPage";
import CalendarPage from "@/pages/CalendarPage";
import FilesPage from "@/pages/FilesPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthGate>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <HashRouter>
            <AppLayout>
              <RouteErrorBoundary>
                <Routes>
                  <Route path="/" element={<Navigate to="/chat" replace />} />
                  <Route path="/chat" element={<ChatPage />} />
                  <Route path="/cron-jobs" element={<CalendarPage />} />
                  <Route path="/files" element={<FilesPage />} />
                  <Route path="/calendar" element={<Navigate to="/cron-jobs" replace />} />
                  <Route path="/agents" element={<Navigate to="/files" replace />} />
                  <Route path="/tools" element={<Navigate to="/files" replace />} />
                  <Route path="/code-tools" element={<Navigate to="/files" replace />} />
                  <Route path="/cron" element={<Navigate to="/cron-jobs" replace />} />
                  <Route path="/night-report" element={<Navigate to="/files" replace />} />
                  <Route path="/feed" element={<Navigate to="/chat" replace />} />
                  <Route path="/memory" element={<Navigate to="/files" replace />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </RouteErrorBoundary>
            </AppLayout>
          </HashRouter>
        </TooltipProvider>
      </AuthGate>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
