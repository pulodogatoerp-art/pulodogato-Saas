import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import logoPuloDoGato from '@/assets/logo-pulo-do-gato.jpg';
import { Eye, EyeOff, Mail, Lock, Loader2 } from 'lucide-react';

type Mode = 'login' | 'register' | 'forgot';

export default function Login() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nome, setNome] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === 'register') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { nome } },
        });
        if (error) throw error;
        toast({
          title: 'Cadastro realizado!',
          description: 'Verifique seu e-mail para confirmar a conta.',
        });
        setMode('login');
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast({
          title: 'E-mail enviado!',
          description: 'Verifique sua caixa de entrada para redefinir a senha.',
        });
        setMode('login');
      }
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err.message ?? 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const titles: Record<Mode, string> = {
    login: 'Entrar na plataforma',
    register: 'Criar nova conta',
    forgot: 'Recuperar senha',
  };

  return (
    <div className="min-h-screen flex" style={{ background: 'hsl(var(--sidebar-background))' }}>
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-[420px] flex-shrink-0 p-10 border-r" style={{ borderColor: 'hsl(var(--sidebar-border))' }}>
        <div className="flex items-center gap-3">
          <img src={logoPuloDoGato} alt="PULO DO GATO" className="h-24 w-auto object-contain rounded-xl" />
        </div>
        <div>
          <h2 className="text-3xl font-bold text-white leading-snug mb-4">
            Gestão inteligente<br />de autopeças
          </h2>
          <p style={{ color: 'hsl(var(--sidebar-foreground))' }} className="text-sm leading-relaxed">
            Controle de estoque, orçamentos, vendas e importação de NF-e em uma plataforma completa.
          </p>
        </div>
        <div className="space-y-3">
          {['Controle de estoque por lote FIFO', 'Importação automática de NF-e XML', 'Orçamentos e vendas integrados'].map(f => (
            <div key={f} className="flex items-center gap-3">
              <div className="h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'hsl(var(--primary) / 0.2)' }}>
                <div className="h-2 w-2 rounded-full" style={{ background: 'hsl(var(--primary))' }} />
              </div>
              <span className="text-sm" style={{ color: 'hsl(var(--sidebar-foreground))' }}>{f}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-[400px]">
          {/* Mobile logo */}
          <div className="flex justify-center mb-8 lg:hidden">
            <div className="flex items-center gap-3">
          <img src={logoPuloDoGato} alt="PULO DO GATO" className="h-24 w-auto object-contain rounded-xl" />
        </div>
          </div>

          <div className="rounded-2xl border p-8" style={{ background: 'hsl(var(--sidebar-accent))', borderColor: 'hsl(var(--sidebar-border))' }}>
            <h1 className="text-xl font-bold text-white mb-1">{titles[mode]}</h1>
            <p className="text-sm mb-6" style={{ color: 'hsl(var(--sidebar-foreground))' }}>
              {mode === 'login' ? 'Bem-vindo de volta!' : mode === 'register' ? 'Preencha os dados abaixo' : 'Enviaremos um link de redefinição'}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--sidebar-foreground))' }}>Nome completo</label>
                  <input
                    type="text"
                    value={nome}
                    onChange={e => setNome(e.target.value)}
                    required
                    placeholder="Seu nome"
                    className="w-full rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:ring-2 border"
                    style={{ background: 'hsl(var(--sidebar-background))', borderColor: 'hsl(var(--sidebar-border))', '--tw-ring-color': 'hsl(var(--primary))' } as any}
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--sidebar-foreground))' }}>E-mail</label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40 text-white" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    placeholder="seu@email.com"
                    className="w-full rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:ring-2 border"
                    style={{ background: 'hsl(var(--sidebar-background))', borderColor: 'hsl(var(--sidebar-border))' } as any}
                  />
                </div>
              </div>

              {mode !== 'forgot' && (
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--sidebar-foreground))' }}>Senha</label>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40 text-white" />
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      minLength={6}
                      placeholder="••••••••"
                      className="w-full rounded-lg pl-9 pr-10 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:ring-2 border"
                      style={{ background: 'hsl(var(--sidebar-background))', borderColor: 'hsl(var(--sidebar-border))' } as any}
                    />
                    <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-70 text-white transition-opacity">
                      {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              )}

              {mode === 'login' && (
                <div className="text-right">
                  <button type="button" onClick={() => setMode('forgot')} className="text-xs hover:underline" style={{ color: 'hsl(var(--primary))' }}>
                    Esqueci minha senha
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ background: 'hsl(var(--primary))' }}
              >
                {loading && <Loader2 size={15} className="animate-spin" />}
                {mode === 'login' ? 'Entrar' : mode === 'register' ? 'Criar conta' : 'Enviar link'}
              </button>
            </form>

            <div className="mt-5 text-center text-xs" style={{ color: 'hsl(var(--sidebar-foreground))' }}>
              {mode === 'login' ? (
                <>Não tem conta?{' '}
                  <button onClick={() => setMode('register')} className="font-semibold hover:underline" style={{ color: 'hsl(var(--primary))' }}>Cadastre-se</button>
                </>
              ) : (
                <>Já tem conta?{' '}
                  <button onClick={() => setMode('login')} className="font-semibold hover:underline" style={{ color: 'hsl(var(--primary))' }}>Entrar</button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
