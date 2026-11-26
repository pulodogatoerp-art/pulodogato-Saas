import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Plus, Trash2, FileText, MessageCircle, ShoppingCart, User, UserCheck, Package, X, ChevronDown, Eye, Printer, ArrowLeft, Loader2, List, Edit2, CreditCard, QrCode, TrendingUp, Receipt } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import logoGAutopecas from '@/assets/logo-g-autopecas.jpg';
import ProdutoModal, { SimulacaoCustoSnapshot } from '@/components/ProdutoModal';
import { useCadastroModal } from '@/contexts/CadastroModalContext';
import BuscaPecasIA from '@/components/BuscaPecasIA';
import DanfeModal from '@/components/DanfeModal';
import DanfeNfceModal from '@/components/DanfeNfceModal';
import { NFeVendaData, NFeResultado, emitirDocumentoFiscal } from '@/services/nfeService';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */
interface ClienteDB {
  id: string; nome: string; telefone: string; email: string; cpf_cnpj: string; endereco: string;
}
interface ProdutoDB {
  id: string; codigo: string; codigo_fabrica: string; codigo_interno: string;
  nome: string; marca: string; aplicacao: string; categoria: string; tipo_veiculo: string;
  preco_venda: number; estoque_total: number;
}
interface ItemLocal {
  produto: ProdutoDB; quantidade: number; preco_unitario: number;
}
interface OrcamentoDB {
  id: string; numero: string; cliente_id: string | null; cliente_nome: string; cliente_telefone: string;
  cliente_cpf_cnpj: string; status: string; subtotal: number; desconto: number; total: number;
  observacoes: string; created_by: string | null; created_at: string; updated_at: string;
  frete_transportadora: string; frete_valor: number;
  simulacoes_custo?: any;
}
interface ItemOrcamentoDB {
  id: string; orcamento_id: string; produto_id: string | null; produto_nome: string;
  produto_codigo: string; produto_codigo_fabrica: string; produto_codigo_interno: string;
  produto_marca: string; quantidade: number; preco_unitario: number; subtotal: number;
}

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */
function useClientes(search: string) {
  return useQuery({
    queryKey: ['clientes', search],
    queryFn: async () => {
      let q = supabase.from('clientes').select('id, nome, telefone, email, cpf_cnpj, endereco');
      if (search) q = q.or(`nome.ilike.%${search}%,cpf_cnpj.ilike.%${search}%`);
      const { data, error } = await q.limit(8);
      if (error) throw error;
      return (data ?? []) as ClienteDB[];
    },
    enabled: search.length > 0,
  });
}

function useProdutos(search: string) {
  return useQuery({
    queryKey: ['produtos-search', search],
    queryFn: async () => {
      const tokens = search
        .replace(/[,()]/g, ' ')
        .split(/\s+/)
        .map(t => t.trim())
        .filter(t => t.length > 0)
        .slice(0, 5);
      let q = supabase
        .from('produtos')
        .select('id, codigo, codigo_fabrica, codigo_interno, nome, marca, aplicacao, categoria, tipo_veiculo, preco_venda, estoque_total');
      for (const t of tokens) {
        const esc = t.replace(/[%,]/g, ' ');
        q = q.or(
          `nome.ilike.%${esc}%,codigo.ilike.%${esc}%,codigo_fabrica.ilike.%${esc}%,codigo_interno.ilike.%${esc}%,aplicacao.ilike.%${esc}%,marca.ilike.%${esc}%,categoria.ilike.%${esc}%,tipo_veiculo.ilike.%${esc}%`
        );
      }
      const { data, error } = await q.limit(8);
      if (error) throw error;
      return (data ?? []) as ProdutoDB[];
    },
    enabled: search.length > 1,
  });
}

function useOrcamentos() {
  return useQuery({
    queryKey: ['orcamentos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orcamentos')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row: any) => {
        let meta: any = {};
        if (row.observacoes && typeof row.observacoes === 'string') {
          try {
            if (row.observacoes.trim().startsWith('{')) {
              meta = JSON.parse(row.observacoes);
            }
          } catch { }
        }
        return {
          ...row,
          cliente_cpf_cnpj: row.cliente_cpf_cnpj || meta.cliente_cpf_cnpj || '',
          cliente_telefone: row.cliente_telefone || meta.cliente_telefone || '',
          simulacoes_custo: row.simulacoes_custo || meta.simulacoes_custo || [],
          observacoes: meta.__meta ? (meta.user_obs || '') : (row.observacoes || ''),
        } as OrcamentoDB;
      });
    },
  });
}

function useItensOrcamento(orcamentoId: string | null) {
  return useQuery({
    queryKey: ['itens_orcamento', orcamentoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('itens_orcamento')
        .select('*')
        .eq('orcamento_id', orcamentoId!);
      if (error) throw error;
      return (data ?? []) as ItemOrcamentoDB[];
    },
    enabled: !!orcamentoId,
  });
}

function useEmpresa() {
  return useQuery({
    queryKey: ['configuracoes-empresa'],
    queryFn: async () => {
      const { data } = await supabase.from('configuracoes').select('chave, valor');
      const map: Record<string, string> = {};
      (data ?? []).forEach((r: any) => { map[r.chave] = r.valor; });
      return map;
    },
  });
}

function useLucroOrcamento(itens: ItemOrcamentoDB[] | undefined, enabled: boolean) {
  const ids = (itens ?? [])
    .map(i => i.produto_id)
    .filter((v): v is string => !!v);
  const key = ids.slice().sort().join(',');
  return useQuery({
    queryKey: ['lucro-orcamento', key],
    enabled: enabled && ids.length > 0,
    queryFn: async () => {
      const [prodRes, lotesRes] = await Promise.all([
        supabase
          .from('produtos')
          .select('id, icms_percentual, pis_percentual, cofins_percentual, ipi_percentual')
          .in('id', ids),
        supabase
          .from('lotes')
          .select('produto_id, preco_custo, created_at')
          .in('produto_id', ids)
          .order('created_at', { ascending: false }),
      ]);
      const custoPorProduto: Record<string, number> = {};
      (lotesRes.data ?? []).forEach((l: any) => {
        if (custoPorProduto[l.produto_id] === undefined) {
          custoPorProduto[l.produto_id] = Number(l.preco_custo) || 0;
        }
      });
      const impostosPorProduto: Record<string, number> = {};
      (prodRes.data ?? []).forEach((p: any) => {
        impostosPorProduto[p.id] =
          (Number(p.icms_percentual) || 0) +
          (Number(p.pis_percentual) || 0) +
          (Number(p.cofins_percentual) || 0) +
          (Number(p.ipi_percentual) || 0);
      });
      return { custoPorProduto, impostosPorProduto };
    },
  });
}

function useLucroPorIds(ids: string[], enabled: boolean) {
  const key = ids.slice().sort().join(',');
  return useQuery({
    queryKey: ['lucro-orcamento', key],
    enabled: enabled && ids.length > 0,
    queryFn: async () => {
      const [prodRes, lotesRes] = await Promise.all([
        supabase
          .from('produtos')
          .select('id, icms_percentual, pis_percentual, cofins_percentual, ipi_percentual')
          .in('id', ids),
        supabase
          .from('lotes')
          .select('produto_id, preco_custo, created_at')
          .in('produto_id', ids)
          .order('created_at', { ascending: false }),
      ]);
      const custoPorProduto: Record<string, number> = {};
      (lotesRes.data ?? []).forEach((l: any) => {
        if (custoPorProduto[l.produto_id] === undefined) {
          custoPorProduto[l.produto_id] = Number(l.preco_custo) || 0;
        }
      });
      const impostosPorProduto: Record<string, number> = {};
      (prodRes.data ?? []).forEach((p: any) => {
        impostosPorProduto[p.id] =
          (Number(p.icms_percentual) || 0) +
          (Number(p.pis_percentual) || 0) +
          (Number(p.cofins_percentual) || 0) +
          (Number(p.ipi_percentual) || 0);
      });
      return { custoPorProduto, impostosPorProduto };
    },
  });
}

/* ------------------------------------------------------------------ */
/* Format helpers                                                      */
/* ------------------------------------------------------------------ */
const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const statusLabel: Record<string, { label: string; cls: string }> = {
  pendente: { label: 'Pendente', cls: 'bg-amber-500/15 text-amber-600' },
  aprovado: { label: 'Aprovado', cls: 'bg-emerald-500/15 text-emerald-600' },
  cancelado: { label: 'Cancelado', cls: 'bg-red-500/15 text-red-600' },
  finalizado: { label: 'Finalizado', cls: 'bg-primary/15 text-primary' },
};

