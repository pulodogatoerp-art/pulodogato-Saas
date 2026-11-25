import { useState, useEffect } from 'react';
import { Search, UserPlus, Phone, Mail, Edit2, Trash2, Users, X, Loader2, MapPin, MessageCircle, Download, FileSpreadsheet } from 'lucide-react';
import { exportToCsv, exportToExcel } from '@/lib/export';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useCadastroModal } from '@/contexts/CadastroModalContext';
import { cn } from '@/lib/utils';

interface Cliente {
  id: string;
  nome: string;
  cpf_cnpj: string;
  telefone: string;
  email: string;
  endereco: string;
  observacoes: string;
  whatsapp: string;
  created_at: string;
}

export default function Clientes() {
  const { role } = useAuth();
  const { toast } = useToast();
  const { openClienteModal } = useCadastroModal();
  const isAdmin = role === 'admin';
  const [search, setSearch] = useState('');
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchClientes = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('clientes')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: 'Erro ao carregar clientes', description: error.message, variant: 'destructive' });
    } else {
      setClientes(data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchClientes(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este cliente?')) return;
    setDeletingId(id);
    const { error } = await (supabase as any).from('clientes').delete().eq('id', id);
    if (error) {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Cliente excluído!' });
      setClientes(prev => prev.filter(c => c.id !== id));
    }
    setDeletingId(null);
  };

  const filtered = clientes.filter(c => {
    const q = search.toLowerCase();
    return !q || c.nome.toLowerCase().includes(q) || c.cpf_cnpj.includes(q) || c.telefone.includes(q);
  });
  const hasSearch = search.trim().length > 0;
  const exportRows = hasSearch ? filtered : clientes;

  const buildExport = () => {
    const headers = ['Nome', 'CPF/CNPJ', 'Telefone', 'WhatsApp', 'E-mail', 'Endereço', 'Observações', 'Cadastro'];
    const rows = exportRows.map(c => [
      c.nome, c.cpf_cnpj, c.telefone, c.whatsapp, c.email, c.endereco, c.observacoes,
      c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR') : '',
    ]);
    return { headers, rows };
  };

  const stamp = () => new Date().toISOString().slice(0, 10);

  const handleExportCsv = () => {
    const { headers, rows } = buildExport();
    if (!rows.length) return toast({ title: 'Nada para exportar', variant: 'destructive' });
    exportToCsv(`clientes-${stamp()}.csv`, headers, rows);
    toast({ title: `${rows.length} clientes exportados em CSV` });
  };

  const handleExportExcel = () => {
    const { headers, rows } = buildExport();
    if (!rows.length) return toast({ title: 'Nada para exportar', variant: 'destructive' });
    exportToExcel(`clientes-${stamp()}.xls`, headers, rows);
    toast({ title: `${rows.length} clientes exportados em Excel` });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{clientes.length} clientes cadastrados</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-semibold text-muted-foreground transition-all hover:text-foreground hover:border-primary/50 active:scale-95"
          >
            <Download size={15} />
            CSV
          </button>
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-semibold text-muted-foreground transition-all hover:text-foreground hover:border-primary/50 active:scale-95"
          >
            <FileSpreadsheet size={15} />
            Excel
          </button>
          {isAdmin && (
            <button
              onClick={() => openClienteModal(undefined, fetchClientes)}
              className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-orange transition-all hover:opacity-90 active:scale-95"
              style={{ background: 'hsl(var(--primary))' }}
            >
              <UserPlus size={16} />
              Novo Cliente
            </button>
          )}
        </div>
      </div>

      <div className="relative max-w-md">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Pesquise por nome, CPF/CNPJ, telefone ou e-mail..."
          className="w-full rounded-xl border bg-background pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-primary" size={28} />
        </div>
      ) : clientes.length === 0 ? (
        <div className="rounded-xl border bg-card shadow-sm py-16 text-center">
          <Users size={40} className="mx-auto mb-3 text-muted-foreground/30" />
          <p className="font-semibold text-muted-foreground">Nenhum cliente cadastrado ainda</p>
          <p className="text-sm text-muted-foreground/70 mt-1">Clique em "Novo Cliente" no topo para adicionar o primeiro</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border bg-card shadow-sm py-16 text-center">
          <Search size={40} className="mx-auto mb-3 text-muted-foreground/30" />
          <p className="font-semibold text-muted-foreground">Nenhum cliente encontrado</p>
          <p className="text-sm text-muted-foreground/70 mt-1">Nenhum registro coincide com "{search}"</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 overflow-y-auto max-h-[calc(100vh-18rem)] pr-1">
          {filtered.map(c => (
            <div key={c.id} className="rounded-xl border bg-card shadow-sm p-5 hover:shadow-md transition-all hover:-translate-y-0.5">
              <div className="flex items-start justify-between mb-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-bold text-primary">
                    {c.nome.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </span>
                </div>
                {isAdmin && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => openClienteModal(c, fetchClientes)}
                      className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      disabled={deletingId === c.id}
                      className="p-1.5 rounded-md hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive disabled:opacity-50"
                    >
                      {deletingId === c.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </button>
                  </div>
                )}
              </div>
              <h3 className="font-semibold text-sm">{c.nome}</h3>
              {c.cpf_cnpj && <p className="text-xs text-muted-foreground mb-3">{c.cpf_cnpj}</p>}
              <div className="space-y-1.5">
                {c.telefone && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Phone size={12} className="text-primary" />
                    {c.telefone}
                  </div>
                )}
                {c.email && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Mail size={12} className="text-primary" />
                    {c.email}
                  </div>
                )}
                {c.endereco && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <MapPin size={12} className="text-primary" />
                    {c.endereco}
                  </div>
                )}
                {c.whatsapp && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <MessageCircle size={12} className="text-green-500" />
                    <a href={`https://wa.me/${c.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
                      {c.whatsapp}
                    </a>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
