import React, { useState, useMemo, useEffect } from 'react';
import {
  Search, Plus, Package, ChevronDown, ChevronRight, Edit2, Trash2,
  X, Loader2, Download, FileSpreadsheet, ShoppingCart, Tag, MapPin,
  Check, ArrowRight, Layers, Eye
} from 'lucide-react';
import { useAppContext } from '@/components/Layout';
import { cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import ProdutoModal from '@/components/ProdutoModal';
import FiltroVeiculoPecas from '@/components/FiltroVeiculoPecas';
import {
  EMPTY_VEHICLE_FILTER,
  hasActiveVehicleFilter,
  matchesVehicleFilter,
  type VehicleFilterState,
} from '@/lib/vehicle-catalog';
import { useCadastroModal } from '@/contexts/CadastroModalContext';
import { exportToCsv, exportToExcel } from '@/lib/export';
import { useNavigate } from 'react-router-dom';

const categoriasDefault = ['Filtros', 'Freios', 'Suspensão', 'Motor', 'Arrefecimento'];
const tiposVeiculo = ['Carro', 'Moto', 'Pesado', 'Agrícola'];

interface LoteDB {
  id: string;
  fornecedor: string;
  preco_custo: number;
  quantidade: number;
  data_entrada: string;
}

export interface ProdutoDB {
  id: string;
  codigo: string;
  codigo_fabrica: string;
  codigo_interno: string;
  nome: string;
  marca: string;
  aplicacao: string;
  ncm: string;
  preco_venda: number;
  estoque_minimo: number;
  estoque_total: number;
  categoria: string;
  markup_percentual: number;
  tipo_veiculo: string;
  icms_percentual: number;
  ipi_percentual: number;
  pis_percentual: number;
  cofins_percentual: number;
  imagem_url?: string | null;
  localizacao?: string | null;
  lotes?: LoteDB[];
}

interface CartItem {
  produto: ProdutoDB;
  quantidade: number;
  preco_unitario: number;
}

function LoteRow({ lote, isAdmin }: { lote: LoteDB; isAdmin: boolean }) {
  return (
    <tr className="bg-muted/20">
      <td className="px-4 py-2 pl-10 text-xs text-muted-foreground font-medium">
        <span className="badge-gray text-[10px]">Lote</span>
      </td>
      <td className="px-4 py-2 text-xs">{lote.fornecedor}</td>
      <td className="px-4 py-2 text-xs">
        {isAdmin ? (
          <span className="font-semibold text-foreground">
            {lote.preco_custo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 py-2 text-xs font-semibold">{lote.quantidade} un</td>
      <td className="px-4 py-2 text-xs text-muted-foreground">
        {new Date(lote.data_entrada).toLocaleDateString('pt-BR')}
      </td>
      <td colSpan={3} />
    </tr>
  );
}

export default function Produtos() {
  const { userRole } = useAppContext();
  const isAdmin = userRole === 'admin';
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { openProdutoModal } = useCadastroModal();

  // Estados de busca e filtros
  const [search, setSearch] = useState('');
  const [categoria, setCategoria] = useState('Todos');
  const [tipoVeic, setTipoVeic] = useState('Todos');
  const [marcaFiltro, setMarcaFiltro] = useState('Todas');
  const [vehicleFilter, setVehicleFilter] = useState<VehicleFilterState>(EMPTY_VEHICLE_FILTER);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [modal, setModal] = useState<'new' | ProdutoDB | null>(null);

  // Produto Selecionado para visualização no Card Lateral
  const [selectedProduto, setSelectedProduto] = useState<ProdutoDB | null>(null);
  const [activeImgIdx, setActiveImgIdx] = useState<number>(0);
  const [cardQtd, setCardQtd] = useState<number>(1);

  // Reseta índice da imagem ao trocar de produto
  useEffect(() => {
    setActiveImgIdx(0);
  }, [selectedProduto?.id]);

  // Carrinho de Venda / DAV
  const [carrinho, setCarrinho] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('pecafacil_carrinho_balcao');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showCarrinhoModal, setShowCarrinhoModal] = useState(false);

  // Salva o carrinho no localStorage sempre que alterar
  useEffect(() => {
    try {
      localStorage.setItem('pecafacil_carrinho_balcao', JSON.stringify(carrinho));
    } catch (e) {
      console.warn('Erro ao salvar carrinho no cache:', e);
    }
  }, [carrinho]);

  const { data: markupPadrao } = useQuery({
    queryKey: ['configuracoes', 'markup_padrao'],
    queryFn: async () => {
      const { data } = await supabase
        .from('configuracoes')
        .select('valor')
        .eq('chave', 'markup_padrao')
        .single();
      return data?.valor ?? '30';
    },
  });

  const { data: allProdutos = [], isLoading } = useQuery({
    queryKey: ['produtos'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('produtos')
        .select('*, lotes(id, fornecedor, preco_custo, quantidade, data_entrada)')
        .order('nome');
      if (error) throw error;
      return (data ?? []) as ProdutoDB[];
    },
  });

  // Atualiza o produto selecionado se a lista mudar ou na inicialização
  useEffect(() => {
    if (allProdutos.length > 0 && !selectedProduto) {
      setSelectedProduto(allProdutos[0]);
    }
  }, [allProdutos, selectedProduto]);

  const saveMutation = useMutation({
    mutationFn: async ({ id, ...payload }: Record<string, any>) => {
      const lote = payload._lote;
      delete payload._lote;
      delete payload.preco_custo;
      delete payload.frete_custo;
      delete payload.lotes;

      // Filtra estritamente apenas colunas que existem na tabela produtos do Supabase
      const COLUNAS_VALIDAS = new Set([
        'codigo', 'codigo_fabrica', 'codigo_interno', 'nome', 'marca',
        'aplicacao', 'ncm', 'preco_venda', 'markup_percentual', 'estoque_minimo',
        'estoque_total', 'categoria', 'tipo_veiculo', 'icms_percentual', 'ipi_percentual',
        'pis_percentual', 'cofins_percentual', 'localizacao', 'imagem_url', 'imagens'
      ]);

      const cleanPayload: Record<string, any> = {};
      for (const [k, v] of Object.entries(payload)) {
        if (COLUNAS_VALIDAS.has(k)) {
          cleanPayload[k] = v;
        }
      }

      if (id) {
        const { error } = await (supabase as any).from('produtos').update(cleanPayload).eq('id', id);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await (supabase as any)
          .from('produtos')
          .insert(cleanPayload)
          .select('id')
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
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['produtos'] });
      setModal(null);
      toast({ title: 'Produto salvo com sucesso!' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro ao salvar produto', description: err.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('produtos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['produtos'] });
      toast({ title: 'Produto excluído!' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro ao excluir', description: err.message, variant: 'destructive' });
    },
  });

  const filterCategorias = useMemo(() => {
    const fromProducts = allProdutos.map(p => p.categoria).filter(Boolean);
    const merged = new Set([...categoriasDefault, ...fromProducts]);
    return Array.from(merged).sort();
  }, [allProdutos]);

  const filterMarcas = useMemo(() => {
    const set = new Set(allProdutos.map(p => p.marca).filter(Boolean));
    return Array.from(set).sort();
  }, [allProdutos]);

  const hasActiveFilter =
    search.trim().length > 0 ||
    categoria !== 'Todos' ||
    tipoVeic !== 'Todos' ||
    marcaFiltro !== 'Todas' ||
    hasActiveVehicleFilter(vehicleFilter);

  // Filtragem rápida de produtos com proteção contra valores nulos
  const produtos = useMemo(() => {
    return allProdutos.filter((p: ProdutoDB) => {
      const q = search.trim().toLowerCase();
      const nome = (p.nome || '').toLowerCase();
      const codFab = (p.codigo_fabrica || '').toLowerCase();
      const codInt = (p.codigo_interno || '').toLowerCase();
      const cod = (p.codigo || '').toLowerCase();
      const aplicacao = (p.aplicacao || '').toLowerCase();
      const marca = (p.marca || '').toLowerCase();

      const matchSearch =
        !q ||
        nome.includes(q) ||
        codFab.includes(q) ||
        codInt.includes(q) ||
        cod.includes(q) ||
        aplicacao.includes(q) ||
        marca.includes(q);
      const matchCat = categoria === 'Todos' || p.categoria === categoria;
      const matchTipo = tipoVeic === 'Todos' || p.tipo_veiculo === tipoVeic;
      const matchMarca = marcaFiltro === 'Todas' || p.marca === marcaFiltro;
      const matchVehicle = matchesVehicleFilter(p, vehicleFilter);
      return matchSearch && matchCat && matchTipo && matchMarca && matchVehicle;
    });
  }, [search, categoria, tipoVeic, marcaFiltro, vehicleFilter, allProdutos]);

  const clearFilters = () => {
    setSearch('');
    setCategoria('Todos');
    setTipoVeic('Todos');
    setMarcaFiltro('Todas');
    setVehicleFilter(EMPTY_VEHICLE_FILTER);
  };

  // Funções do Carrinho / DAV
  const handleAdicionarAoCarrinho = (produto: ProdutoDB, qtd: number = 1) => {
    setCarrinho(prev => {
      const idx = prev.findIndex(item => item.produto.id === produto.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx].quantidade += qtd;
        return updated;
      }
      return [...prev, { produto, quantidade: qtd, preco_unitario: produto.preco_venda }];
    });
    toast({
      title: 'Item adicionado ao DAV / Carrinho!',
      description: `${qtd}x ${produto.nome.slice(0, 40)}...`,
    });
  };

  const handleRemoverDoCarrinho = (produtoId: string) => {
    setCarrinho(prev => prev.filter(item => item.produto.id !== produtoId));
  };

  const handleAtualizarQtdCarrinho = (produtoId: string, novaQtd: number) => {
    if (novaQtd <= 0) {
      handleRemoverDoCarrinho(produtoId);
      return;
    }
    setCarrinho(prev =>
      prev.map(item =>
        item.produto.id === produtoId ? { ...item, quantidade: novaQtd } : item
      )
    );
  };

  const totalCarrinhoItens = carrinho.reduce((acc, item) => acc + item.quantidade, 0);
  const totalCarrinhoValor = carrinho.reduce((acc, item) => acc + (item.quantidade * item.preco_unitario), 0);

  const handleEnviarParaOrcamento = () => {
    if (carrinho.length === 0) return;
    try {
      localStorage.setItem('pecafacil_carrinho_pendente', JSON.stringify(carrinho));
      setCarrinho([]);
      setShowCarrinhoModal(false);
      navigate('/orcamentos');
    } catch (e) {
      console.warn('Erro ao transferir carrinho:', e);
    }
  };

  const exportRows = hasActiveFilter && produtos.length > 0 ? produtos : allProdutos;

  const buildExport = () => {
    const headers = [
      'Código Fábrica', 'Código Interno', 'Produto', 'Marca', 'Categoria',
      'Tipo Veículo', 'Aplicação', 'Localização', 'Estoque', 'Estoque Mínimo', 'Preço Venda',
      ...(isAdmin ? ['Markup %', 'ICMS %', 'IPI %', 'PIS %', 'COFINS %'] : []),
    ];
    const rows = exportRows.map((p: any) => [
      p.codigo_fabrica || '', p.codigo_interno || '', p.nome, p.marca, p.categoria,
      p.tipo_veiculo, p.aplicacao, p.localizacao || '', p.estoque_total, p.estoque_minimo,
      Number(p.preco_venda ?? 0).toFixed(2).replace('.', ','),
      ...(isAdmin ? [p.markup_percentual, p.icms_percentual, p.ipi_percentual, p.pis_percentual, p.cofins_percentual] : []),
    ]);
    return { headers, rows };
  };

  const stamp = () => new Date().toISOString().slice(0, 10);

  const handleExportCsv = () => {
    const { headers, rows } = buildExport();
    if (!rows.length) return toast({ title: 'Nada para exportar', variant: 'destructive' });
    exportToCsv(`catalogo-pecas-${stamp()}.csv`, headers, rows);
    toast({ title: `${rows.length} peças exportadas em CSV` });
  };

  const handleExportExcel = () => {
    const { headers, rows } = buildExport();
    if (!rows.length) return toast({ title: 'Nada para exportar', variant: 'destructive' });
    exportToExcel(`catalogo-pecas-${stamp()}.xls`, headers, rows);
    toast({ title: `${rows.length} peças exportadas em Excel` });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top Header & Quick Cart */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Produtos & Balcão de Peças</h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              {allProdutos.length} itens
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Clique na linha para ver a imagem detalhada • Duplo clique para adicionar direto ao DAV / Carrinho
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {/* Botão de Carrinho / DAV */}
          <button
            onClick={() => setShowCarrinhoModal(true)}
            className={cn(
              "flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all active:scale-95",
              carrinho.length > 0
                ? "bg-primary text-primary-foreground shadow-md hover:bg-primary/95"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            <ShoppingCart size={16} />
            <span>DAV / Carrinho</span>
            {totalCarrinhoItens > 0 && (
              <span className="ml-1 bg-white text-primary text-xs font-bold px-1.5 py-0.2 rounded-full">
                {totalCarrinhoItens}
              </span>
            )}
          </button>

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all"
          >
            <Download size={14} /> CSV
          </button>
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all"
          >
            <FileSpreadsheet size={14} /> Excel
          </button>
          {isAdmin && (
            <button
              onClick={() => openProdutoModal()}
              className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:opacity-90 active:scale-95"
              style={{ background: 'hsl(var(--primary))' }}
            >
              <Plus size={15} />
              Novo Produto
            </button>
          )}
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="space-y-2 rounded-xl border bg-card p-3 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Pesquise por nome da peça, código de fábrica, código interno, aplicação ou marca..."
              className="w-full rounded-lg border bg-background pl-10 pr-8 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X size={14} />
              </button>
            )}
          </div>
          {hasActiveFilter && (
            <button
              onClick={clearFilters}
              className="px-3 py-2 rounded-lg text-xs font-semibold border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all flex items-center justify-center gap-1.5 shrink-0"
            >
              <X size={13} /> Limpar filtros
            </button>
          )}
        </div>

        <FiltroVeiculoPecas value={vehicleFilter} onChange={setVehicleFilter} />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
          <select
            value={tipoVeic}
            onChange={e => setTipoVeic(e.target.value)}
            className="rounded-lg border bg-background px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="Todos">Tipo de Veículo (Todos)</option>
            {tiposVeiculo.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            value={marcaFiltro}
            onChange={e => setMarcaFiltro(e.target.value)}
            className="rounded-lg border bg-background px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="Todas">Marca da Peça (Todas)</option>
            {filterMarcas.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select
            value={categoria}
            onChange={e => setCategoria(e.target.value)}
            className="rounded-lg border bg-background px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="Todos">Grupo / Categoria (Todas)</option>
            {filterCategorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Main Split-Screen Layout (Master List + Detail Preview Card) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Column: High-Density Table */}
        <div className="lg:col-span-8 rounded-xl border bg-card shadow-sm overflow-hidden flex flex-col">
          {/* Table Header Bar */}
          <div className="px-4 py-2.5 bg-muted/30 border-b flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <Package size={14} className="text-primary" />
              Catálogo ({produtos.length} {produtos.length === 1 ? 'item' : 'itens'})
            </span>
            <span className="hidden sm:inline italic text-[11px]">
              Selecione com 1 clique • Duplo clique adiciona ao DAV
            </span>
          </div>

          {produtos.length === 0 ? (
            <div className="py-16 text-center">
              <Package size={40} className="mx-auto mb-3 text-muted-foreground/30" />
              <p className="font-semibold text-muted-foreground">Nenhum produto encontrado</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Ajuste os filtros ou cadastre um novo produto</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[calc(100vh-21rem)] overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-zinc-900 text-zinc-100 uppercase tracking-wider text-[10px] font-bold sticky top-0 z-10 select-none">
                  <tr>
                    <th className="py-2.5 pl-3 pr-2 w-20">Código</th>
                    <th className="py-2.5 px-2">Descrição da Peça</th>
                    <th className="py-2.5 px-2 w-24">Marca</th>
                    <th className="py-2.5 px-2 w-24">Ref. Fábrica</th>
                    <th className="py-2.5 px-2">Aplicação</th>
                    <th className="py-2.5 px-2 text-center w-16">Estoque</th>
                    <th className="py-2.5 pr-3 pl-2 text-right w-24">Preço</th>
                    {isAdmin && <th className="py-2.5 pr-3 w-16 text-center">Ações</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {produtos.map(p => {
                    const isSelected = selectedProduto?.id === p.id;
                    const isExpanded = expanded === p.id;
                    const stockLow = p.estoque_total <= p.estoque_minimo;

                    return (
                      <React.Fragment key={p.id}>
                        <tr
                          onClick={() => {
                            setSelectedProduto(p);
                            setCardQtd(1);
                          }}
                          onDoubleClick={() => handleAdicionarAoCarrinho(p, 1)}
                          className={cn(
                            "cursor-pointer transition-colors select-none",
                            isSelected
                              ? "bg-primary/10 border-l-4 border-l-primary font-medium"
                              : "hover:bg-muted/40"
                          )}
                        >
                          <td className="py-2 pl-3 pr-2 font-mono font-bold text-foreground">
                            {p.codigo_interno || p.codigo || '—'}
                          </td>
                          <td className="py-2 px-2 font-medium text-foreground max-w-[240px] truncate" title={p.nome}>
                            {p.nome}
                          </td>
                          <td className="py-2 px-2 text-muted-foreground uppercase font-semibold">
                            {p.marca || '—'}
                          </td>
                          <td className="py-2 px-2 font-mono text-muted-foreground">
                            {p.codigo_fabrica || '—'}
                          </td>
                          <td className="py-2 px-2 text-muted-foreground max-w-[200px] truncate text-[11px]" title={p.aplicacao}>
                            {p.aplicacao || '—'}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <span className={cn(
                              "inline-block px-1.5 py-0.5 rounded text-[11px] font-bold",
                              stockLow ? "bg-red-500/15 text-red-600" : "bg-emerald-500/15 text-emerald-600"
                            )}>
                              {p.estoque_total}
                            </span>
                          </td>
                          <td className="py-2 pr-3 pl-2 text-right font-bold text-foreground">
                            {p.preco_venda.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </td>
                          {isAdmin && (
                            <td className="py-2 pr-3 text-center" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => openProdutoModal(p as any)}
                                  title="Editar Produto"
                                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                                >
                                  <Edit2 size={12} />
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm('Excluir este produto?')) deleteMutation.mutate(p.id);
                                  }}
                                  title="Excluir"
                                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>

                        {isExpanded && (
                          <>
                            <tr className="bg-muted/10">
                              <td colSpan={isAdmin ? 8 : 7}>
                                <div className="px-6 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                                  Gestão de Lotes (FIFO)
                                </div>
                              </td>
                            </tr>
                            {(p.lotes ?? []).map(l => (
                              <LoteRow key={l.id} lote={l} isAdmin={isAdmin} />
                            ))}
                          </>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Column: Visual Product Preview Card (Exact Match with user reference image) */}
        <div className="lg:col-span-4 sticky top-4">
          {selectedProduto ? (() => {
            const itemImgs = selectedProduto.imagens && selectedProduto.imagens.length > 0
              ? selectedProduto.imagens
              : selectedProduto.imagem_url
                ? [selectedProduto.imagem_url]
                : [];
            const activeImgUrl = itemImgs[activeImgIdx] || selectedProduto.imagem_url;

            return (
              <div className="rounded-2xl border bg-card shadow-sm p-5 space-y-4">
                {/* Product Photo Box */}
                <div className="space-y-2">
                  <div className="w-full h-56 rounded-xl border bg-white flex items-center justify-center p-3 overflow-hidden shadow-inner relative group">
                    {activeImgUrl ? (
                      <img
                        src={activeImgUrl}
                        alt={selectedProduto.nome}
                        className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-muted-foreground/40 gap-2">
                        <Package size={56} strokeWidth={1.2} />
                        <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground/60">
                          Foto da Peça
                        </span>
                      </div>
                    )}
                    {selectedProduto.estoque_total > 0 && (
                      <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 border border-emerald-500/30">
                        Em Estoque ({selectedProduto.estoque_total})
                      </span>
                    )}
                    {itemImgs.length > 1 && (
                      <span className="absolute bottom-2.5 right-2.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-black/60 text-white backdrop-blur-xs">
                        {activeImgIdx + 1}/{itemImgs.length}
                      </span>
                    )}
                  </div>

                  {/* Thumbnail Selector (se tiver mais de 1 imagem) */}
                  {itemImgs.length > 1 && (
                    <div className="flex items-center gap-2 justify-center pt-0.5">
                      {itemImgs.map((img, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setActiveImgIdx(idx)}
                          className={cn(
                            "w-12 h-12 rounded-lg border bg-white p-1 overflow-hidden transition-all shadow-xs",
                            activeImgIdx === idx
                              ? "border-primary ring-2 ring-primary/30 scale-105"
                              : "opacity-60 hover:opacity-100"
                          )}
                        >
                          <img src={img} alt={`Foto ${idx + 1}`} className="w-full h-full object-contain" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

              {/* Title & Brand */}
              <div className="space-y-1">
                <h3 className="font-bold text-sm uppercase text-foreground leading-snug">
                  {selectedProduto.nome}
                </h3>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
                  <Tag size={13} className="text-primary" />
                  <span>{selectedProduto.marca || 'MARCA NÃO INFORMADA'}</span>
                </div>
              </div>

              {/* Spec Rows */}
              <div className="space-y-2 text-xs pt-1 border-t">
                <div className="flex items-start justify-between gap-2 py-0.5">
                  <span className="text-muted-foreground">Aplicação:</span>
                  <span className="font-medium text-foreground text-right">{selectedProduto.aplicacao || 'Universal / Ampla'}</span>
                </div>
                <div className="flex items-start justify-between gap-2 py-0.5">
                  <span className="text-muted-foreground">Referência:</span>
                  <span className="font-mono font-medium text-foreground">{selectedProduto.codigo_fabrica || selectedProduto.codigo_interno || selectedProduto.codigo}</span>
                </div>
                <div className="flex items-start justify-between gap-2 py-0.5">
                  <span className="text-muted-foreground">Marca:</span>
                  <span className="font-semibold text-foreground uppercase">{selectedProduto.marca || '—'}</span>
                </div>
                <div className="flex items-start justify-between gap-2 py-0.5">
                  <span className="text-muted-foreground">Grupo:</span>
                  <span className="text-foreground">{selectedProduto.categoria || 'Autopeças'}</span>
                </div>
                <div className="flex items-start justify-between gap-2 py-0.5">
                  <span className="text-muted-foreground">Localização:</span>
                  <span className="font-mono text-foreground font-medium flex items-center gap-1">
                    <MapPin size={11} className="text-primary" />
                    {selectedProduto.localizacao || 'Corredor A-Prateleira 01-G-01'}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-2 py-0.5">
                  <span className="text-muted-foreground">Estoque:</span>
                  <span className="font-bold text-foreground">
                    {selectedProduto.estoque_total.toFixed(2)} unidades
                  </span>
                </div>
                <div className="flex items-start justify-between gap-2 py-1 border-t font-semibold text-sm">
                  <span className="text-muted-foreground">Preço Unitário:</span>
                  <span className="text-primary font-bold text-base">
                    {selectedProduto.preco_venda.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </div>
              </div>

              {/* Quantity Stepper & Add Action */}
              <div className="pt-2 border-t space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">Qtd:</span>
                  <div className="flex items-center border rounded-lg bg-background overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setCardQtd(q => Math.max(1, q - 1))}
                      className="px-2.5 py-1 text-sm font-bold text-muted-foreground hover:bg-muted transition-colors"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={1}
                      value={cardQtd}
                      onChange={e => setCardQtd(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-12 text-center text-xs font-bold bg-transparent focus:outline-none py-1"
                    />
                    <button
                      type="button"
                      onClick={() => setCardQtd(q => q + 1)}
                      className="px-2.5 py-1 text-sm font-bold text-muted-foreground hover:bg-muted transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleAdicionarAoCarrinho(selectedProduto, cardQtd)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 px-4 font-semibold text-sm text-white shadow-sm transition-all hover:opacity-95 active:scale-98"
                  style={{ background: 'hsl(var(--primary))' }}
                >
                  <ShoppingCart size={16} />
                  Adicionar ao DAV / Carrinho
                </button>
              </div>
            </div>
            );
          })() : (
            <div className="rounded-2xl border bg-card p-8 text-center text-muted-foreground space-y-2">
              <Package size={40} className="mx-auto opacity-30" />
              <p className="font-semibold text-sm">Selecione uma peça</p>
              <p className="text-xs text-muted-foreground/70">
                Clique em qualquer linha da tabela para ver a foto e detalhes completos
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Modal / Drawer do Carrinho de Venda (DAV) */}
      {showCarrinhoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-background rounded-2xl shadow-xl w-full max-w-lg border overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-5 py-3.5 border-b bg-muted/20">
              <div className="flex items-center gap-2">
                <ShoppingCart size={18} className="text-primary" />
                <h3 className="font-bold text-base">Carrinho de Venda / DAV</h3>
              </div>
              <button
                onClick={() => setShowCarrinhoModal(false)}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-3">
              {carrinho.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground space-y-2">
                  <ShoppingCart size={40} className="mx-auto opacity-20" />
                  <p className="font-semibold text-sm">Carrinho vazio</p>
                  <p className="text-xs">Selecione peças e dê duplo clique na tabela para adicionar</p>
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {carrinho.map(item => (
                    <div key={item.produto.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground truncate">{item.produto.nome}</p>
                        <p className="text-muted-foreground text-[11px]">
                          {item.produto.codigo_fabrica || item.produto.codigo} · {item.produto.marca}
                        </p>
                        <p className="text-primary font-bold mt-0.5">
                          {item.preco_unitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} un
                        </p>
                      </div>

                      {/* Quantity Stepper */}
                      <div className="flex items-center border rounded-lg bg-background">
                        <button
                          onClick={() => handleAtualizarQtdCarrinho(item.produto.id, item.quantidade - 1)}
                          className="px-2 py-1 text-xs font-bold hover:bg-muted"
                        >
                          -
                        </button>
                        <span className="px-2 font-bold text-xs">{item.quantidade}</span>
                        <button
                          onClick={() => handleAtualizarQtdCarrinho(item.produto.id, item.quantidade + 1)}
                          className="px-2 py-1 text-xs font-bold hover:bg-muted"
                        >
                          +
                        </button>
                      </div>

                      <div className="text-right font-bold w-20">
                        {(item.quantidade * item.preco_unitario).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </div>

                      <button
                        onClick={() => handleRemoverDoCarrinho(item.produto.id)}
                        className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {carrinho.length > 0 && (
              <div className="border-t p-4 bg-muted/10 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total do Pedido:</span>
                  <span className="font-bold text-lg text-primary">
                    {totalCarrinhoValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCarrinho([])}
                    className="flex-1 py-2 px-3 text-xs font-semibold rounded-xl border hover:bg-muted transition-colors text-muted-foreground"
                  >
                    Limpar Carrinho
                  </button>
                  <button
                    onClick={handleEnviarParaOrcamento}
                    className="flex-2 py-2.5 px-4 text-xs font-bold rounded-xl text-white shadow-sm flex items-center justify-center gap-1.5 transition-all hover:opacity-95"
                    style={{ background: 'hsl(var(--primary))' }}
                  >
                    Gerar Orçamento / DAV <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
