import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route, BrowserRouter } from "react-router-dom";
import { useScrollToTop } from "@/hooks/useScrollToTop";
import Home from "./pages/Home";
import Humanize from "./pages/Humanize";
import Paraphrase from "./pages/Paraphrase";
import AIDetector from "./pages/AIDetector";
import About from "./pages/About";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ScrollToTop() {
  useScrollToTop();
  return null;
}

const App = () => {
  const isElectron = window.navigator.userAgent.includes("Electron");
  const Router = isElectron ? HashRouter : BrowserRouter;
  const routerProps = isElectron ? {} : { basename: "/pl_humanize" };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Router {...routerProps}>
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/humanize" element={<Humanize />} />
            <Route path="/paraphrase" element={<Paraphrase />} />
            <Route path="/ai-detector" element={<AIDetector />} />
            <Route path="/about" element={<About />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
