import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import logoPuloDoGato from '@/assets/logo-pulo-do-gato.jpg';
import { Lock, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast({ title: 'Senhas não coincidem', variant: 'destructive' });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Senha redefinida!', description: 'Faça login com a nova senha.' });
      navigate('/');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'hsl(var(--sidebar-background))' }}>
      <div className="w-full max-w-[380px]">
        <div className="flex justify-center mb-8">
          <img src={logoPuloDoGato} alt="PULO DO GATO" className="h-20 w-auto rounded-xl object-contain" />
        </div>
        <div className="rounded-2xl border p-8" style={{ background: 'hsl(var(--sidebar-accent))', borderColor: 'hsl(var(--sidebar-border))' }}>
          <h1 className="text-xl font-bold text-white mb-1">Nova senha</h1>
          <p className="text-sm mb-6" style={{ color: 'hsl(var(--sidebar-foreground))' }}>
            {ready ? 'Defina sua nova senha abaixo.' : 'Verificando link de recuperação…'}
          </p>
          {ready && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {[{ label: 'Nova senha', val: password, set: setPassword }, { label: 'Confirmar senha', val: confirm, set: setConfirm }].map(({ label, val, set }) => (
                <div key={label}>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--sidebar-foreground))' }}>{label}</label>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40 text-white" />
                    <input type="password" value={val} onChange={e => set(e.target.value)} required minLength={6} placeholder="••••••••"
                      className="w-full rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none border"
                      style={{ background: 'hsl(var(--sidebar-background))', borderColor: 'hsl(var(--sidebar-border))' }} />
                  </div>
                </div>
              ))}
              <button type="submit" disabled={loading}
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ background: 'hsl(var(--primary))' }}>
                {loading && <Loader2 size={15} className="animate-spin" />}
                Redefinir senha
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
