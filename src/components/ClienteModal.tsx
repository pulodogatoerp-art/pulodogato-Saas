import React, { useState, useEffect } from 'react';
import { X, Loader2, Minus, Maximize2, User, UserPlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ClienteData {
  id?: string;
  nome: string;
  cpf_cnpj?: string;
  telefone?: string;
  email?: string;
  endereco?: string;
  observacoes?: string;
  whatsapp?: string;
  created_at?: string;
}

export interface ClienteModalProps {
  cliente?: ClienteData;
  isOpen?: boolean;
  isMinimized?: boolean;
  onMinimize?: () => void;
  onRestore?: () => void;
  onClose: () => void;
  onSaved: (cliente?: any) => void;
}

const DRAFT_KEY = 'mgn_draft_cliente';

export default function ClienteModal({
  cliente,
  isOpen = true,
  isMinimized = false,
  onMinimize,
  onRestore,
  onClose,
  onSaved,
}: ClienteModalProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  // Carrega rascunho se for novo cliente
  const getInitialForm = () => {
    if (cliente) {
      return {
        nome: cliente.nome ?? '',
        cpf_cnpj: cliente.cpf_cnpj ?? '',
        telefone: cliente.telefone ?? '',
        whatsapp: cliente.whatsapp ?? '',
        email: cliente.email ?? '',
        endereco: cliente.endereco ?? '',
        observacoes: cliente.observacoes ?? '',
      };
    }
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // fallback
    }
    return {
      nome: '',
      cpf_cnpj: '',
      telefone: '',
      whatsapp: '',
      email: '',
      endereco: '',
      observacoes: '',
    };
  };

  const [form, setForm] = useState(getInitialForm);

  // Atualiza form se a prop cliente mudar
  useEffect(() => {
    if (cliente) {
      setForm({
        nome: cliente.nome ?? '',
        cpf_cnpj: cliente.cpf_cnpj ?? '',
        telefone: cliente.telefone ?? '',
        whatsapp: cliente.whatsapp ?? '',
        email: cliente.email ?? '',
        endereco: cliente.endereco ?? '',
        observacoes: cliente.observacoes ?? '',
      });
    }
  }, [cliente]);

  // Salva rascunho automaticamente enquanto digita (apenas se for novo cliente)
  useEffect(() => {
    if (!cliente && (form.nome || form.cpf_cnpj || form.telefone || form.email || form.endereco)) {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
      } catch {
        // ignore
      }
    }
  }, [form, cliente]);

  const clearDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f: any) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const handleClose = () => {
    if (!cliente && (form.nome || form.telefone)) {
      // Mantém rascunho mas fecha
    }
    onClose();
  };

  const handleSubmit = async () => {
    if (!form.nome.trim()) {
      toast({ title: 'Nome é obrigatório', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      let savedData: any = null;
      if (cliente?.id) {
        const { data, error } = await (supabase as any)
          .from('clientes')
          .update(form)
          .eq('id', cliente.id)
          .select()
          .single();
        if (error) throw error;
        savedData = data;
        toast({ title: 'Cliente atualizado com sucesso!' });
      } else {
        const { data, error } = await (supabase as any)
          .from('clientes')
          .insert(form)
          .select()
          .single();
        if (error) throw error;
        savedData = data;
        clearDraft();
        toast({ title: 'Cliente cadastrado com sucesso!' });
      }
      onSaved(savedData);
      onClose();
    } catch (err: any) {
      toast({ title: 'Erro ao salvar cliente', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const fields = [
    { label: 'Nome completo', name: 'nome', col: 2, required: true },
    { label: 'CPF / CNPJ', name: 'cpf_cnpj', col: 1 },
    { label: 'Telefone', name: 'telefone', col: 1 },
    { label: 'WhatsApp', name: 'whatsapp', col: 1 },
    { label: 'E-mail', name: 'email', col: 1, type: 'email' },
    { label: 'Endereço', name: 'endereco', col: 2 },
    { label: 'Observações', name: 'observacoes', col: 2, textarea: true },
  ];

  if (!isOpen) return null;

  // Visualização Minimizada (Dock flutuante)
  if (isMinimized) {
    return (
      <div
        onClick={onRestore}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-3 bg-card border-2 border-primary/50 shadow-2xl rounded-2xl p-3 px-4 cursor-pointer hover:border-primary transition-all animate-bounce-in max-w-sm"
        style={{ boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)' }}
      >
        <div className="p-2 rounded-xl bg-primary/10 text-primary">
          <User size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            {cliente ? 'Editando Cliente' : 'Cadastrando Cliente (Aberto)'}
          </p>
          <p className="text-sm font-medium text-foreground truncate">
            {form.nome.trim() || 'Novo Cliente (clique para expandir)'}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRestore?.(); }}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
            title="Restaurar / Abrir Janela"
          >
            <Maximize2 size={16} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleClose(); }}
            className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
            title="Fechar"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative bg-background rounded-2xl shadow-xl w-full max-w-lg border overflow-hidden flex flex-col max-h-[90vh] animate-fade-in">
        {/* Header com botões de Minimizar e Fechar */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <UserPlus size={18} />
            </div>
            <div>
              <h2 className="font-bold text-base text-foreground leading-tight">
                {cliente ? 'Editar Cliente' : 'Novo Cliente'}
              </h2>
              <p className="text-xs text-muted-foreground">
                Permanece aberto mesmo se navegar entre páginas
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {onMinimize && (
              <button
                type="button"
                onClick={onMinimize}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Minimizar janela para navegar livremente pelo sistema"
              >
                <Minus size={18} />
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Fechar"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Formulário */}
        <div className="px-6 py-5 grid grid-cols-2 gap-4 overflow-y-auto">
          {fields.map(({ label, name, col, required, type, textarea }) => (
            <div key={name} className={col === 2 ? 'col-span-2' : ''}>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                {label} {required && <span className="text-destructive">*</span>}
              </label>
              {textarea ? (
                <textarea
                  name={name}
                  value={(form as any)[name]}
                  onChange={handleChange}
                  rows={2}
                  className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none"
                />
              ) : (
                <input
                  name={name}
                  type={type ?? 'text'}
                  value={(form as any)[name]}
                  onChange={handleChange}
                  className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t bg-muted/10">
          <button
            type="button"
            onClick={onMinimize || handleClose}
            className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors text-muted-foreground"
          >
            {onMinimize ? 'Minimizar' : 'Cancelar'}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ background: 'hsl(var(--primary))' }}
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {cliente ? 'Salvar Alterações' : 'Cadastrar Cliente'}
          </button>
        </div>
      </div>
    </div>
  );
}
