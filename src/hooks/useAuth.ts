import { createContext, createElement, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type AppRole = 'admin' | 'vendedor' | 'caixa' | 'estoque';

export interface AuthUser {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  nome: string;
  loading: boolean;
  setUserRole: (newRole: AppRole) => void;
  refreshUser: () => Promise<void>;
}

type UserRoleRow = Pick<Database['public']['Tables']['user_roles']['Row'], 'role'>;

const ROLE_PRIORITY: AppRole[] = ['admin', 'vendedor', 'caixa', 'estoque'];

function pickRole(rows: UserRoleRow[] | null | undefined): AppRole {
  const roles = new Set((rows ?? []).map(row => row.role).filter(Boolean) as AppRole[]);
  return ROLE_PRIORITY.find(role => roles.has(role)) ?? 'vendedor';
}

const AuthContext = createContext<AuthUser | null>(null);

async function loadUserData(userId: string): Promise<{ role: AppRole; nome: string }> {
  try {
    const [roleRes, profileRes] = await Promise.all([
      supabase.from('user_roles').select('role').eq('user_id', userId),
      supabase.from('profiles').select('nome').eq('id', userId).maybeSingle(),
    ]);

    return {
      role: pickRole(roleRes.data),
      nome: profileRes.data?.nome ?? '',
    };
  } catch (err) {
    console.error('Falha ao carregar perfil do usuário:', err);
    return {
      role: 'vendedor',
      nome: '',
    };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(() => {
    return (localStorage.getItem('pecafacil_active_role') as AppRole) || null;
  });
  const [nome, setNome] = useState('');
  const [loading, setLoading] = useState(true);
  const requestIdRef = useRef(0);

  const setUserRole = (newRole: AppRole) => {
    setRole(newRole);
    localStorage.setItem('pecafacil_active_role', newRole);
    // Tenta atualizar no Supabase se houver usuário autenticado
    if (user?.id) {
      supabase.from('user_roles').upsert({ user_id: user.id, role: newRole } as any).then(() => {});
    }
  };

  const applySession = async (nextSession: Session | null) => {
    const requestId = ++requestIdRef.current;
    setSession(nextSession);
    setUser(nextSession?.user ?? null);

    if (!nextSession?.user) {
      setRole(null);
      setNome('');
      setLoading(false);
      return;
    }

    setLoading(true);
    const userData = await loadUserData(nextSession.user.id);
    if (requestId !== requestIdRef.current) return;

    const savedOverride = localStorage.getItem('pecafacil_active_role') as AppRole | null;
    const finalRole = savedOverride || userData.role;

    setRole(finalRole);
    setNome(userData.nome || (nextSession.user.email ? nextSession.user.email.split('@')[0] : 'Usuário'));
    setLoading(false);
  };

  const refreshUser = async () => {
    const { data: { session: curSession } } = await supabase.auth.getSession();
    await applySession(curSession);
  };

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) {
        void applySession(session);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setTimeout(() => {
          if (!cancelled) void applySession(nextSession);
        }, 0);
      }
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return createElement(
    AuthContext.Provider,
    { value: { user, session, role, nome, loading, setUserRole, refreshUser } },
    children
  );
}

export function useAuth(): AuthUser {
  const auth = useContext(AuthContext);
  if (!auth) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }

  return auth;
}
