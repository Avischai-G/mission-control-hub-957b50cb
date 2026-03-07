import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import ChatPage from "@/pages/ChatPage";
import GlobalMemoryPage from "@/pages/GlobalMemoryPage";
import AgentsPage from "@/pages/AgentsPage";
import CronJobsPage from "@/pages/CronJobsPage";
import LiveFeedPage from "@/pages/LiveFeedPage";
import NightReportPage from "@/pages/NightReportPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppLayout>
          <Routes>
            <Route path="/" element={<Navigate to="/chat" replace />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/memory" element={<GlobalMemoryPage />} />
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/cron" element={<CronJobsPage />} />
            <Route path="/feed" element={<LiveFeedPage />} />
            <Route path="/night-report" element={<NightReportPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AppLayout>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
