import React, { createContext, useContext } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Package, Users, FileText, ShoppingCart,
  DollarSign, ChevronLeft, ChevronRight, LogOut, Settings,
  Wrench, Menu, FileUp, ShieldCheck, Plug
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserRole } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';

interface AppContextType {
  userRole: UserRole;
  setUserRole: (role: UserRole) => void;
}

export const AppContext = createContext<AppContextType>({
  userRole: 'admin',
  setUserRole: () => {},
});

export const useAppContext = () => useContext(AppContext);

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/produtos', label: 'Produtos', icon: Package },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/orcamentos', label: 'Orçamentos', icon: FileText },
  { to: '/vendas', label: 'Vendas', icon: ShoppingCart },
  { to: '/financeiro', label: 'Financeiro', icon: DollarSign },
  { to: '/importar-nfe', label: 'Importar NF-e', icon: FileUp },
];

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { role, nome, setUserRole } = useAuth();
  const userRole: UserRole = role ?? 'admin';

  const initials = nome
    ? nome.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
    : 'U';

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary flex-shrink-0">
          <Wrench className="h-5 w-5 text-primary-foreground" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="font-bold text-white text-sm leading-tight">Autopeças MGN</p>
            <p className="text-xs" style={{ color: 'hsl(var(--sidebar-foreground))' }}>Autopeças</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon }) => {
          const active = location.pathname === to;
          return (
            <Link
              key={to}
              to={to}
              onClick={() => setMobileOpen(false)}
              className={cn('sidebar-nav-item', active && 'active')}
            >
              <Icon className="h-4.5 w-4.5 flex-shrink-0" size={18} />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
        {userRole === 'admin' && (
          <>
            <Link
              to="/usuarios"
              onClick={() => setMobileOpen(false)}
              className={cn('sidebar-nav-item', location.pathname === '/usuarios' && 'active')}
            >
              <ShieldCheck size={18} className="flex-shrink-0" />
              {!collapsed && <span>Usuários</span>}
            </Link>
            <Link
              to="/integracao-api"
              onClick={() => setMobileOpen(false)}
              className={cn('sidebar-nav-item', location.pathname === '/integracao-api' && 'active')}
            >
              <Plug size={18} className="flex-shrink-0" />
              {!collapsed && <span>Integração API</span>}
            </Link>
          </>
        )}
      </nav>

      {/* Role badge */}
      {!collapsed && (
        <div className="px-3 pb-2">
          <div className="rounded-lg p-3" style={{ background: 'hsl(var(--sidebar-accent))' }}>
            <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-1">Perfil ativo</p>
            <button
              onClick={() => setUserRole(userRole === 'admin' ? 'vendedor' : 'admin')}
              className={cn(
                'inline-flex items-center justify-between w-full px-2.5 py-1 rounded-md text-xs font-bold transition-all',
                userRole === 'admin' ? 'bg-primary text-white hover:opacity-90' : 'bg-white/10 text-white/70 hover:bg-white/20'
              )}
              title="Clique para alternar entre Administrador e Vendedor"
            >
              <span>{userRole === 'admin' ? 'Administrador' : userRole === 'caixa' ? 'Caixa' : userRole === 'estoque' ? 'Estoque' : 'Vendedor'}</span>
              <span className="text-[10px] font-normal underline opacity-80">Mudar</span>
            </button>
          </div>
        </div>
      )}

      {/* Bottom */}
      <div className="px-2 pb-4 border-t border-sidebar-border pt-3 space-y-0.5">
        <Link
          to="/configuracoes"
          onClick={() => setMobileOpen(false)}
          className={cn('sidebar-nav-item w-full', location.pathname === '/configuracoes' && 'active')}
        >
          <Settings size={18} className="flex-shrink-0" />
          {!collapsed && <span>Configurações</span>}
        </Link>
        <button className="sidebar-nav-item w-full" onClick={handleLogout}>
          <LogOut size={18} className="flex-shrink-0" />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>
    </>
  );

  return (
    <AppContext.Provider value={{ userRole, setUserRole }}>
      <div className="flex min-h-screen bg-muted/30">
        {/* Desktop Sidebar */}
        <aside
          className={cn(
            'hidden lg:flex flex-col flex-shrink-0 transition-all duration-300 relative',
            collapsed ? 'w-16' : 'w-60'
          )}
          style={{ background: 'hsl(var(--sidebar-background))' }}
        >
          <SidebarContent />
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="absolute -right-3 top-16 z-10 flex h-6 w-6 items-center justify-center rounded-full border bg-background shadow-md hover:bg-muted transition-colors"
            style={{ borderColor: 'hsl(var(--border))' }}
          >
            {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
          </button>
        </aside>

        {/* Mobile sidebar overlay */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
            <aside className="relative flex flex-col w-60 h-full" style={{ background: 'hsl(var(--sidebar-background))' }}>
              <SidebarContent />
            </aside>
          </div>
        )}

        {/* Main content */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Top bar */}
          <header className="h-14 flex items-center gap-4 px-4 lg:px-6 bg-background border-b shadow-sm sticky top-0 z-30">
            <button
              className="lg:hidden p-2 rounded-md hover:bg-muted transition-colors"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={20} />
            </button>
            <div className="flex-1" />
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold">{nome || 'Usuário'}</p>
                <button
                  onClick={() => setUserRole(userRole === 'admin' ? 'vendedor' : 'admin')}
                  className="text-xs text-muted-foreground capitalize hover:underline hover:text-primary flex items-center gap-1 justify-end ml-auto"
                  title="Clique para alternar perfil entre Administrador e Vendedor"
                >
                  <span className={userRole === 'admin' ? 'font-bold text-primary' : ''}>
                    {userRole === 'admin' ? 'Administrador' : 'Vendedor'}
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-bold">Mudar</span>
                </button>
              </div>
              <button
                onClick={() => setUserRole(userRole === 'admin' ? 'vendedor' : 'admin')}
                className="h-8 w-8 rounded-full bg-primary flex items-center justify-center hover:opacity-90 transition-opacity shadow-sm"
                title="Clique para alternar perfil"
              >
                <span className="text-xs font-bold text-white">{initials}</span>
              </button>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 p-4 lg:p-6 animate-fade-in overflow-y-auto h-[calc(100vh-3.5rem)]">
            {children}
          </main>
        </div>
      </div>
    </AppContext.Provider>
  );
}
