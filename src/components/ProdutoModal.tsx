import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Plus, X, Loader2, Calculator, FileText, TrendingUp, TrendingDown,
  Copy, Save, Upload, Link as LinkIcon, Image as ImageIcon, Sparkles, CheckCircle2, Trash2,
  Minus, Maximize2, Package
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { compressImageToWebP, formatFileSize } from '@/lib/image-compress';

const categoriasDefault = ['Filtros', 'Freios', 'Suspensão', 'Motor', 'Arrefecimento'];
const tiposVeiculo = ['Carro', 'Moto', 'Pesado', 'Agrícola'];

export interface ProdutoModalData {
  id?: string;
  codigo?: string;
  codigo_fabrica: string;
  codigo_interno?: string;
  nome: string;
  marca: string;
  aplicacao: string;
  ncm: string;
  preco_venda: number;
  markup_percentual: number;
  estoque_minimo: number;
  estoque_total?: number;
  quantidade_inicial?: number;
  fornecedor_inicial?: string;
  categoria: string;
  tipo_veiculo: string;
  icms_percentual: number;
  ipi_percentual: number;
  pis_percentual: number;
  cofins_percentual: number;
  preco_custo?: number;
  frete_custo?: number;
  imagem_url?: string | null;
  imagens?: string[] | null;
  localizacao?: string | null;
}

const parseNum = (val: string | number | undefined | null): number => {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (!val) return 0;
  const str = String(val).trim();
  const normalized = str.includes(',') && str.includes('.')
    ? str.replace(/\./g, '').replace(',', '.')
    : str.replace(',', '.');
  return parseFloat(normalized) || 0;
};

export interface ProdutoModalProps {
  produto?: ProdutoModalData;
  isOpen?: boolean;
  isMinimized?: boolean;
  onMinimize?: () => void;
  onRestore?: () => void;
  onClose: () => void;
  onSave: (data: Record<string, any>) => void;
  saving?: boolean;
  markupPadrao?: string;
  customCategorias?: string[];
  onSaveSimulacao?: (snap: SimulacaoCustoSnapshot) => void;
  orcamentoLabel?: string;
}

export interface SimulacaoCustoSnapshot {
  id: string;
  produto_nome: string;
  data: string;
  preco_custo: number;
  frete_custo: number;
  custo_total: number;
  markup: number;
  icms: number;
  ipi: number;
  pis: number;
  cofins: number;
  total_impostos_pct: number;
  impostos_valor: number;
  preco_sugerido: number;
  preco_negociado: number;
  lucro_bruto: number;
  lucro_liquido: number;
  margem_bruta: number;
  margem_liquida: number;
  markup_real: number;
}

const DRAFT_PROD_KEY = 'mgn_draft_produto';