/* ------------------------------------------------------------------ */
/* CupomFiscal Component                                               */
/* ------------------------------------------------------------------ */
function CupomFiscal({ orcamento, itens, empresa }: {
  orcamento: OrcamentoDB; itens: ItemOrcamentoDB[]; empresa: Record<string, string>;
}) {
  const cupomRef = useRef<HTMLDivElement>(null);
  const [showCodigo, setShowCodigo] = useState(true);
  const [showFabrica, setShowFabrica] = useState(false);
  const [showInterno, setShowInterno] = useState(false);

  const handlePrint = () => {
    const content = cupomRef.current;
    if (!content) return;
    const w = window.open('', '_blank', 'width=320,height=600');
    if (!w) return;
    const clone = content.cloneNode(true) as HTMLElement;
    w.document.write(`
      <html><head><title>Cupom</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Courier New', monospace; font-size: 11px; padding: 8px; width: 280px; }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .line { border-top: 1px dashed #333; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; }
        .item-name { font-size: 10px; }
        .total-row { font-size: 13px; font-weight: bold; }
      </style></head><body></body></html>
    `);
    w.document.close();
    w.document.body.appendChild(clone);
    w.document.close();
    w.print();
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 rounded-lg border bg-card px-3 py-2">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="font-semibold text-muted-foreground uppercase tracking-wide">Exibir códigos:</span>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={showCodigo} onChange={e => setShowCodigo(e.target.checked)} className="accent-primary" />
            <span>Produto</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={showFabrica} onChange={e => setShowFabrica(e.target.checked)} className="accent-primary" />
            <span>Fábrica</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={showInterno} onChange={e => setShowInterno(e.target.checked)} className="accent-primary" />
            <span>Interno</span>
          </label>
        </div>
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted transition-colors"
        >
          <Printer size={14} /> Imprimir Cupom
        </button>
      </div>
      <div
        ref={cupomRef}
        className="mx-auto bg-white text-black rounded-lg border shadow-sm p-5 max-w-[320px]"
        style={{ fontFamily: "'Courier New', monospace", fontSize: '11px' }}
      >
        {/* Header */}
        <div className="text-center mb-1">
          <img
            src={logoGAutopecas.startsWith('data:') || logoGAutopecas.startsWith('http') ? logoGAutopecas : `${window.location.origin}${logoGAutopecas}`}
            alt="G Autopeças & Acessórios"
            style={{ width: '110px', height: 'auto', margin: '0 auto 6px', display: 'block', borderRadius: '10px' }}
            crossOrigin="anonymous"
          />
          <p className="font-bold text-sm">{empresa.empresa_nome_fantasia || 'G Autopeças & Acessórios'}</p>
          {empresa.empresa_nome && empresa.empresa_nome !== (empresa.empresa_nome_fantasia || 'G Autopeças & Acessórios') && (
            <p className="text-[10px] font-semibold">{empresa.empresa_nome}</p>
          )}
          {empresa.empresa_cnpj && <p>CNPJ: {empresa.empresa_cnpj}</p>}
          {empresa.empresa_endereco && <p className="text-[10px]">{empresa.empresa_endereco}</p>}
          {empresa.empresa_telefone && <p>Tel: {empresa.empresa_telefone}</p>}
        </div>

        <div className="border-t border-dashed border-gray-400 my-2" />

        <p className="text-center font-bold">ORÇAMENTO</p>
        <div className="flex justify-between text-[10px]">
          <span>Nº {orcamento.numero}</span>
          <span>{fmtDate(orcamento.created_at)}</span>
        </div>

        <div className="border-t border-dashed border-gray-400 my-2" />

        {/* Cliente */}
        <p className="font-bold text-[10px]">CLIENTE:</p>
        <p>{orcamento.cliente_nome}</p>
        {orcamento.cliente_cpf_cnpj && <p className="text-[10px]">CPF/CNPJ: {orcamento.cliente_cpf_cnpj}</p>}

        <div className="border-t border-dashed border-gray-400 my-2" />

        {/* Header itens */}
        <div className="flex justify-between font-bold text-[10px]">
          <span>ITEM</span>
          <span>TOTAL</span>
        </div>

        <div className="border-t border-dashed border-gray-400 my-1" />

        {/* Items */}
        {itens.map((item, i) => (
          <div key={item.id} className="mb-1.5">
            <p className="text-[10px] font-bold">
              {String(i + 1).padStart(3, '0')}
              {showCodigo && item.produto_codigo ? ` ${item.produto_codigo}` : ''}
              {showFabrica && item.produto_codigo_fabrica ? ` · F:${item.produto_codigo_fabrica}` : ''}
              {showInterno && item.produto_codigo_interno ? ` · I:${item.produto_codigo_interno}` : ''}
            </p>
            <p className="text-[10px]">{item.produto_nome}{item.produto_marca ? ` (${item.produto_marca})` : ''}</p>
            <div className="flex justify-between text-[10px]">
              <span>{item.quantidade}x {fmt(item.preco_unitario)}</span>
              <span className="font-bold">{fmt(item.subtotal)}</span>
            </div>
          </div>
        ))}

        <div className="border-t border-dashed border-gray-400 my-2" />

        {/* Totals */}
        <div className="flex justify-between text-[10px]">
          <span>SUBTOTAL</span>
          <span>{fmt(orcamento.subtotal)}</span>
        </div>
        {orcamento.desconto > 0 && (
          <div className="flex justify-between text-[10px]">
            <span>DESCONTO</span>
            <span>-{fmt(orcamento.desconto)}</span>
          </div>
        )}
        {Number(orcamento.frete_valor) > 0 && (
          <div className="flex justify-between text-[10px]">
            <span>FRETE{orcamento.frete_transportadora ? ` (${orcamento.frete_transportadora})` : ''}</span>
            <span>{fmt(Number(orcamento.frete_valor))}</span>
          </div>
        )}

        <div className="border-t border-dashed border-gray-400 my-2" />

        <div className="flex justify-between font-bold text-sm">
          <span>TOTAL</span>
          <span>{fmt(orcamento.total)}</span>
        </div>

        <div className="border-t border-dashed border-gray-400 my-2" />

        <p className="text-center text-[10px]">Orçamento válido por 3 dias</p>
        <p className="text-center text-[10px]">Obrigado pela preferência!</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main Page                                                           */
/* ------------------------------------------------------------------ */
function ConfirmDelete({ onCancel, onConfirm, loading }: { onCancel: () => void; onConfirm: () => void; loading: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-background rounded-2xl shadow-lg w-full max-w-sm animate-fade-in">
        <div className="px-6 py-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
              <Trash2 size={18} className="text-destructive" />
            </div>
            <h2 className="font-bold text-lg">Excluir orçamento?</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Esta ação removerá o orçamento e todos os seus itens. Não pode ser desfeita.
          </p>
        </div>
        <div className="flex gap-3 px-6 py-4 border-t">
          <button onClick={onCancel} className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-muted">
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-white bg-destructive hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={14} className="animate-spin" />} Excluir
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Orcamentos() {
  const { user, nome, role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [view, setView] = useState<'list' | 'new' | 'detail' | 'edit'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingOrcId, setEditingOrcId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // New orcamento state
  const [clienteSearch, setClienteSearch] = useState('');
  const [clienteSelecionado, setClienteSelecionado] = useState<ClienteDB | null>(null);
  const [clienteFechamento, setClienteFechamento] = useState<ClienteDB | null>(null);
  const [showAlterarCliente, setShowAlterarCliente] = useState(false);
  const [buscaClienteFechamento, setBuscaClienteFechamento] = useState('');
  const [produtoSearch, setProdutoSearch] = useState('');
  const [itens, setItens] = useState<ItemLocal[]>([]);
  const [desconto, setDesconto] = useState(0);
  const [freteTransportadora, setFreteTransportadora] = useState('');
  const [freteValor, setFreteValor] = useState(0);
  const [simulacoes, setSimulacoes] = useState<SimulacaoCustoSnapshot[]>([]);
  const { openProdutoModal, openClienteModal } = useCadastroModal();
  const [showClienteDD, setShowClienteDD] = useState(false);
  const [showProdutoDD, setShowProdutoDD] = useState(false);
  const [showNovoCliente, setShowNovoCliente] = useState(false);
  const [novoCliente, setNovoCliente] = useState({ nome: '', telefone: '', cpf_cnpj: '', email: '', endereco: '' });
  const [savingCliente, setSavingCliente] = useState(false);
  const [showNovoProduto, setShowNovoProduto] = useState(false);
  const [savingProduto, setSavingProduto] = useState(false);

  const cadastrarCliente = async () => {
    if (!novoCliente.nome.trim()) {
      toast({ title: 'Nome é obrigatório', variant: 'destructive' });
      return;
    }
    setSavingCliente(true);
    try {
      const { data, error } = await supabase.from('clientes').insert(novoCliente).select('id, nome, telefone, email, cpf_cnpj, endereco').single();
      if (error) throw error;
      setClienteSelecionado(data as ClienteDB);
      setShowNovoCliente(false);
      setNovoCliente({ nome: '', telefone: '', cpf_cnpj: '', email: '', endereco: '' });
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      toast({ title: 'Cliente cadastrado!' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSavingCliente(false);
    }
  };

  const { data: clientes } = useClientes(clienteSearch);
  const { data: clientesFechamentoList } = useClientes(buscaClienteFechamento);
  const { data: produtos } = useProdutos(produtoSearch);
  const { data: orcamentos, isLoading } = useOrcamentos();
  const { data: itensDetail } = useItensOrcamento(selectedId);
  const { data: empresa } = useEmpresa();
  const { data: lucroData } = useLucroOrcamento(itensDetail, role === 'admin' && view === 'detail');
  const editorIds = itens.map(i => i.produto.id);
  const { data: lucroEditor } = useLucroPorIds(
    editorIds,
    role === 'admin' && (view === 'new' || view === 'edit') && editorIds.length > 0
  );
  const { data: markupPadrao } = useQuery({
    queryKey: ['configuracoes', 'markup_padrao'],
    queryFn: async () => {
      const { data } = await supabase.from('configuracoes').select('valor').eq('chave', 'markup_padrao').single();
      return data?.valor ?? '30';
    },
  });

  const { data: configFiscal } = useQuery({
    queryKey: ['configuracoes-fiscal'],
    queryFn: async () => {
      const { data } = await supabase.from('configuracoes').select('chave, valor');
      const map: Record<string, string> = {};
      (data ?? []).forEach((r: any) => { map[r.chave] = r.valor; });
      return map;
    },
  });

  const [emissaoFiscal, setEmissaoFiscal] = useState<'nfce' | 'nfe' | 'nenhum'>('nfce');
  const [danfeAtivo, setDanfeAtivo] = useState<{ dados: NFeVendaData; resultado: NFeResultado } | null>(null);

  const { data: categoriasDisponiveis = [] } = useQuery({
    queryKey: ['produtos-categorias'],
    queryFn: async () => {
      const { data } = await (supabase as any).from('produtos').select('categoria');
      const set = new Set<string>((data ?? []).map((r: any) => r.categoria).filter(Boolean));
      return Array.from(set).sort() as string[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const selectedOrc = orcamentos?.find(o => o.id === selectedId);

  const subtotal = itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0);
  // Garantir que o desconto nunca ultrapasse o subtotal
  const descontoEfetivo = Math.min(Math.max(0, desconto), subtotal);
  const descontoPct = subtotal > 0 ? Number(((descontoEfetivo / subtotal) * 100).toFixed(2)) : 0;
  const total = Math.max(0, subtotal - descontoEfetivo + freteValor);

  // Reajusta o desconto se o subtotal mudar e o valor atual ficar inválido
  useEffect(() => {
    if (desconto > subtotal) setDesconto(Number(subtotal.toFixed(2)));
    if (desconto < 0) setDesconto(0);
  }, [subtotal]);

  // Carrega itens pendentes enviados do carrinho do balcão de produtos
  useEffect(() => {
    try {
      const pending = localStorage.getItem('pecafacil_carrinho_pendente');
      if (pending) {
        const parsed = JSON.parse(pending);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setItens(parsed);
          setView('new');
          localStorage.removeItem('pecafacil_carrinho_pendente');
          toast({ title: 'Itens do carrinho transferidos para o novo orçamento/DAV!' });
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar carrinho pendente:', e);
    }
  }, []);

  const addItem = (p: ProdutoDB) => {
    setItens(prev => {
      const existing = prev.find(i => i.produto.id === p.id);
      if (existing) return prev.map(i => i.produto.id === p.id ? { ...i, quantidade: i.quantidade + 1 } : i);
      return [...prev, { produto: p, quantidade: 1, preco_unitario: p.preco_venda }];
    });
    setProdutoSearch('');
    setShowProdutoDD(false);
  };

  const removeItem = (id: string) => setItens(prev => prev.filter(i => i.produto.id !== id));
  const updateQty = (id: string, qty: number) => {
    if (qty < 1) return removeItem(id);
    setItens(prev => prev.map(i => i.produto.id === id ? { ...i, quantidade: qty } : i));
  };

  const cadastrarProduto = async (data: Record<string, any>) => {
    setSavingProduto(true);
    try {
      const lote = data._lote;
      delete data._lote;
      delete data.preco_custo;
      delete data.frete_custo;
      const { data: inserted, error } = await (supabase as any)
        .from('produtos')
        .insert(data)
        .select('id, codigo, codigo_fabrica, codigo_interno, nome, marca, aplicacao, categoria, tipo_veiculo, preco_venda, estoque_total')
        .single();
      if (error) throw error;
      if (inserted && lote && (lote.fornecedor || lote.preco_custo > 0 || lote.quantidade > 0)) {
        await (supabase as any).from('lotes').insert({
          produto_id: inserted.id,
          fornecedor: lote.fornecedor || '—',
          preco_custo: lote.preco_custo,
          quantidade: lote.quantidade,
        });
        if (lote.quantidade > 0) {
          await (supabase as any)
            .from('produtos')
            .update({ estoque_total: lote.quantidade })
            .eq('id', inserted.id);
          (inserted as any).estoque_total = lote.quantidade;
        }
      }
      queryClient.invalidateQueries({ queryKey: ['produtos'] });
      queryClient.invalidateQueries({ queryKey: ['produtos-search'] });
      queryClient.invalidateQueries({ queryKey: ['produtos-categorias'] });
      setShowNovoProduto(false);
      toast({ title: 'Produto cadastrado!' });
      // Adiciona automaticamente ao orçamento
      if (inserted) {
        addItem(inserted as ProdutoDB);
      }
    } catch (err: any) {
      toast({ title: 'Erro ao cadastrar produto', description: err.message, variant: 'destructive' });
    } finally {
      setSavingProduto(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (itens.length === 0) throw new Error('Adicione pelo menos uma peça ao orçamento');

      // Se nenhum cliente foi selecionado, assume automaticamente Consumidor Final (Balcão)
      const clienteAtivo = clienteSelecionado || {
        id: '',
        nome: 'Consumidor Final (Balcão)',
        telefone: '',
        cpf_cnpj: '000.000.000-00',
        email: '',
        endereco: 'Balcão da Loja'
      };

      // Validar se cliente_id é um UUID válido no banco (evita erro de FK com ID falso)
      const validClienteId = (clienteAtivo.id && clienteAtivo.id !== '00000000-0000-0000-0000-000000000001')
        ? clienteAtivo.id
        : null;

      // Armazena dados extras de forma resiliente dentro de observacoes como metadados JSON
      // Isso previne erro de schema cache caso as colunas 'cliente_cpf_cnpj' ou 'simulacoes_custo' não existam na tabela
      const observacoesMetadata = JSON.stringify({
        __meta: true,
        cliente_cpf_cnpj: clienteAtivo.cpf_cnpj || '',
        cliente_telefone: clienteAtivo.telefone || '',
        simulacoes_custo: simulacoes || [],
      });

      const orcamentoPayload: any = {
        cliente_id: validClienteId,
        cliente_nome: clienteAtivo.nome,
        subtotal,
        desconto,
        total,
        frete_transportadora: freteTransportadora || '',
        frete_valor: freteValor || 0,
        observacoes: observacoesMetadata,
      };

      if (editingOrcId) {
        // UPDATE existing orcamento
        const { error: orcErr } = await supabase.from('orcamentos').update(orcamentoPayload).eq('id', editingOrcId);
        if (orcErr) throw orcErr;

        // Delete old items and re-insert
        const { error: delErr } = await supabase.from('itens_orcamento').delete().eq('orcamento_id', editingOrcId);
        if (delErr) throw delErr;

        const rows = itens.map(i => ({
          orcamento_id: editingOrcId,
          produto_id: i.produto.id,
          produto_nome: i.produto.nome,
          produto_codigo: i.produto.codigo,
          produto_codigo_fabrica: i.produto.codigo_fabrica ?? '',
          produto_codigo_interno: i.produto.codigo_interno ?? '',
          produto_marca: i.produto.marca,
          quantidade: i.quantidade,
          preco_unitario: i.preco_unitario,
          subtotal: i.quantidade * i.preco_unitario,
        }));
        const { error: itemErr } = await supabase.from('itens_orcamento').insert(rows);
        if (itemErr) throw itemErr;

        return editingOrcId;
      } else {
        // CREATE new orcamento
        const { count } = await supabase.from('orcamentos').select('*', { count: 'exact', head: true });
        const seq = (count ?? 0) + 1;
        const numero = `ORC-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`;

        const { data: orc, error: orcErr } = await supabase.from('orcamentos').insert({
          ...orcamentoPayload,
          numero,
          created_by: user?.id,
          status: 'pendente',
        }).select('id').single();

        if (orcErr) throw orcErr;

        const rows = itens.map(i => ({
          orcamento_id: orc.id,
          produto_id: i.produto.id,
          produto_nome: i.produto.nome,
          produto_codigo: i.produto.codigo,
          produto_codigo_fabrica: i.produto.codigo_fabrica ?? '',
          produto_codigo_interno: i.produto.codigo_interno ?? '',
          produto_marca: i.produto.marca,
          quantidade: i.quantidade,
          preco_unitario: i.preco_unitario,
          subtotal: i.quantidade * i.preco_unitario,
        }));

        const { error: itemErr } = await supabase.from('itens_orcamento').insert(rows);
        if (itemErr) throw itemErr;

        return orc.id;
      }
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['orcamentos'] });
      queryClient.invalidateQueries({ queryKey: ['itens_orcamento'] });
      toast({ title: editingOrcId ? 'Orçamento atualizado!' : 'Orçamento salvo com sucesso!' });
      resetForm();
      setSelectedId(id);
      setView('detail');
    },
    onError: (e: any) => {
      toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setClienteSelecionado(null);
    setClienteSearch('');
    setProdutoSearch('');
    setItens([]);
    setDesconto(0);
    setFreteTransportadora('');
    setFreteValor(0);
    setSimulacoes([]);
    setEditingOrcId(null);
  };

  const handleDeleteOrcamento = async (id: string) => {
    setDeleting(true);
    try {
      const { error: itensErr } = await supabase.from('itens_orcamento').delete().eq('orcamento_id', id);
      if (itensErr) throw itensErr;
      const { error: orcErr } = await supabase.from('orcamentos').delete().eq('id', id);
      if (orcErr) throw orcErr;
      toast({ title: 'Orçamento excluído!' });
      queryClient.invalidateQueries({ queryKey: ['orcamentos'] });
      queryClient.invalidateQueries({ queryKey: ['itens_orcamento'] });
      setConfirmDeleteId(null);
      if (selectedId === id) {
        setSelectedId(null);
        setView('list');
      }
    } catch (e: any) {
      toast({ title: 'Erro ao excluir', description: e.message, variant: 'destructive' });
    }
    setDeleting(false);
  };

  // Load orcamento into edit mode
  const loadForEdit = async (orc: OrcamentoDB) => {
    // Fetch client data
    if (orc.cliente_id) {
      const { data: cli } = await supabase.from('clientes').select('id, nome, telefone, email, cpf_cnpj, endereco').eq('id', orc.cliente_id).single();
      if (cli) setClienteSelecionado(cli as ClienteDB);
    } else {
      setClienteSelecionado({ id: '', nome: orc.cliente_nome, telefone: orc.cliente_telefone, email: '', cpf_cnpj: orc.cliente_cpf_cnpj, endereco: '' });
    }

    // Fetch items and map to ItemLocal
    const { data: items } = await supabase.from('itens_orcamento').select('*').eq('orcamento_id', orc.id);
    if (items) {
      const mapped: ItemLocal[] = items.map((i: any) => ({
        produto: {
          id: i.produto_id ?? '',
          codigo: i.produto_codigo,
          codigo_fabrica: i.produto_codigo_fabrica ?? '',
          codigo_interno: i.produto_codigo_interno ?? '',
          nome: i.produto_nome,
          marca: i.produto_marca ?? '',
          aplicacao: '',
          categoria: '',
          tipo_veiculo: '',
          preco_venda: i.preco_unitario,
          estoque_total: 0,
        },
        quantidade: i.quantidade,
        preco_unitario: i.preco_unitario,
      }));
      setItens(mapped);
    }

    setDesconto(orc.desconto);
    setFreteTransportadora(orc.frete_transportadora);
    setFreteValor(Number(orc.frete_valor));
    setSimulacoes(Array.isArray(orc.simulacoes_custo) ? (orc.simulacoes_custo as SimulacaoCustoSnapshot[]) : []);
    setEditingOrcId(orc.id);
    setView('edit');
  };

  /* ---------------------------------------------------------------- */
  /* Finalizar Venda mutation                                          */
  /* ---------------------------------------------------------------- */
  const [showFinalizarModal, setShowFinalizarModal] = useState(false);
  const [showWaModal, setShowWaModal] = useState(false);
  const [waNumber, setWaNumber] = useState('');
  const [formaPagamento, setFormaPagamento] = useState('Dinheiro');

  const [mpPixData, setMpPixData] = useState<{ qr_code: string; qr_code_base64: string; ticket_url: string; payment_id: string } | null>(null);
  const [mpInstallments, setMpInstallments] = useState<{ installments: number; installment_amount: number; total_amount: number; has_interest: boolean }[]>([]);
  const [mpSelectedInstallment, setMpSelectedInstallment] = useState(1);
  const [mpCardLink, setMpCardLink] = useState<string | null>(null);
  const [mpLoading, setMpLoading] = useState(false);

  const finalizarMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOrc || !itensDetail) throw new Error('Dados incompletos');

      // 1. Get next venda number
      const { count } = await supabase.from('vendas').select('*', { count: 'exact', head: true });
      const seq = (count ?? 0) + 1;
      const numero = `VDA-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`;

      // Cliente definitivo para a venda (se alterado na hora de fechar)
      const cliFinalId = clienteFechamento?.id || selectedOrc.cliente_id;
      const validCliFinalId = (cliFinalId && cliFinalId !== '00000000-0000-0000-0000-000000000001') ? cliFinalId : null;
      const cliFinalNome = clienteFechamento?.nome || selectedOrc.cliente_nome || 'Consumidor Final (Balcão)';
      const rawCpf = clienteFechamento?.cpf_cnpj || selectedOrc.cliente_cpf_cnpj || '';
      const cliFinalCpf = rawCpf.replace(/\D/g, '') === '00000000000' ? '' : rawCpf;
      const cliFinalTel = clienteFechamento?.telefone || selectedOrc.cliente_telefone || '';

      // 2. Create venda - usa apenas colunas padrão da tabela vendas no Supabase
      const { data: venda, error: vendaErr } = await supabase.from('vendas').insert({
        orcamento_id: selectedOrc.id,
        numero,
        cliente_id: validCliFinalId,
        cliente_nome: cliFinalNome,
        total: selectedOrc.total,
        forma_pagamento: formaPagamento,
        frete_transportadora: selectedOrc.frete_transportadora || '',
        frete_valor: selectedOrc.frete_valor || 0,
        created_by: user?.id,
      } as any).select('id').single();

      if (vendaErr) throw vendaErr;

      // Se o cliente foi substituído no fechamento, atualiza também o orçamento de forma segura
      if (clienteFechamento) {
        let metaExistente: any = {};
        try {
          if (selectedOrc.observacoes && typeof selectedOrc.observacoes === 'string' && selectedOrc.observacoes.trim().startsWith('{')) {
            metaExistente = JSON.parse(selectedOrc.observacoes);
          }
        } catch { }

        const obsAtualizada = JSON.stringify({
          ...metaExistente,
          __meta: true,
          cliente_cpf_cnpj: clienteFechamento.cpf_cnpj || '',
          cliente_telefone: clienteFechamento.telefone || '',
        });

        await supabase.from('orcamentos').update({
          cliente_id: (clienteFechamento.id && clienteFechamento.id !== '00000000-0000-0000-0000-000000000001') ? clienteFechamento.id : null,
          cliente_nome: clienteFechamento.nome,
          observacoes: obsAtualizada,
        } as any).eq('id', selectedOrc.id);
      }

      // 3. Copy items to itens_venda
      const rows = itensDetail.map(i => ({
        venda_id: venda.id,
        produto_id: i.produto_id,
        produto_nome: i.produto_nome,
        produto_codigo: i.produto_codigo,
        produto_codigo_fabrica: (i as any).produto_codigo_fabrica ?? '',
        produto_codigo_interno: (i as any).produto_codigo_interno ?? '',
        produto_marca: i.produto_marca ?? '',
        quantidade: i.quantidade,
        preco_unitario: i.preco_unitario,
        subtotal: i.subtotal,
      }));

      const { error: itemErr } = await supabase.from('itens_venda').insert(rows);
      if (itemErr) throw itemErr;

      // 4. Update estoque atomically for each product
      for (const item of itensDetail) {
        if (!item.produto_id) continue;
        await (supabase as any).rpc('decrement_stock', {
          pid: item.produto_id,
          qty: item.quantidade,
        });
      }

      // 5. Update orcamento status
      const { error: statusErr } = await supabase
        .from('orcamentos')
        .update({ status: 'finalizado' })
        .eq('id', selectedOrc.id);
      if (statusErr) throw statusErr;

      return {
        vendaId: venda.id,
        numero,
        cliFinalNome,
        cliFinalCpf,
        cliFinalTel,
      };
    },
    onSuccess: async (dadosVenda: { vendaId: string; numero: string; cliFinalNome: string; cliFinalCpf: string; cliFinalTel: string }) => {
      queryClient.invalidateQueries({ queryKey: ['orcamentos'] });
      queryClient.invalidateQueries({ queryKey: ['vendas'] });
      queryClient.invalidateQueries({ queryKey: ['produtos-search'] });
      setShowFinalizarModal(false);

      if (emissaoFiscal !== 'nenhum' && selectedOrc && itensDetail) {
        try {
          const isNfce = emissaoFiscal === 'nfce';
          const serie = isNfce ? (configFiscal?.['nfce_serie'] || '1') : (configFiscal?.['nfe_serie'] || '1');
          const proximoNum = parseInt(isNfce ? (configFiscal?.['nfce_proximo_numero'] || '1') : (configFiscal?.['nfe_proximo_numero'] || '1'), 10);
          const ambiente = (configFiscal?.['nfe_ambiente'] || 'producao') as 'homologacao' | 'producao';
          const natOp = isNfce ? 'VENDA AO CONSUMIDOR' : (configFiscal?.['nfe_natureza_operacao'] || 'Venda de mercadoria adquirida de terceiros');
          const cfopPadrao = configFiscal?.['nfe_cfop_padrao'] || '5102';

          const docData: NFeVendaData = {
            vendaId: dadosVenda.vendaId,
            vendaNumero: dadosVenda.numero,
            dataEmissao: new Date(),
            naturezaOperacao: natOp,
            serie,
            numero: proximoNum,
            modelo: isNfce ? '65' : '55',
            tipo: emissaoFiscal,
            ambiente,
            formaPagamento,
            freteModalidade: Number(selectedOrc.frete_valor) > 0 ? 0 : 9,
            freteTransportadora: selectedOrc.frete_transportadora,
            freteValor: Number(selectedOrc.frete_valor) || 0,
            totalProdutos: itensDetail.reduce((acc, it) => acc + Number(it.subtotal), 0),
            totalVenda: Number(selectedOrc.total),
            cscId: ambiente === 'homologacao'
              ? (configFiscal?.['nfce_id_csc_homologacao'] || configFiscal?.['nfce_id_csc'] || '000001')
              : (configFiscal?.['nfce_id_csc'] || '000001'),
            cscToken: ambiente === 'homologacao'
              ? (configFiscal?.['nfce_csc_homologacao'] || configFiscal?.['nfce_csc'] || 'ffa0a4ef9c0175f8e08893a1b45c5ef39661')
              : (configFiscal?.['nfce_csc'] || '801f32f748c67f2b31b530e515983c469c37'),
            emitente: {
              cnpj: configFiscal?.['empresa_cnpj'] || '',
              razaoSocial: configFiscal?.['empresa_nome'] || (empresa as any)?.empresa_nome || 'G Autopeças & Acessórios',
              nomeFantasia: configFiscal?.['empresa_nome_fantasia'] || (empresa as any)?.empresa_nome_fantasia || 'G Autopeças & Acessórios',
              ie: configFiscal?.['empresa_ie'] || (empresa as any)?.empresa_ie || 'ISENTO',
              endereco: configFiscal?.['empresa_endereco'] || (empresa as any)?.empresa_endereco || 'Rua Principal',
              cidade: configFiscal?.['empresa_cidade'] || 'Campo Grande',
              uf: configFiscal?.['empresa_uf'] || 'MS',
              cep: configFiscal?.['empresa_cep'] || '79000-000',
              telefone: configFiscal?.['empresa_telefone'] || (empresa as any)?.empresa_telefone || '',
              email: configFiscal?.['empresa_email'] || '',
              regimeTributario: configFiscal?.['nfe_regime_tributario'] || '1',
            },
            destinatario: {
              nome: dadosVenda.cliFinalNome || 'CONSUMIDOR FINAL',
              cpfCnpj: dadosVenda.cliFinalCpf,
              endereco: 'Logradouro principal',
              bairro: 'Centro',
              cidade: configFiscal?.['empresa_cidade'] || 'Campo Grande',
              uf: configFiscal?.['empresa_uf'] || 'MS',
              cep: '79000-000',
              telefone: dadosVenda.cliFinalTel,
            },
            itens: itensDetail.map((it, idx) => ({
              id: it.id,
              codigo: it.produto_codigo || `COD-${idx + 1}`,
              descricao: it.produto_nome,
              ncm: '87082999',
              cfop: cfopPadrao,
              unidade: 'UN',
              quantidade: it.quantidade,
              valorUnitario: Number(it.preco_unitario),
              valorTotal: Number(it.subtotal),
              icmsAliquota: Number(configFiscal?.['icms_percentual'] || 17),
              pisAliquota: Number(configFiscal?.['pis_percentual'] || 1.65),
              cofinsAliquota: Number(configFiscal?.['cofins_percentual'] || 7.6),
            })),
          };

          const resultado = await emitirDocumentoFiscal(docData, configFiscal?.['nfe_focus_token']);
          setDanfeAtivo({ dados: docData, resultado });
          toast({
            title: isNfce ? `Venda ${dadosVenda.numero} finalizada e NFC-e emitida!` : `Venda ${dadosVenda.numero} finalizada e NF-e emitida!`,
            description: 'Documento fiscal pronto para impressão.',
          });
          return;
        } catch (err: any) {
          toast({
            title: `Venda ${dadosVenda.numero} finalizada, mas houve aviso na emissão fiscal`,
            description: err.message,
            variant: 'destructive',
          });
        }
      }

      toast({ title: `Venda ${dadosVenda.numero} finalizada com sucesso!`, description: 'Estoque atualizado automaticamente.' });
    },
    onError: (e: any) => {
      toast({ title: 'Erro ao finalizar venda', description: e.message, variant: 'destructive' });
    },
  });

  const openDetail = (id: string) => {
    setSelectedId(id);
    setView('detail');
  };

  /* ---------------------------------------------------------------- */
  /* LIST VIEW                                                         */
  /* ---------------------------------------------------------------- */
  if (view === 'list') {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Orçamentos</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{orcamentos?.length ?? 0} orçamentos registrados</p>
          </div>
          <button
            onClick={() => { resetForm(); setView('new'); }}
            className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 active:scale-95 self-start sm:self-auto bg-primary"
          >
            <Plus size={16} /> Novo Orçamento
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : !orcamentos?.length ? (
          <div className="rounded-xl border bg-card shadow-sm py-16 text-center">
            <FileText size={40} className="mx-auto mb-3 text-muted-foreground/30" />
            <p className="font-semibold text-muted-foreground">Nenhum orçamento ainda</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Clique em "Novo Orçamento" para começar</p>
          </div>
        ) : (
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto max-h-[calc(100vh-18rem)] overflow-y-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Número</th>
                    <th>Cliente</th>
                    <th>Status</th>
                    <th>Total</th>
                    <th>Data</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {orcamentos.map(o => {
                    const st = statusLabel[o.status] ?? statusLabel.pendente;
                    return (
                      <tr key={o.id} className="cursor-pointer" onClick={() => openDetail(o.id)}>
                        <td className="font-mono text-xs font-semibold text-primary">{o.numero}</td>
                        <td>
                          <p className="font-medium text-sm">{o.cliente_nome}</p>
                          <p className="text-xs text-muted-foreground">{o.cliente_cpf_cnpj}</p>
                        </td>
                        <td>
                          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold', st.cls)}>
                            {st.label}
                          </span>
                        </td>
                        <td className="font-semibold">{fmt(o.total)}</td>
                        <td className="text-sm text-muted-foreground">{fmtDate(o.created_at)}</td>
                        <td>
                          <button
                            onClick={e => { e.stopPropagation(); openDetail(o.id); }}
                            className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                            title="Visualizar"
                          >
                            <Eye size={14} />
                          </button>
                          {(role === 'admin' || (role === 'vendedor' && o.created_by === user?.id)) && o.status !== 'finalizado' && (
                            <button
                              onClick={e => { e.stopPropagation(); setConfirmDeleteId(o.id); }}
                              className="p-1.5 rounded-md hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive ml-1"
                              title="Excluir"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {confirmDeleteId && (
          <ConfirmDelete
            onCancel={() => setConfirmDeleteId(null)}
            onConfirm={() => handleDeleteOrcamento(confirmDeleteId)}
            loading={deleting}
          />
        )}
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /* DETAIL VIEW (Cupom Fiscal)                                        */
  /* ---------------------------------------------------------------- */
  if (view === 'detail' && selectedOrc) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto">
        <button
          onClick={() => { setSelectedId(null); setView('list'); }}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={16} /> Voltar à listagem
        </button>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Orçamento {selectedOrc.numero}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{fmtDate(selectedOrc.created_at)}</p>
          </div>
          <span className={cn('inline-flex items-center px-3 py-1 rounded-lg text-xs font-bold', (statusLabel[selectedOrc.status] ?? statusLabel.pendente).cls)}>
            {(statusLabel[selectedOrc.status] ?? statusLabel.pendente).label}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-3">
          {selectedOrc.status !== 'finalizado' && selectedOrc.status !== 'cancelado' && (
            <>
              <button
                onClick={() => loadForEdit(selectedOrc)}
                className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-all hover:bg-muted active:scale-95"
              >
                <Edit2 size={15} /> Editar Orçamento
              </button>
              <button
                onClick={() => setShowFinalizarModal(true)}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 active:scale-95 bg-primary"
              >
                <ShoppingCart size={15} /> Finalizar Venda
              </button>
            </>
          )}

          {(role === 'admin' || (role === 'vendedor' && selectedOrc.created_by === user?.id)) && selectedOrc.status !== 'finalizado' && (
            <button
              onClick={() => setConfirmDeleteId(selectedOrc.id)}
              className="inline-flex items-center gap-2 rounded-lg border border-destructive/30 px-4 py-2.5 text-sm font-semibold text-destructive transition-all hover:bg-destructive/10 active:scale-95"
            >
              <Trash2 size={15} /> Excluir
            </button>
          )}

          <button
            onClick={() => {
              setWaNumber((selectedOrc.cliente_telefone || '').replace(/\D/g, ''));
              setShowWaModal(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
            style={{ background: '#25D366' }}
          >
            <MessageCircle size={15} /> Enviar via WhatsApp
          </button>
        </div>

        <CupomFiscal orcamento={selectedOrc} itens={itensDetail ?? []} empresa={empresa ?? {}} />

        {role === 'admin' && Array.isArray(selectedOrc.simulacoes_custo) && selectedOrc.simulacoes_custo.length > 0 && (
          <div className="rounded-2xl border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base flex items-center gap-2">
                <TrendingUp size={18} className="text-primary" /> Simulações de custo salvas
              </h3>
              <span className="text-xs text-muted-foreground">{(selectedOrc.simulacoes_custo as SimulacaoCustoSnapshot[]).length} registro(s)</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Snapshot congelado no momento do cálculo — não muda mesmo que o produto seja editado depois.
            </p>
            <div className="space-y-3">
              {(selectedOrc.simulacoes_custo as SimulacaoCustoSnapshot[]).map((s) => (
                <div key={s.id} className="rounded-xl border bg-muted/20 p-4 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="font-semibold text-sm">{s.produto_nome}</span>
                    <span className="text-xs text-muted-foreground">{fmtDate(s.data)}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs">
                    <div className="flex justify-between"><span className="text-muted-foreground">Custo</span><span className="font-medium">{fmt(s.preco_custo)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Frete</span><span className="font-medium">{fmt(s.frete_custo)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Custo total</span><span className="font-medium">{fmt(s.custo_total)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Markup</span><span className="font-medium">{s.markup.toFixed(2)}%</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Impostos</span><span className="font-medium">{s.total_impostos_pct.toFixed(2)}%</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Sugerido</span><span className="font-medium">{fmt(s.preco_sugerido)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Negociado</span><span className="font-semibold">{fmt(s.preco_negociado)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Lucro bruto</span><span className={cn('font-semibold', s.lucro_bruto >= 0 ? 'text-emerald-600' : 'text-destructive')}>{fmt(s.lucro_bruto)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Lucro líquido</span><span className={cn('font-semibold', s.lucro_liquido >= 0 ? 'text-emerald-600' : 'text-destructive')}>{fmt(s.lucro_liquido)} ({s.margem_liquida.toFixed(2)}%)</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {role === 'admin' && itensDetail && (() => {
          const itens = itensDetail;
          const custoMap = lucroData?.custoPorProduto ?? {};
          const impostoMap = lucroData?.impostosPorProduto ?? {};
          const receitaBruta = Number(selectedOrc.subtotal) - Number(selectedOrc.desconto);
          let custoTotal = 0;
          let impostosTotal = 0;
          itens.forEach(it => {
            const pid = it.produto_id ?? '';
            const custoUnit = custoMap[pid] ?? 0;
            const aliquota = impostoMap[pid] ?? 0;
            custoTotal += custoUnit * Number(it.quantidade);
            impostosTotal += Number(it.subtotal) * (aliquota / 100);
          });
          const freteValor = Number(selectedOrc.frete_valor) || 0;
          const lucro = receitaBruta - custoTotal - impostosTotal - freteValor;
          const margem = receitaBruta > 0 ? (lucro / receitaBruta) * 100 : 0;
          const lucroCls = lucro >= 0 ? 'text-emerald-600' : 'text-destructive';
          return (
            <div className="rounded-xl border bg-card shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={16} className="text-primary" />
                <h2 className="font-semibold text-sm">Lucro do Orçamento</h2>
                <span className="ml-auto text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary px-2 py-0.5 rounded-md">
                  Admin
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Receita (subtotal − desc.)</p>
                  <p className="font-semibold">{fmt(receitaBruta)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Custo (CMV)</p>
                  <p className="font-semibold text-destructive">− {fmt(custoTotal)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Impostos</p>
                  <p className="font-semibold text-destructive">− {fmt(impostosTotal)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Frete (despesa)</p>
                  <p className="font-semibold text-destructive">− {fmt(freteValor)}</p>
                </div>
                <div className="col-span-2 sm:col-span-2 sm:col-start-2 sm:text-right border-t sm:border-t-0 sm:border-l pl-0 sm:pl-4 pt-3 sm:pt-0">
                  <p className="text-xs text-muted-foreground">Lucro líquido estimado</p>
                  <p className={cn('text-2xl font-bold', lucroCls)}>{fmt(lucro)}</p>
                  <p className={cn('text-xs font-medium', lucroCls)}>Margem: {margem.toFixed(1)}%</p>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Custo baseado no último lote de entrada. Impostos por produto (ICMS + PIS + COFINS + IPI).
              </p>
            </div>
          );
        })()}

        {/* Modal WhatsApp */}
        {showWaModal && (() => {
          const nomeEmpresa = (empresa as any)?.empresa_nome_fantasia?.trim() || (empresa as any)?.empresa_nome?.trim() || 'G Autopeças & Acessórios';
          const telLoja = (empresa as any)?.empresa_telefone?.trim();
          const rodape = telLoja ? `\n\n📱 *${nomeEmpresa}* — ${telLoja}` : `\n\n📱 *${nomeEmpresa}*`;
          const msg = `Olá ${selectedOrc.cliente_nome || 'cliente'}! 👋\n\nSegue seu orçamento *${selectedOrc.numero}* da *${nomeEmpresa}*:\n\n${(itensDetail ?? []).map(i => `• ${i.produto_nome} (${i.quantidade}x) — ${fmt(i.subtotal)}`).join('\n')}\n\n*Total: ${fmt(selectedOrc.total)}*\n\nVálido por 3 dias. Qualquer dúvida estamos à disposição! 😊${rodape}`;
          const onlyDigits = waNumber.replace(/\D/g, '').slice(0, 15);
          const valid = onlyDigits.length >= 10 && onlyDigits.length <= 15;
          const withCountry = onlyDigits.startsWith('55') ? onlyDigits : `55${onlyDigits}`;
          const href = valid ? `https://wa.me/${withCountry}?text=${encodeURIComponent(msg)}` : '#';
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowWaModal(false)} />
              <div className="relative bg-background rounded-2xl shadow-lg w-full max-w-md animate-fade-in max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-background rounded-t-2xl z-10">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ background: '#25D366' }}>
                      <MessageCircle size={18} className="text-white" />
                    </div>
                    <h2 className="font-bold text-lg">Enviar via WhatsApp</h2>
                  </div>
                  <button onClick={() => setShowWaModal(false)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                    <X size={18} />
                  </button>
                </div>
                <div className="px-6 py-5 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                      Número do WhatsApp (com DDD)
                    </label>
                    <input
                      type="tel"
                      inputMode="numeric"
                      value={waNumber}
                      onChange={e => setWaNumber(e.target.value.replace(/\D/g, '').slice(0, 15))}
                      placeholder="Ex.: 67999998888"
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                      maxLength={15}
                      autoFocus
                    />
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Será enviado com o código do país (+55). Mínimo 10 dígitos.
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Prévia da mensagem</p>
                    <div
                      className="rounded-xl p-4 text-sm leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto"
                      style={{ background: '#ECF9EC', color: '#1a1a1a', fontFamily: 'system-ui', fontSize: '0.8125rem' }}
                    >
                      {msg}
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 px-6 py-4 border-t sticky bottom-0 bg-background rounded-b-2xl">
                  <button
                    onClick={() => setShowWaModal(false)}
                    className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
                  >
                    Cancelar
                  </button>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => { if (!valid) { e.preventDefault(); return; } setShowWaModal(false); }}
                    aria-disabled={!valid}
                    className={cn(
                      "flex-1 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-all",
                      valid ? "hover:opacity-90 active:scale-95" : "opacity-50 cursor-not-allowed"
                    )}
                    style={{ background: '#25D366' }}
                  >
                    <MessageCircle size={15} /> Abrir WhatsApp
                  </a>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Modal Finalizar Venda */}
        {showFinalizarModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setShowFinalizarModal(false); setMpPixData(null); setMpInstallments([]); setMpCardLink(null); }} />
            <div className="relative bg-background rounded-2xl shadow-lg w-full max-w-md animate-fade-in max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-background rounded-t-2xl z-10">
                <h2 className="font-bold text-lg">Finalizar Venda</h2>
                <button onClick={() => { setShowFinalizarModal(false); setMpPixData(null); setMpInstallments([]); setMpCardLink(null); }} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                  <X size={18} />
                </button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div className="rounded-xl border bg-muted/30 p-3.5 space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cliente da Venda</p>
                      <p className="font-semibold text-foreground text-sm flex items-center gap-1.5 mt-0.5">
                        <User size={15} className="text-primary" />
                        {clienteFechamento?.nome || selectedOrc.cliente_nome}
                      </p>
                      {(clienteFechamento?.cpf_cnpj || selectedOrc.cliente_cpf_cnpj) && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          CPF/CNPJ: {clienteFechamento?.cpf_cnpj || selectedOrc.cliente_cpf_cnpj}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAlterarCliente(v => !v)}
                      className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-colors whitespace-nowrap"
                    >
                      {showAlterarCliente ? 'Cancelar' : 'Substituir Cliente'}
                    </button>
                  </div>

                  {showAlterarCliente && (
                    <div className="pt-2 border-t space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Buscar cliente cadastrado para registrar a venda no nome dele:
                      </p>
                      <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                          type="text"
                          value={buscaClienteFechamento}
                          onChange={e => setBuscaClienteFechamento(e.target.value)}
                          placeholder="Buscar por nome ou CPF/CNPJ..."
                          className="w-full rounded-lg border bg-background pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
                          autoFocus
                        />
                      </div>
                      {clientesFechamentoList && clientesFechamentoList.length > 0 && (
                        <div className="border rounded-lg max-h-36 overflow-y-auto divide-y bg-background text-xs shadow-sm">
                          {clientesFechamentoList.map(c => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setClienteFechamento(c);
                                setShowAlterarCliente(false);
                                setBuscaClienteFechamento('');
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-muted/80 flex items-center justify-between transition-colors"
                            >
                              <span className="font-medium text-foreground">{c.nome}</span>
                              <span className="text-[11px] text-muted-foreground">{c.cpf_cnpj || c.telefone || ''}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {clienteFechamento && (
                        <button
                          type="button"
                          onClick={() => {
                            setClienteFechamento(null);
                            setShowAlterarCliente(false);
                          }}
                          className="text-[11px] text-destructive hover:underline block"
                        >
                          Restaurar cliente original ({selectedOrc.cliente_nome})
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold text-primary">{fmt(selectedOrc.total)}</p>
                </div>
                {selectedOrc.frete_transportadora && (
                  <div>
                    <p className="text-sm text-muted-foreground">Frete</p>
                    <p className="font-semibold">{selectedOrc.frete_transportadora} — {fmt(Number(selectedOrc.frete_valor))}</p>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                    Forma de Pagamento
                  </label>
                  <select
                    value={formaPagamento}
                    onChange={e => {
                      setFormaPagamento(e.target.value);
                      setMpPixData(null);
                      setMpInstallments([]);
                      setMpCardLink(null);
                    }}
                    className="w-full rounded-lg border px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                  >
                    {[
                      'Dinheiro',
                      'Pix',
                      'Cartão de Crédito',
                      'Cartão de Débito',
                      'Boleto',
                      'Transferência',
                      ...(empresa?.infinitepay_habilitado === 'true' ? ['InfinitePay - Crédito', 'InfinitePay - Débito', 'InfinitePay - Pix'] : []),
                      ...(empresa?.mercadopago_habilitado === 'true' ? ['MercadoPago - Crédito', 'MercadoPago - Débito', 'MercadoPago - Pix', 'MercadoPago - Boleto'] : []),
                    ].map(f => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                </div>

                {/* Opções de Emissão Fiscal */}
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary flex items-center gap-1.5">
                    <Receipt size={14} /> Emissão Fiscal no Fechamento
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <label className={cn(
                      "flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-colors",
                      emissaoFiscal === 'nfce' ? "border-emerald-500 bg-emerald-500/10 font-semibold text-emerald-800 dark:text-emerald-300" : "hover:bg-muted"
                    )}>
                      <input
                        type="radio"
                        name="emissaoFiscal"
                        checked={emissaoFiscal === 'nfce'}
                        onChange={() => setEmissaoFiscal('nfce')}
                        className="accent-emerald-600"
                      />
                      <span>🧾 Cupom (NFC-e)</span>
                    </label>

                    <label className={cn(
                      "flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-colors",
                      emissaoFiscal === 'nfe' ? "border-primary bg-primary/10 font-semibold text-primary" : "hover:bg-muted"
                    )}>
                      <input
                        type="radio"
                        name="emissaoFiscal"
                        checked={emissaoFiscal === 'nfe'}
                        onChange={() => setEmissaoFiscal('nfe')}
                        className="accent-primary"
                      />
                      <span>📄 NF-e (A4)</span>
                    </label>

                    <label className={cn(
                      "flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-colors",
                      emissaoFiscal === 'nenhum' ? "border-muted-foreground/40 bg-muted font-semibold" : "hover:bg-muted"
                    )}>
                      <input
                        type="radio"
                        name="emissaoFiscal"
                        checked={emissaoFiscal === 'nenhum'}
                        onChange={() => setEmissaoFiscal('nenhum')}
                        className="accent-muted-foreground"
                      />
                      <span>Não emitir</span>
                    </label>
                  </div>
                </div>

                {/* MercadoPago Pix - Generate QR Code */}
                {formaPagamento === 'MercadoPago - Pix' && !mpPixData && (
                  <button
                    onClick={async () => {
                      setMpLoading(true);
                      try {
                        const { data, error } = await supabase.functions.invoke('mercadopago-payment', {
                          body: { action: 'pix', amount: selectedOrc.total, description: `Venda ${selectedOrc.numero} - ${selectedOrc.cliente_nome}` },
                        });
                        if (error) throw error;
                        if (!data?.success) throw new Error(data?.error || 'Erro ao gerar Pix');
                        setMpPixData(data);
                      } catch (err: any) {
                        toast({ title: 'Erro ao gerar QR Code Pix', description: err.message, variant: 'destructive' });
                      } finally {
                        setMpLoading(false);
                      }
                    }}
                    disabled={mpLoading}
                    className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary/30 px-4 py-3 text-sm font-semibold text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                  >
                    {mpLoading ? <Loader2 size={16} className="animate-spin" /> : <QrCode size={16} />}
                    {mpLoading ? 'Gerando QR Code...' : 'Gerar QR Code Pix'}
                  </button>
                )}

                {/* QR Code Display */}
                {mpPixData && (
                  <div className="rounded-xl border bg-card p-4 space-y-3">
                    <div className="text-center">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">QR Code Pix</p>
                      {mpPixData.qr_code_base64 && (
                        <img
                          src={`data:image/png;base64,${mpPixData.qr_code_base64}`}
                          alt="QR Code Pix"
                          className="mx-auto w-48 h-48 rounded-lg"
                        />
                      )}
                    </div>
                    {mpPixData.qr_code && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Pix Copia e Cola:</p>
                        <div className="flex gap-2">
                          <input
                            readOnly
                            value={mpPixData.qr_code}
                            className="flex-1 text-xs rounded-lg border px-2 py-1.5 bg-muted font-mono truncate"
                          />
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(mpPixData.qr_code);
                              toast({ title: 'Código Pix copiado!' });
                            }}
                            className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                          >
                            Copiar
                          </button>
                        </div>
                      </div>
                    )}
                    {mpPixData.ticket_url && (
                      <a href={mpPixData.ticket_url} target="_blank" rel="noopener noreferrer"
                        className="block text-center text-xs text-primary underline">
                        Abrir página de pagamento
                      </a>
                    )}
                  </div>
                )}

                {/* MercadoPago Crédito - Installments */}
                {formaPagamento === 'MercadoPago - Crédito' && mpInstallments.length === 0 && (
                  <button
                    onClick={async () => {
                      setMpLoading(true);
                      try {
                        const { data, error } = await supabase.functions.invoke('mercadopago-payment', {
                          body: { action: 'installments', amount: selectedOrc.total },
                        });
                        if (error) throw error;
                        if (!data?.success) throw new Error(data?.error || 'Erro ao calcular parcelas');
                        setMpInstallments(data.installments);
                        setMpSelectedInstallment(1);
                      } catch (err: any) {
                        toast({ title: 'Erro ao calcular parcelas', description: err.message, variant: 'destructive' });
                      } finally {
                        setMpLoading(false);
                      }
                    }}
                    disabled={mpLoading}
                    className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary/30 px-4 py-3 text-sm font-semibold text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                  >
                    {mpLoading ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
                    {mpLoading ? 'Calculando parcelas...' : 'Calcular Parcelamento'}
                  </button>
                )}

                {/* Installments Selector */}
                {mpInstallments.length > 0 && (
                  <div className="rounded-xl border bg-card p-4 space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Parcelamento</p>
                    <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                      {mpInstallments.map(inst => (
                        <label
                          key={inst.installments}
                          className={cn(
                            'flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-colors',
                            mpSelectedInstallment === inst.installments ? 'border-primary bg-primary/5' : 'hover:bg-muted'
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="installments"
                              checked={mpSelectedInstallment === inst.installments}
                              onChange={() => setMpSelectedInstallment(inst.installments)}
                              className="accent-primary"
                            />
                            <span className="text-sm font-medium">
                              {inst.installments}x de {fmt(inst.installment_amount)}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs text-muted-foreground">
                              {inst.has_interest ? `Total: ${fmt(inst.total_amount)}` : 'Sem juros'}
                            </span>
                          </div>
                        </label>
                      ))}
                    </div>

                    {!mpCardLink && (
                      <button
                        onClick={async () => {
                          setMpLoading(true);
                          try {
                            const { data, error } = await supabase.functions.invoke('mercadopago-payment', {
                              body: {
                                action: 'card_payment',
                                amount: mpInstallments.find(i => i.installments === mpSelectedInstallment)?.total_amount ?? selectedOrc.total,
                                description: `Venda ${selectedOrc.numero} - ${selectedOrc.cliente_nome}`,
                                installments: mpSelectedInstallment,
                              },
                            });
                            if (error) throw error;
                            if (!data?.success) throw new Error(data?.error || 'Erro ao gerar link');
                            setMpCardLink(data.init_point);
                          } catch (err: any) {
                            toast({ title: 'Erro ao gerar link de pagamento', description: err.message, variant: 'destructive' });
                          } finally {
                            setMpLoading(false);
                          }
                        }}
                        disabled={mpLoading}
                        className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-50"
                      >
                        {mpLoading ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
                        {mpLoading ? 'Gerando link...' : `Gerar Link ${mpSelectedInstallment}x`}
                      </button>
                    )}

                    {mpCardLink && (
                      <div className="space-y-2">
                        <a
                          href={mpCardLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition-all"
                        >
                          <CreditCard size={16} /> Abrir Página de Pagamento
                        </a>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(mpCardLink);
                            toast({ title: 'Link de pagamento copiado!' });
                          }}
                          className="w-full rounded-lg border px-4 py-2 text-xs font-medium hover:bg-muted transition-colors"
                        >
                          Copiar Link
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                  <p className="text-xs text-amber-600 font-medium">
                    ⚠️ O estoque dos produtos será descontado automaticamente. Esta ação não pode ser desfeita.
                  </p>
                </div>
              </div>
              <div className="flex gap-3 px-6 py-4 border-t">
                <button
                  onClick={() => { setShowFinalizarModal(false); setMpPixData(null); setMpInstallments([]); setMpCardLink(null); }}
                  className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => finalizarMutation.mutate()}
                  disabled={finalizarMutation.isPending}
                  className="flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 bg-primary"
                >
                  {finalizarMutation.isPending ? (
                    <span className="flex items-center justify-center gap-2"><Loader2 size={15} className="animate-spin" /> Finalizando...</span>
                  ) : (
                    <span className="flex items-center justify-center gap-2"><ShoppingCart size={15} /> Confirmar Venda</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
        {confirmDeleteId && (
          <ConfirmDelete
            onCancel={() => setConfirmDeleteId(null)}
            onConfirm={() => handleDeleteOrcamento(confirmDeleteId)}
            loading={deleting}
          />
        )}
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /* NEW / EDIT VIEW (PDV)                                             */
  /* ---------------------------------------------------------------- */
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => { resetForm(); setView('list'); }}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={16} /> Voltar
        </button>
        <div>
          <h1 className="text-2xl font-bold">{editingOrcId ? 'Editar Orçamento' : 'Novo Orçamento'}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Preencha os dados abaixo</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left — Cliente + Produtos */}
        <div className="xl:col-span-2 space-y-4">
          {/* Cliente */}
          <div className="rounded-xl border bg-card shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <User size={16} className="text-primary" />
                <h2 className="font-semibold text-sm">Cliente</h2>
              </div>
              <button
                type="button"
                onClick={() => setClienteSelecionado({
                  id: '00000000-0000-0000-0000-000000000001',
                  nome: 'Consumidor Final (Balcão)',
                  cpf_cnpj: '000.000.000-00',
                  telefone: '',
                  email: '',
                  endereco: 'Balcão da Loja'
                })}
                className="text-xs px-2.5 py-1 rounded-lg border border-primary/40 text-primary hover:bg-primary/10 transition-colors font-semibold flex items-center gap-1.5"
              >
                <UserCheck size={13} />
                Usar Consumidor Final
              </button>
            </div>
            {clienteSelecionado ? (
              <div className="flex items-center justify-between rounded-lg bg-primary/10 px-4 py-3">
                <div>
                  <p className="font-semibold text-sm">{clienteSelecionado.nome}</p>
                  <p className="text-xs text-muted-foreground">{clienteSelecionado.telefone} · {clienteSelecionado.cpf_cnpj}</p>
                </div>
                <button onClick={() => setClienteSelecionado(null)} className="p-1 rounded-md hover:bg-primary/20 transition-colors">
                  <X size={14} className="text-primary" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <div className="flex items-stretch gap-2">
                  <div className="relative flex-1">
                    <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={clienteSearch}
                      onChange={e => { setClienteSearch(e.target.value); setShowClienteDD(true); }}
                      onFocus={() => setShowClienteDD(true)}
                      onBlur={() => setTimeout(() => setShowClienteDD(false), 200)}
                      placeholder="Buscar cliente por nome ou CPF/CNPJ..."
                      className="w-full rounded-xl border bg-background pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => openClienteModal(undefined, (c) => { if (c) setClienteSelecionado(c as any); })}
                    title="Cadastrar novo cliente (permanece aberto ao sair da página)"
                    aria-label="Cadastrar novo cliente"
                    className="shrink-0 inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground px-3 hover:bg-primary/90 transition-colors"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                {showClienteDD && clientes && clientes.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-xl shadow-lg z-20 overflow-hidden">
                    {clientes.map(c => (
                      <button
                        key={c.id}
                        className="w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors border-b last:border-0"
                        onMouseDown={() => { setClienteSelecionado(c); setClienteSearch(''); setShowClienteDD(false); }}
                      >
                        <p className="text-sm font-medium">{c.nome}</p>
                        <p className="text-xs text-muted-foreground">{c.telefone} · {c.cpf_cnpj}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Produtos */}
          <div className="rounded-xl border bg-card shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Package size={16} className="text-primary" />
              <h2 className="font-semibold text-sm">Adicionar Peças</h2>
              {(role === 'admin' || role === 'vendedor') && <div className="ml-auto"><BuscaPecasIA onAdd={addItem} /></div>}
            </div>
            <div className="relative flex items-stretch gap-2">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={produtoSearch}
                  onChange={e => { setProdutoSearch(e.target.value); setShowProdutoDD(true); }}
                  onFocus={() => setShowProdutoDD(true)}
                  onBlur={() => setTimeout(() => setShowProdutoDD(false), 200)}
                  placeholder="Buscar — ex.: volkswagen gol filtro 2018"
                  className="w-full rounded-xl border bg-background pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                />
              </div>
              <button
                type="button"
                onClick={() => openProdutoModal(undefined, (p) => { if (p) addItem(p as any); })}
                title="Cadastrar novo produto (permanece aberto ao sair da página)"
                aria-label="Cadastrar novo produto"
                className="shrink-0 inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground px-3 hover:bg-primary/90 transition-colors"
              >
                <Plus size={16} />
              </button>
              {showProdutoDD && produtos && produtos.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-xl shadow-lg z-20 overflow-hidden">
                  {produtos.map(p => (
                    <button
                      key={p.id}
                      className="w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors border-b last:border-0 flex items-center justify-between"
                      onMouseDown={() => addItem(p)}
                    >
                      <div>
                        <p className="text-sm font-medium">{p.nome}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-[420px] whitespace-nowrap">
                          {p.codigo_interno ? `Int: ${p.codigo_interno}` : ''}
                          {p.codigo_fabrica ? ` · Fáb: ${p.codigo_fabrica}` : ''}
                          {p.marca ? ` · ${p.marca}` : ''}
                          {p.aplicacao ? ` · ${p.aplicacao}` : ''}
                        </p>
                      </div>
                      <div className="text-right ml-4">
                        <p className="text-sm font-bold text-primary">{fmt(p.preco_venda)}</p>
                        <p className="text-xs text-muted-foreground">{p.estoque_total} em estoque</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Items list */}
            <div className="mt-4 space-y-2">
              {itens.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground">
                  <Package size={32} className="mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Nenhuma peça adicionada</p>
                  <p className="text-xs opacity-70">Use a busca acima para adicionar itens</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Peça</th>
                      <th className="text-center py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24">Qtd</th>
                      <th className="text-right py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Unit.</th>
                      <th className="text-right py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {itens.map(item => (
                      <tr key={item.produto.id} className="hover:bg-muted/20 transition-colors">
                        <td className="py-3 pr-3">
                          <p className="font-medium text-sm">{item.produto.nome}</p>
                          <p className="text-xs text-muted-foreground">{item.produto.codigo_interno || item.produto.codigo_fabrica}{item.produto.marca ? ` · ${item.produto.marca}` : ''}</p>
                        </td>
                        <td className="py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => updateQty(item.produto.id, item.quantidade - 1)} className="h-6 w-6 rounded border text-xs hover:bg-muted transition-colors">−</button>
                            <span className="w-8 text-center font-semibold">{item.quantidade}</span>
                            <button onClick={() => updateQty(item.produto.id, item.quantidade + 1)} className="h-6 w-6 rounded border text-xs hover:bg-muted transition-colors">+</button>
                          </div>
                        </td>
                        <td className="py-3 text-right text-muted-foreground">{fmt(item.preco_unitario)}</td>
                        <td className="py-3 text-right font-semibold">{fmt(item.quantidade * item.preco_unitario)}</td>
                        <td className="py-3 pl-2">
                          <button onClick={() => removeItem(item.produto.id)} className="p-1 rounded-md hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive">
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Right — Summary */}
        <div className="space-y-4">
          <div className="rounded-xl border bg-card shadow-sm p-5 sticky top-20">
            <h2 className="font-semibold text-sm mb-4">Resumo do Orçamento</h2>

            <div className="space-y-3 pb-4 border-b">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal ({itens.length} itens)</span>
                <span className="font-medium">{fmt(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm items-center">
                <span className="text-muted-foreground">Desconto (%)</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={subtotal > 0 ? (descontoPct || '') : ''}
                  disabled={subtotal <= 0}
                  onChange={e => {
                    const raw = Number(e.target.value);
                    if (!isFinite(raw)) return setDesconto(0);
                    const pct = Math.max(0, Math.min(100, raw));
                    setDesconto(Number(((subtotal * pct) / 100).toFixed(2)));
                  }}
                  placeholder="0"
                  className="w-24 text-right rounded-lg border px-2 py-1 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex justify-between text-sm items-center">
                <span className="text-muted-foreground">Desconto (R$)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={descontoEfetivo || ''}
                  max={subtotal}
                  disabled={subtotal <= 0}
                  onChange={e => {
                    const raw = Number(e.target.value);
                    if (!isFinite(raw) || raw < 0) return setDesconto(0);
                    setDesconto(Number(Math.min(raw, subtotal).toFixed(2)));
                  }}
                  placeholder="0,00"
                  className="w-24 text-right rounded-lg border px-2 py-1 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            {/* Frete */}
            <div className="space-y-3 pb-4 border-b">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Frete</p>
              <div className="flex justify-between text-sm items-center">
                <span className="text-muted-foreground">Transportadora</span>
                <input
                  type="text"
                  value={freteTransportadora}
                  onChange={e => setFreteTransportadora(e.target.value)}
                  placeholder="Nome"
                  className="w-36 text-right rounded-lg border px-2 py-1 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex justify-between text-sm items-center">
                <span className="text-muted-foreground">Valor do Frete (R$)</span>
                <input
                  type="number"
                  min={0}
                  value={freteValor || ''}
                  onChange={e => setFreteValor(Number(e.target.value))}
                  placeholder="0,00"
                  className="w-24 text-right rounded-lg border px-2 py-1 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div className="flex justify-between items-center py-4 border-b">
              <span className="font-bold text-base">Total</span>
              <span className="text-2xl font-bold text-primary">{fmt(total)}</span>
            </div>

            {role === 'admin' && itens.length > 0 && (() => {
              const custoMap = lucroEditor?.custoPorProduto ?? {};
              const impostoMap = lucroEditor?.impostosPorProduto ?? {};
              const receitaBruta = subtotal - descontoEfetivo;
              let custoTotal = 0;
              let impostosTotal = 0;
              itens.forEach(it => {
                const pid = it.produto.id;
                const custoUnit = custoMap[pid] ?? 0;
                const aliquota = impostoMap[pid] ?? 0;
                custoTotal += custoUnit * it.quantidade;
                impostosTotal += (it.quantidade * it.preco_unitario) * (aliquota / 100);
              });
              const lucro = receitaBruta - custoTotal - impostosTotal - freteValor;
              const margem = receitaBruta > 0 ? (lucro / receitaBruta) * 100 : 0;
              const lucroCls = lucro >= 0 ? 'text-emerald-600' : 'text-destructive';
              return (
                <div className="mt-4 rounded-lg border bg-muted/30 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp size={14} className="text-primary" />
                    <span className="text-xs font-semibold uppercase tracking-wide">Estimativa de Lucro</span>
                    <span className="ml-auto text-[9px] font-bold uppercase tracking-wider bg-primary/10 text-primary px-1.5 py-0.5 rounded">Admin</span>
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between"><span className="text-muted-foreground">Receita</span><span className="font-medium">{fmt(receitaBruta)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Custo (CMV)</span><span className="text-destructive">− {fmt(custoTotal)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Impostos</span><span className="text-destructive">− {fmt(impostosTotal)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Frete</span><span className="text-destructive">− {fmt(freteValor)}</span></div>
                  </div>
                  <div className="mt-2 pt-2 border-t flex justify-between items-end">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Lucro estimado</p>
                      <p className={cn('text-[10px] font-medium', lucroCls)}>Margem: {margem.toFixed(1)}%</p>
                    </div>
                    <span className={cn('text-lg font-bold', lucroCls)}>{fmt(lucro)}</span>
                  </div>
                  <p className="mt-2 text-[10px] text-muted-foreground">Baseado no último lote de entrada.</p>
                </div>
              );
            })()}

            <div className="space-y-2 pt-4">
              <button
                onClick={() => saveMutation.mutate()}
                disabled={itens.length === 0 || saveMutation.isPending}
                className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed bg-primary"
              >
                {saveMutation.isPending ? (
                  <><Loader2 size={15} className="animate-spin" /> Salvando...</>
                ) : (
                  <><FileText size={15} /> {editingOrcId ? 'Salvar Alterações' : 'Salvar Orçamento'}</>
                )}
              </button>
            </div>

            {itens.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center mt-3">
                Adicione pelo menos uma peça para salvar o orçamento
              </p>
            ) : !clienteSelecionado ? (
              <p className="text-[11px] text-muted-foreground text-center mt-3">
                Nenhum cliente selecionado: salvará como <strong>Consumidor Final (Balcão)</strong>
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Modais de Impressão Fiscal */}
      {danfeAtivo && danfeAtivo.resultado.tipo === 'nfce' && (
        <DanfeNfceModal
          dados={danfeAtivo.dados}
          resultado={danfeAtivo.resultado}
          onClose={() => setDanfeAtivo(null)}
        />
      )}

      {danfeAtivo && danfeAtivo.resultado.tipo === 'nfe' && (
        <DanfeModal
          dados={danfeAtivo.dados}
          resultado={danfeAtivo.resultado}
          onClose={() => setDanfeAtivo(null)}
        />
      )}
    </div>
  );
}
