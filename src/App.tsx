import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Produtos from "./pages/Produtos";
import Clientes from "./pages/Clientes";
import Orcamentos from "./pages/Orcamentos";
import Vendas from "./pages/Vendas";
import Financeiro from "./pages/Financeiro";
import ImportarNFe from "./pages/ImportarNFe";
import GestaoUsuarios from "./pages/GestaoUsuarios";
import Configuracoes from "./pages/Configuracoes";
import ConfiguracaoFiscal from "./pages/ConfiguracaoFiscal";
import ApiIntegracao from "./pages/ApiIntegracao";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'hsl(var(--sidebar-background))' }}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/produtos" element={<Produtos />} />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="/orcamentos" element={<Orcamentos />} />
        <Route path="/vendas" element={<Vendas />} />
        <Route path="/financeiro" element={<Financeiro />} />
        <Route path="/importar-nfe" element={<ImportarNFe />} />
        <Route path="/historico-nfe" element={<ImportarNFe defaultTab="historico" />} />
        <Route path="/usuarios" element={<GestaoUsuarios />} />
        <Route path="/configuracoes" element={<Configuracoes />} />
        <Route path="/configuracao-fiscal" element={<ConfiguracaoFiscal />} />
        <Route path="/integracao-api" element={<ApiIntegracao />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