export default function ProdutoModal({
  produto,
  isOpen = true,
  isMinimized = false,
  onMinimize,
  onRestore,
  onClose,
  onSave,
  saving,
  markupPadrao = '30',
  customCategorias = [],
  onSaveSimulacao,
  orcamentoLabel
}: ProdutoModalProps) {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allCategorias = useMemo(() => {
    const merged = new Set([...categoriasDefault, ...customCategorias]);
    return Array.from(merged).sort();
  }, [customCategorias]);

  const [showNewCat, setShowNewCat] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [tab, setTab] = useState<'cadastro' | 'calculo'>('cadastro');
  const [simPrecoVenda, setSimPrecoVenda] = useState('');

  // Imagens do produto (até 3 imagens)
  const [imagens, setImagens] = useState<string[]>(() => {
    if (produto?.imagens && Array.isArray(produto.imagens) && produto.imagens.length > 0) {
      return produto.imagens.slice(0, 3);
    }
    if (produto?.imagem_url) {
      return [produto.imagem_url];
    }
    return [];
  });
  const [linkInput, setLinkInput] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [compressionInfo, setCompressionInfo] = useState<string | null>(null);

  const getInitialForm = () => {
    if (produto) {
      return {
        nome: produto.nome || '',
        marca: produto.marca || '',
        aplicacao: produto.aplicacao || '',
        ncm: produto.ncm || '',
        precoCusto: produto.preco_custo ? produto.preco_custo.toString() : '',
        freteCusto: produto.frete_custo ? produto.frete_custo.toString() : '',
        precoVenda: produto.preco_venda?.toString() || '',
        markup: produto.markup_percentual?.toString() || markupPadrao,
        estoqueMinimo: produto.estoque_minimo?.toString() || '1',
        categoria: produto.categoria || categoriasDefault[0],
        codigoFabrica: produto.codigo_fabrica || '',
        tipoVeiculo: produto.tipo_veiculo || 'Carro',
        localizacao: produto.localizacao || 'Corredor A-Prateleira 01-G-01',
        icms: produto.icms_percentual?.toString() || '',
        ipi: produto.ipi_percentual?.toString() || '',
        pis: produto.pis_percentual?.toString() || '',
        cofins: produto.cofins_percentual?.toString() || '',
        fornecedor: produto.fornecedor_inicial || '',
        quantidadeInicial: produto.quantidade_inicial !== undefined ? String(produto.quantidade_inicial) : '',
      };
    }
    try {
      const saved = localStorage.getItem(DRAFT_PROD_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      nome: '',
      marca: '',
      aplicacao: '',
      ncm: '',
      precoCusto: '',
      freteCusto: '',
      precoVenda: '',
      markup: markupPadrao,
      estoqueMinimo: '1',
      categoria: categoriasDefault[0],
      codigoFabrica: '',
      tipoVeiculo: 'Carro',
      localizacao: 'Corredor A-Prateleira 01-G-01',
      icms: '',
      ipi: '',
      pis: '',
      cofins: '',
      fornecedor: '',
      quantidadeInicial: '1',
    };
  };

  const [form, setForm] = useState(getInitialForm);

  useEffect(() => {
    if (produto) {
      setForm({
        nome: produto.nome || '',
        marca: produto.marca || '',
        aplicacao: produto.aplicacao || '',
        ncm: produto.ncm || '',
        precoCusto: produto.preco_custo ? produto.preco_custo.toString() : '',
        freteCusto: produto.frete_custo ? produto.frete_custo.toString() : '',
        precoVenda: produto.preco_venda?.toString() || '',
        markup: produto.markup_percentual?.toString() || markupPadrao,
        estoqueMinimo: produto.estoque_minimo?.toString() || '1',
        categoria: produto.categoria || categoriasDefault[0],
        codigoFabrica: produto.codigo_fabrica || '',
        tipoVeiculo: produto.tipo_veiculo || 'Carro',
        localizacao: produto.localizacao || 'Corredor A-Prateleira 01-G-01',
        icms: produto.icms_percentual?.toString() || '',
        ipi: produto.ipi_percentual?.toString() || '',
        pis: produto.pis_percentual?.toString() || '',
        cofins: produto.cofins_percentual?.toString() || '',
        fornecedor: produto.fornecedor_inicial || '',
        quantidadeInicial: produto.quantidade_inicial !== undefined ? String(produto.quantidade_inicial) : '',
      });
    }
  }, [produto?.id, produto?.codigo, markupPadrao]);

  useEffect(() => {
    if (!produto && (form.nome || form.codigoFabrica || form.precoVenda)) {
      try {
        localStorage.setItem(DRAFT_PROD_KEY, JSON.stringify(form));
      } catch {}
    }
  }, [form, produto]);

  const handleAddCategory = () => {
    const trimmed = newCat.trim();
    if (trimmed && !allCategorias.includes(trimmed)) {
      allCategorias.push(trimmed);
      allCategorias.sort();
    }
    if (trimmed) {
      setForm(f => ({ ...f, categoria: trimmed }));
    }
    setNewCat('');
    setShowNewCat(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm(f => {
      const updated = { ...f, [name]: value };
      if (['precoCusto', 'freteCusto', 'markup', 'icms', 'ipi', 'pis', 'cofins'].includes(name)) {
        const custoBase = parseNum(name === 'precoCusto' ? value : updated.precoCusto);
        const frete = parseNum(name === 'freteCusto' ? value : updated.freteCusto);
        const custo = custoBase + frete;
        const markup = parseNum(name === 'markup' ? value : updated.markup);
        const icms = parseNum(name === 'icms' ? value : updated.icms);
        const ipi = parseNum(name === 'ipi' ? value : updated.ipi);
        const pis = parseNum(name === 'pis' ? value : updated.pis);
        const cofins = parseNum(name === 'cofins' ? value : updated.cofins);
        if (custo > 0) {
          const totalImpostos = icms + ipi + pis + cofins;
          const precoVenda = custo * (1 + totalImpostos / 100) * (1 + markup / 100);
          updated.precoVenda = precoVenda.toFixed(2);
        }
      }
      return updated;
    });
  };

  // Upload com Compressão Inteligente para WebP
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (imagens.length >= 3) {
      toast({ title: 'Limite de 3 imagens atingido', variant: 'destructive' });
      return;
    }

    setUploadingImage(true);
    setCompressionInfo('Comprimindo e convertendo para WebP (máx 1024px)...');
    try {
      // 1. Compressão inteligente no navegador (descarta EXIF/GPS, redimensiona para máx 1024px e converte para WebP)
      const compressed = await compressImageToWebP(file, 1024, 0.82);

      // 2. Upload para o Supabase Storage no bucket produtos-imagens
      const fileExt = 'webp';
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
      const filePath = `itens/${fileName}`;

      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('produtos-imagens')
        .upload(filePath, compressed.blob, {
          contentType: 'image/webp',
          upsert: true,
        });

      if (uploadErr) throw uploadErr;

      // 3. Obter URL pública
      const { data: publicUrlData } = supabase.storage
        .from('produtos-imagens')
        .getPublicUrl(filePath);

      const url = publicUrlData.publicUrl;
      setImagens(prev => [...prev, url].slice(0, 3));

      const stats = `Reduzido de ${formatFileSize(compressed.originalSize)} para ${formatFileSize(compressed.compressedSize)} (-${compressed.reductionPct}%)`;
      setCompressionInfo(stats);
      toast({
        title: 'Imagem compactada com sucesso!',
        description: stats,
      });
    } catch (err: any) {
      console.error('Erro na compressão/upload:', err);
      toast({
        title: 'Erro ao processar imagem',
        description: err.message || 'Tente novamente com outro arquivo.',
        variant: 'destructive',
      });
      setCompressionInfo(null);
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Adicionar Link Externo de Imagem
  const handleAddLink = () => {
    const url = linkInput.trim();
    if (!url) return;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      toast({ title: 'Insira uma URL válida (iniciando com https://)', variant: 'destructive' });
      return;
    }
    if (imagens.length >= 3) {
      toast({ title: 'Limite de 3 imagens atingido', variant: 'destructive' });
      return;
    }
    setImagens(prev => [...prev, url].slice(0, 3));
    setLinkInput('');
    setShowLinkInput(false);
    toast({ title: 'Link de imagem adicionado!' });
  };

  const handleRemoveImage = (index: number) => {
    setImagens(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (!form.nome.trim()) {
      toast({ title: 'Preencha o nome do produto', variant: 'destructive' });
      return;
    }
    const precoCustoNum = parseNum(form.precoCusto);
    const freteCustoNum = parseNum(form.freteCusto);
    const custoTotal = precoCustoNum + freteCustoNum;
    const qtdInformada = Math.max(0, Math.round(parseNum(form.quantidadeInicial)));

    const codFab = form.codigoFabrica.trim();
    const codPrincipal = produto?.codigo || codFab || `PRD-${Date.now().toString().slice(-6)}`;

    try {
      localStorage.removeItem(DRAFT_PROD_KEY);
    } catch {}

    onSave({
      codigo: codPrincipal,
      codigo_fabrica: codFab,
      codigo_interno: produto?.codigo_interno || '',
      nome: form.nome.trim(),
      marca: form.marca.trim() || 'Geral',
      aplicacao: form.aplicacao.trim() || 'A definir / Consultar catálogo',
      ncm: form.ncm.trim(),
      preco_venda: parseNum(form.precoVenda),
      markup_percentual: parseNum(form.markup),
      estoque_minimo: Math.max(0, Math.round(parseNum(form.estoqueMinimo))),
      categoria: form.categoria,
      tipo_veiculo: form.tipoVeiculo,
      localizacao: form.localizacao.trim() || 'Corredor A-Prateleira 01-G-01',
      icms_percentual: parseNum(form.icms),
      ipi_percentual: parseNum(form.ipi),
      pis_percentual: parseNum(form.pis),
      cofins_percentual: parseNum(form.cofins),
      imagens: imagens,
      imagem_url: imagens[0] || null, // Primeira imagem é a capa/principal
      _lote: {
        fornecedor: form.fornecedor.trim() || form.marca.trim() || '—',
        preco_custo: custoTotal,
        quantidade: qtdInformada,
      },
    });
  };

  const inputClass = "w-full rounded-lg border px-3 py-2 text-xs sm:text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all";

  const calc = useMemo(() => {
    const custoBase = parseNum(form.precoCusto);
    const frete = parseNum(form.freteCusto);
    const custo = custoBase + frete;
    const markup = parseNum(form.markup);
    const icms = parseNum(form.icms);
    const ipi = parseNum(form.ipi);
    const pis = parseNum(form.pis);
    const cofins = parseNum(form.cofins);
    const totalImpostosPct = icms + ipi + pis + cofins;
    const precoSugerido = custo > 0 ? custo * (1 + totalImpostosPct / 100) * (1 + markup / 100) : 0;
    const precoNegociado = parseNum(simPrecoVenda) || precoSugerido;
    const impostosValor = precoNegociado * (totalImpostosPct / 100);
    const lucroBruto = precoNegociado - custo;
    const lucroLiquido = precoNegociado - custo - impostosValor;
    const margemBruta = precoNegociado > 0 ? (lucroBruto / precoNegociado) * 100 : 0;
    const margemLiquida = precoNegociado > 0 ? (lucroLiquido / precoNegociado) * 100 : 0;
    const markupReal = custo > 0 ? ((precoNegociado - custo) / custo) * 100 : 0;
    return { custo, totalImpostosPct, impostosValor, precoSugerido, precoNegociado, lucroBruto, lucroLiquido, margemBruta, margemLiquida, markupReal };
  }, [form, simPrecoVenda]);

  const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const handleCopyResumo = async () => {
    const linhas = [
      `Simulação de Cálculo de Custo${form.nome ? ` — ${form.nome}` : ''}`,
      `Data: ${new Date().toLocaleString('pt-BR')}`,
      '',
      `Custo: ${fmt(parseNum(form.precoCusto))}`,
      `Frete: ${fmt(parseNum(form.freteCusto))}`,
      `Custo total: ${fmt(calc.custo)}`,
      `Markup: ${parseNum(form.markup).toFixed(2)}%`,
      `Impostos: ${fmt(calc.impostosValor)}`,
      `Preço sugerido: ${fmt(calc.precoSugerido)}`,
      `Preço negociado: ${fmt(calc.precoNegociado)}`,
      `Lucro bruto: ${fmt(calc.lucroBruto)} (${calc.margemBruta.toFixed(2)}%)`,
      `Lucro líquido: ${fmt(calc.lucroLiquido)} (${calc.margemLiquida.toFixed(2)}%)`,
    ];
    const texto = linhas.join('\n');
    try {
      await navigator.clipboard.writeText(texto);
      toast({ title: 'Resumo copiado com sucesso!' });
    } catch {
      toast({ title: 'Erro ao copiar', variant: 'destructive' });
    }
  };

  const handleSalvarSimulacao = () => {
    if (!onSaveSimulacao) return;
    const snap: SimulacaoCustoSnapshot = {
      id: `sim-${Date.now()}`,
      produto_nome: form.nome.trim() || 'Produto sem nome',
      data: new Date().toISOString(),
      preco_custo: parseNum(form.precoCusto),
      frete_custo: parseNum(form.freteCusto),
      custo_total: calc.custo,
      markup: parseNum(form.markup),
      icms: parseNum(form.icms),
      ipi: parseNum(form.ipi),
      pis: parseNum(form.pis),
      cofins: parseNum(form.cofins),
      total_impostos_pct: calc.totalImpostosPct,
      impostos_valor: calc.impostosValor,
      preco_sugerido: calc.precoSugerido,
      preco_negociado: calc.precoNegociado,
      lucro_bruto: calc.lucroBruto,
      lucro_liquido: calc.lucroLiquido,
      margem_bruta: calc.margemBruta,
      margem_liquida: calc.margemLiquida,
      markup_real: calc.markupReal,
    };
    onSaveSimulacao(snap);
    toast({ title: 'Simulação vinculada ao orçamento!' });
  };

  if (!isOpen) return null;

  if (isMinimized) {
    return (
      <div
        onClick={onRestore}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-3 bg-card border-2 border-primary/50 shadow-2xl rounded-2xl p-3 px-4 cursor-pointer hover:border-primary transition-all animate-bounce-in max-w-sm"
        style={{ boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)' }}
      >
        <div className="p-2 rounded-xl bg-primary/10 text-primary">
          <Package size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            {produto ? 'Editando Peça' : 'Cadastrando Peça (Aberta)'}
          </p>
          <p className="text-sm font-medium text-foreground truncate">
            {form.nome.trim() || 'Nova Peça (clique para expandir)'}
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
            onClick={(e) => { e.stopPropagation(); onClose(); }}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="relative bg-background rounded-2xl shadow-xl w-full max-w-2xl border overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header com Abas */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b bg-muted/20">
          <div className="flex items-center gap-3">
            <h2 className="font-bold text-base">{produto ? 'Editar Produto' : 'Cadastrar Nova Peça'}</h2>
            <div className="flex rounded-lg border bg-background p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setTab('cadastro')}
                className={cn('px-2.5 py-1 rounded-md transition-colors', tab === 'cadastro' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                Dados da Peça
              </button>
              <button
                type="button"
                onClick={() => setTab('calculo')}
                className={cn('px-2.5 py-1 rounded-md transition-colors flex items-center gap-1', tab === 'calculo' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                <Calculator size={12} /> Cálculo & Margem
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {onMinimize && (
              <button
                type="button"
                onClick={onMinimize}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Minimizar janela para navegar livremente pelo sistema"
              >
                <Minus size={18} />
              </button>
            )}
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Fechar">
              <X size={18} />
            </button>
          </div>
        </div>

        {tab === 'cadastro' && (
          <div className="px-6 py-5 grid grid-cols-2 gap-3.5 overflow-y-auto flex-1">
            {/* SEÇÃO: IMAGENS DA PEÇA (ATÉ 3 IMAGENS + COMPRESSÃO INTELIGENTE) */}
            <div className="col-span-2 rounded-xl border bg-muted/20 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ImageIcon size={16} className="text-primary" />
                  <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Fotos do Produto ({imagens.length}/3)
                  </span>
                  <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-500/15 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Sparkles size={11} /> WebP -95%
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  Primeira foto será a capa
                </span>
              </div>

              {/* Thumbnails list */}
              <div className="grid grid-cols-3 gap-2.5">
                {imagens.map((img, idx) => (
                  <div key={idx} className="relative rounded-lg border bg-white h-24 overflow-hidden group shadow-sm flex items-center justify-center">
                    <img src={img} alt={`Foto ${idx + 1}`} className="max-h-full max-w-full object-contain" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(idx)}
                        className="p-1.5 rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors shadow"
                        title="Remover imagem"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    {idx === 0 && (
                      <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-primary text-primary-foreground shadow">
                        Capa
                      </span>
                    )}
                  </div>
                ))}

                {/* Slot para adicionar mais imagens */}
                {imagens.length < 3 && (
                  <div className="h-24 rounded-lg border border-dashed border-primary/40 bg-primary/5 flex flex-col items-center justify-center p-2 text-center gap-1.5">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      id="peca-file-upload"
                      disabled={uploadingImage}
                      onChange={handleFileChange}
                    />
                    <label
                      htmlFor="peca-file-upload"
                      className="cursor-pointer text-[11px] font-bold text-primary hover:underline flex items-center gap-1"
                    >
                      {uploadingImage ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                      {uploadingImage ? 'Comprimindo...' : 'Enviar Foto'}
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowLinkInput(v => !v)}
                      className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                      <LinkIcon size={10} /> Colar Link
                    </button>
                  </div>
                )}
              </div>

              {/* Input para Colar URL da Imagem */}
              {showLinkInput && imagens.length < 3 && (
                <div className="flex items-center gap-2 pt-1 animate-fade-in">
                  <input
                    type="url"
                    placeholder="https://exemplo.com/foto-peca.jpg"
                    value={linkInput}
                    onChange={e => setLinkInput(e.target.value)}
                    className="flex-1 rounded-lg border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={handleAddLink}
                    disabled={!linkInput.trim()}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Adicionar
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowLinkInput(false); setLinkInput(''); }}
                    className="p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {compressionInfo && (
                <p className="text-[11px] text-emerald-600 flex items-center gap-1 font-medium">
                  <CheckCircle2 size={12} /> {compressionInfo}
                </p>
              )}
            </div>

            {/* Código Interno (se editando) */}
            {produto?.codigo_interno && (
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                  Código Interno
                </label>
                <input
                  value={produto.codigo_interno}
                  disabled
                  className={cn(inputClass, 'bg-muted font-mono font-bold text-primary')}
                />
              </div>
            )}

            {/* Campos Principais */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Código de Fábrica / Ref.
              </label>
              <input
                name="codigoFabrica"
                value={form.codigoFabrica}
                onChange={handleChange}
                placeholder="Ex: SE 32760"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Marca da Peça
              </label>
              <input
                name="marca"
                value={form.marca}
                onChange={handleChange}
                placeholder="Ex: NAKATA, COBREQ, BOSCH"
                className={inputClass}
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Nome / Descrição da Peça <span className="text-red-500">*</span>
              </label>
              <input
                name="nome"
                value={form.nome}
                onChange={handleChange}
                placeholder="Ex: AMORTECEDOR SUSPENSÃO DIANTEIRO"
                className={inputClass}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Categoria / Grupo
              </label>
              <div className="flex gap-1.5">
                <select
                  name="categoria"
                  value={form.categoria}
                  onChange={handleChange}
                  className={cn(inputClass, 'flex-1')}
                >
                  {allCategorias.map(c => <option key={c}>{c}</option>)}
                </select>
                {!showNewCat && (
                  <button
                    type="button"
                    onClick={() => setShowNewCat(true)}
                    className="px-2 rounded-lg border hover:bg-muted text-muted-foreground"
                    title="Nova categoria"
                  >
                    <Plus size={14} />
                  </button>
                )}
              </div>
              {showNewCat && (
                <div className="flex gap-1.5 mt-1.5">
                  <input
                    value={newCat}
                    onChange={e => setNewCat(e.target.value)}
                    placeholder="Nova categoria..."
                    className={cn(inputClass, 'flex-1')}
                    onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
                  />
                  <button type="button" onClick={handleAddCategory} className="px-2.5 py-1 text-xs font-bold text-white rounded-lg bg-primary">OK</button>
                  <button type="button" onClick={() => setShowNewCat(false)} className="px-2 rounded-lg border text-xs"><X size={12} /></button>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Tipo de Veículo
              </label>
              <select
                name="tipoVeiculo"
                value={form.tipoVeiculo}
                onChange={handleChange}
                className={inputClass}
              >
                {tiposVeiculo.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Aplicação / Modelos Compatíveis
              </label>
              <input
                name="aplicacao"
                value={form.aplicacao}
                onChange={handleChange}
                placeholder="Ex: FIAT UNO 1985 A 2013 3P/5P"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Localização (Prateleira / Gaveta)
              </label>
              <input
                name="localizacao"
                value={form.localizacao}
                onChange={handleChange}
                placeholder="Ex: Corredor A-Prateleira 01-G-01"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                NCM
              </label>
              <input
                name="ncm"
                value={form.ncm}
                onChange={handleChange}
                placeholder="Ex: 8708.80.00"
                className={inputClass}
              />
            </div>

            {/* Preços e Estoque */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Preço de Custo (R$)
              </label>
              <input
                name="precoCusto"
                value={form.precoCusto}
                onChange={handleChange}
                placeholder="0,00"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Markup Padrão (%)
              </label>
              <input
                name="markup"
                value={form.markup}
                onChange={handleChange}
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Preço de Venda (R$)
              </label>
              <input
                name="precoVenda"
                value={form.precoVenda}
                onChange={handleChange}
                className={cn(inputClass, 'font-bold text-primary')}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Estoque Mínimo
              </label>
              <input
                name="estoqueMinimo"
                type="number"
                value={form.estoqueMinimo}
                onChange={handleChange}
                placeholder="1"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                {produto?.id
                  ? `Somar Qtd ao Estoque (Atual: ${produto.estoque_total ?? 0})`
                  : 'Qtd de Entrada no Estoque'}
              </label>
              <input
                name="quantidadeInicial"
                type="number"
                min="0"
                value={form.quantidadeInicial}
                onChange={handleChange}
                placeholder={produto?.id ? '0 (digite para somar)' : '1'}
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Fornecedor Inicial
              </label>
              <input
                name="fornecedor"
                value={form.fornecedor}
                onChange={handleChange}
                placeholder="Ex: Distribuidora DPK"
                className={inputClass}
              />
            </div>
          </div>
        )}

        {/* Tab de Cálculo & Margem */}
        {tab === 'calculo' && (
          <div className="px-6 py-5 overflow-y-auto flex-1 space-y-4">
            <p className="text-xs text-muted-foreground">
              Simule a margem e o lucro real antes de salvar. Os valores de impostos e frete são calculados instantaneamente.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Custo (R$)', name: 'precoCusto' },
                { label: 'Frete (R$)', name: 'freteCusto' },
                { label: 'Markup (%)', name: 'markup' },
                { label: 'ICMS (%)', name: 'icms' },
                { label: 'IPI (%)', name: 'ipi' },
                { label: 'PIS (%)', name: 'pis' },
                { label: 'COFINS (%)', name: 'cofins' },
              ].map(({ label, name }) => (
                <div key={name}>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{label}</label>
                  <input name={name} value={(form as any)[name]} onChange={handleChange} className={inputClass} />
                </div>
              ))}
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Preço de Venda Negociado (R$)</label>
                <input
                  value={simPrecoVenda}
                  onChange={e => setSimPrecoVenda(e.target.value)}
                  placeholder={calc.precoSugerido.toFixed(2)}
                  className={inputClass}
                />
                <p className="text-[11px] text-muted-foreground mt-1">Sugerido pela fórmula: {fmt(calc.precoSugerido)}</p>
              </div>
            </div>
            <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Custo total</span><span className="font-semibold">{fmt(calc.custo)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Impostos ({calc.totalImpostosPct.toFixed(2)}%)</span><span className="font-semibold">{fmt(calc.impostosValor)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Preço negociado</span><span className="font-semibold">{fmt(calc.precoNegociado)}</span></div>
              <div className="h-px bg-border my-1" />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Lucro bruto</span>
                <span className={cn('font-semibold', calc.lucroBruto >= 0 ? 'text-emerald-600' : 'text-destructive')}>{fmt(calc.lucroBruto)} ({calc.margemBruta.toFixed(2)}%)</span>
              </div>
              <div className="flex justify-between items-center pt-1">
                <span className="font-semibold flex items-center gap-1.5">
                  {calc.lucroLiquido >= 0 ? <TrendingUp size={16} className="text-emerald-600" /> : <TrendingDown size={16} className="text-destructive" />}
                  Lucro líquido
                </span>
                <span className={cn('font-bold text-lg', calc.lucroLiquido >= 0 ? 'text-emerald-600' : 'text-destructive')}>
                  {fmt(calc.lucroLiquido)}
                </span>
              </div>
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={handleCopyResumo}
                className="w-full rounded-lg border px-4 py-2 text-xs font-semibold hover:bg-muted transition-colors flex items-center justify-center gap-2"
              >
                <Copy size={13} /> Copiar resumo
              </button>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex gap-3 px-6 py-3.5 border-t bg-muted/10">
          <button
            type="button"
            onClick={onMinimize || onClose}
            className="flex-1 rounded-xl border px-4 py-2 text-xs font-semibold hover:bg-muted transition-colors text-muted-foreground"
          >
            {onMinimize ? 'Minimizar' : 'Cancelar'}
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || uploadingImage}
            className="flex-1 rounded-xl px-4 py-2 text-xs font-bold text-white transition-all hover:opacity-95 active:scale-98 disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: 'hsl(var(--primary))' }}
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : produto ? 'Salvar Alterações' : 'Cadastrar Peça'}
          </button>
        </div>
      </div>
    </div>
  );
}
