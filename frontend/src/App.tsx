import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Farmer from "./pages/Farmer.tsx";
import Manufacturer from "./pages/Manufacturer.tsx";
import Consumer from "./pages/Consumer.tsx";
import { AuthProvider, Role, useAuth } from "@/lib/auth";

const queryClient = new QueryClient();

const Protected = ({ role, children }: { role: Role; children: JSX.Element }) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/" replace />;
  if (user.role !== role) return <Navigate to={`/${user.role.toLowerCase()}`} replace />;
  return children;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/farmer/*"       element={<Protected role="Farmer"><Farmer /></Protected>} />
            <Route path="/manufacturer/*" element={<Protected role="Manufacturer"><Manufacturer /></Protected>} />
            <Route path="/consumer/*"     element={<Protected role="Consumer"><Consumer /></Protected>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
