import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Upload, FileText, CheckCircle, AlertTriangle, XCircle, Loader2,
  Package, PlusCircle, ArrowUpCircle, Key, DownloadCloud, Search,
  RefreshCw, Copy, CheckCircle2, ShieldCheck, Landmark, Plus, Wrench,
  History, Trash2, Eye, Download, Building2, Calendar, DollarSign,
  Layers, AlertOctagon, ExternalLink, X
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import ProdutoModal, { ProdutoModalData } from '@/components/ProdutoModal';
import {
  decodificarChaveAcesso,
  formatarChave44,
  formatarCnpj,
  baixarXmlSefazPorChave,
  listarNotasEmitidasContraCnpj,
  NotaRecebidaDFe
} from '@/services/sefazDownloadService';

interface NFeData {
  chaveAcesso: string;
  numero: string;
  serie: string;
  emitenteCnpj: string;
  emitenteNome: string;
  destinatarioCnpj: string;
  dataEmissao: string;
  valorTotal: number;
  tipo: 'entrada' | 'saida';
  itens: NFeItem[];
}

interface NFeItem {
  cProd: string;
  xProd: string;
  ncm: string;
  qCom: number;
  vUnCom: number;
  cEan?: string;
  pICMS: number;
  pIPI: number;
  pPIS: number;
  pCOFINS: number;
}

interface ItemAcao {
  acao: 'criar' | 'atualizar' | 'ignorar';
  produtoId?: string;
  produtoNome?: string;
  aplicacao?: string;
  estoqueAtual?: number;
  estoqueNovo?: number;
  jaCadastradoNesteLote?: boolean;
}

type ImportStatus = 'idle' | 'parsing' | 'preview' | 'importing' | 'done' | 'error' | 'duplicate';
type MetodoEntrada = 'chave' | 'dfe_cnpj' | 'upload';

function parseNFeXML(xmlText: string): NFeData {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');

  const get = (tag: string, ctx: Element | Document = doc) =>
    ctx.getElementsByTagNameNS('*', tag)[0]?.textContent?.trim() ?? '';

  const infNFe = doc.getElementsByTagNameNS('*', 'infNFe')[0];
  if (!infNFe) throw new Error('XML inválido: tag infNFe não encontrada');

  const chaveAcesso = infNFe.getAttribute('Id')?.replace('NFe', '') ?? '';
  const numero = get('nNF');
  const serie = get('serie');

  const emit = doc.getElementsByTagNameNS('*', 'emit')[0];
  const dest = doc.getElementsByTagNameNS('*', 'dest')[0];
  const ide = doc.getElementsByTagNameNS('*', 'ide')[0];

  const emitenteCnpj = get('CNPJ', emit) || get('CPF', emit);
  const emitenteNome = get('xNome', emit) || get('xFant', emit);
  const destinatarioCnpj = get('CNPJ', dest) || get('CPF', dest);
  const dataEmissao = (get('dhEmi', ide) || get('dEmi', ide)).split('T')[0];
  const valorTotal = parseFloat(get('vNF') || '0');

  // Na tela de Importação de NF-e de fornecedor, toda nota importada é Entrada de Mercadoria no estoque
  // (no XML do fornecedor tpNF vem como '1' porque para o fornecedor foi saída, mas para nós é entrada)
  const tipo: 'entrada' | 'saida' = 'entrada';

  const detElements = doc.getElementsByTagNameNS('*', 'det');
  const itens: NFeItem[] = Array.from(detElements).map(det => {
    const prod = det.getElementsByTagNameNS('*', 'prod')[0];
    const imposto = det.getElementsByTagNameNS('*', 'imposto')[0];

    const getTax = (parentTag: string, pTag: string): number => {
      if (!imposto) return 0;
      const parent = imposto.getElementsByTagNameNS('*', parentTag)[0];
      if (!parent) return 0;
      const el = parent.getElementsByTagNameNS('*', pTag)[0];
      return parseFloat(el?.textContent?.trim() || '0');
    };

    return {
      cProd: get('cProd', prod),
      xProd: get('xProd', prod),
      ncm: get('NCM', prod),
      qCom: parseFloat(get('qCom', prod) || '0'),
      vUnCom: parseFloat(get('vUnCom', prod) || '0'),
      cEan: get('cEAN', prod) || undefined,
      pICMS: getTax('ICMS', 'pICMS'),
      pIPI: getTax('IPI', 'pIPI'),
      pPIS: getTax('PIS', 'pPIS'),
      pCOFINS: getTax('COFINS', 'pCOFINS'),
    };
  });

  return { chaveAcesso, numero, serie, emitenteCnpj, emitenteNome, destinatarioCnpj, dataEmissao, valorTotal, tipo, itens };
}

export default function ImportarNFe({ defaultTab = 'entrada' }: { defaultTab?: 'entrada' | 'historico' }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [tabPrincipal, setTabPrincipal] = useState<'entrada' | 'historico'>(defaultTab);
  const [metodo, setMetodo] = useState<MetodoEntrada>('chave');
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [nfeData, setNfeData] = useState<NFeData | null>(null);
  const [xmlText, setXmlText] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [acoes, setAcoes] = useState<ItemAcao[]>([]);
  const [analisando, setAnalisando] = useState(false);
  const [baixandoSefaz, setBaixandoSefaz] = useState(false);
  const [chaveInput, setChaveInput] = useState('');
  const [listaDFe, setListaDFe] = useState<NotaRecebidaDFe[]>([]);
  const [carregandoDFe, setCarregandoDFe] = useState(false);
  const [itemParaCadastrar, setItemParaCadastrar] = useState<{ item: NFeItem; index: number } | null>(null);
  const [isModalMinimizado, setIsModalMinimizado] = useState(false);
  const [savingModal, setSavingModal] = useState(false);

  // Estados do Histórico de Notas e Grade de Custos
  const [filtroHistorico, setFiltroHistorico] = useState('');
  const [notaSelecionadaGrade, setNotaSelecionadaGrade] = useState<any | null>(null);
  const [deletandoNotaId, setDeletandoNotaId] = useState<string | null>(null);
  const [showConfirmLimparTudo, setShowConfirmLimparTudo] = useState(false);
  const [limpandoTudo, setLimpandoTudo] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const MAX_FILE_SIZE_MB = 5;
  const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

  // Consulta histórico de notas fiscais importadas
  const { data: historicoNotas = [], isLoading: loadingHistorico, refetch: refetchHistorico } = useQuery({
    queryKey: ['nfe_importadas'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('nfe_importadas')
        .select('*')
        .order('data_emissao', { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Atualiza tab principal caso prop mude
  useEffect(() => {
    if (defaultTab) setTabPrincipal(defaultTab);
  }, [defaultTab]);

  // Carrega configurações fiscais da empresa
  const { data: config } = useQuery({
    queryKey: ['configuracoes'],
    queryFn: async () => {
      const { data } = await supabase.from('configuracoes').select('chave, valor');
      const map: Record<string, string> = {};
      (data ?? []).forEach((r: any) => { map[r.chave] = r.valor; });
      return map;
    },
  });

  const cnpjEmpresa = config?.['empresa_cnpj'] || '';
  const tokenFocus = config?.['nfe_focus_token'] || '';
  const ambienteSefaz = (config?.['nfe_ambiente'] || 'homologacao') as 'homologacao' | 'producao';

  // Decodificação em tempo real da chave digitada
  const chaveInfo = useMemo(() => {
    return decodificarChaveAcesso(chaveInput);
  }, [chaveInput]);

  // Carrega lista de notas emitidas contra o CNPJ ao entrar na aba dfe_cnpj
  const carregarNotasDFe = async () => {
    setCarregandoDFe(true);
    try {
      const notas = await listarNotasEmitidasContraCnpj({
        cnpjDestinatario: cnpjEmpresa,
        tokenFocus,
        ambiente: ambienteSefaz,
      });
      setListaDFe(notas);
    } catch (e: any) {
      toast({ title: 'Aviso ao consultar notas contra o CNPJ', description: e.message });
    } finally {
      setCarregandoDFe(false);
    }
  };

  useEffect(() => {
    if (metodo === 'dfe_cnpj') {
      carregarNotasDFe();
    }
  }, [metodo, cnpjEmpresa]);

  // Baixar XML direto da SEFAZ pela Chave de Acesso
  const handleBaixarPorChave = async (chaveAlvo?: string) => {
    const chaveParaBuscar = (chaveAlvo || chaveInput).replace(/\D/g, '');
    if (chaveParaBuscar.length !== 44) {
      toast({ title: 'Chave incompleta', description: 'A Chave de Acesso deve conter 44 dígitos.', variant: 'destructive' });
      return;
    }

    setBaixandoSefaz(true);
    setStatus('parsing');

    try {
      const { xmlText: xmlRetornado, origem } = await baixarXmlSefazPorChave({
        chaveAcesso: chaveParaBuscar,
        cnpjDestinatario: cnpjEmpresa,
        tokenFocus,
        ambiente: ambienteSefaz,
      });

      setXmlText(xmlRetornado);
      const data = parseNFeXML(xmlRetornado);
      setNfeData(data);
      setStatus('preview');

      toast({
        title: 'NF-e Baixada com Sucesso!',
        description: `Nota Nº ${data.numero} emitida por ${data.emitenteNome} carregada para conferência.`,
      });
    } catch (err: any) {
      toast({ title: 'Erro ao baixar nota da SEFAZ', description: err.message, variant: 'destructive' });
      setStatus('error');
    } finally {
      setBaixandoSefaz(false);
    }
  };

  const handleFile = async (file: File) => {
    if (!file.name.endsWith('.xml')) {
      toast({ title: 'Arquivo inválido', description: 'Selecione um arquivo .xml de NF-e', variant: 'destructive' });
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast({ title: 'Arquivo muito grande', description: `O arquivo deve ter no máximo ${MAX_FILE_SIZE_MB}MB.`, variant: 'destructive' });
      return;
    }
    setStatus('parsing');
    try {
      const text = await file.text();
      const detCount = (text.match(/<det[\s>]/g) || []).length;
      if (detCount > 1000) {
        throw new Error('Arquivo contém muitos itens (máximo: 1000). Verifique se é uma NF-e válida.');
      }
      if (/<!DOCTYPE/i.test(text)) {
        throw new Error('Arquivo XML contém declaração DOCTYPE não permitida.');
      }

      setXmlText(text);
      const data = parseNFeXML(text);
      setNfeData(data);
      setStatus('preview');
    } catch (err: any) {
      toast({ title: 'Erro ao processar XML', description: err.message, variant: 'destructive' });
      setStatus('error');
    }
  };

  // Busca produto existente no catálogo com segurança (por código, código de fábrica ou nome)
  const buscarProdutoExistente = async (cod?: string, nome?: string) => {
    const codLimpo = (cod || '').trim();
    if (codLimpo) {
      const { data: byCod } = await (supabase as any)
        .from('produtos')
        .select('id, codigo, codigo_fabrica, nome, aplicacao, estoque_total')
        .eq('codigo', codLimpo)
        .limit(1);
      if (byCod && byCod.length > 0) return byCod[0];

      const { data: byFab } = await (supabase as any)
        .from('produtos')
        .select('id, codigo, codigo_fabrica, nome, aplicacao, estoque_total')
        .eq('codigo_fabrica', codLimpo)
        .limit(1);
      if (byFab && byFab.length > 0) return byFab[0];
    }

    const nomeLimpo = (nome || '').trim();
    if (nomeLimpo) {
      const { data: byNome } = await (supabase as any)
        .from('produtos')
        .select('id, codigo, codigo_fabrica, nome, aplicacao, estoque_total')
        .ilike('nome', nomeLimpo)
        .limit(1);
      if (byNome && byNome.length > 0) return byNome[0];
    }

    return null;
  };

  // Analisa cada item: existe no catálogo? criar na entrada ou somar ao estoque?
  useEffect(() => {
    if (status !== 'preview' || !nfeData) return;
    let cancelled = false;
    (async () => {
      setAnalisando(true);
      const result: ItemAcao[] = [];
      for (let i = 0; i < nfeData.itens.length; i++) {
        const item = nfeData.itens[i];
        // Preserva caso já tenha sido cadastrado/somado manualmente durante este preview
        if (acoes[i]?.jaCadastradoNesteLote) {
          result.push(acoes[i]);
          continue;
        }

        const qtdItem = Math.max(1, Math.round(Number(item.qCom || 1)));
        const prod = await buscarProdutoExistente(item.cProd, item.xProd);

        if (prod) {
          const estoqueAtual = Number(prod.estoque_total ?? 0);
          const estoqueNovo = estoqueAtual + qtdItem;
          result.push({
            acao: 'atualizar',
            produtoId: prod.id,
            produtoNome: prod.nome,
            aplicacao: prod.aplicacao,
            estoqueAtual,
            estoqueNovo,
            jaCadastradoNesteLote: false,
          });
        } else {
          result.push({
            acao: 'criar',
            estoqueAtual: 0,
            estoqueNovo: qtdItem,
            jaCadastradoNesteLote: false,
          });
        }
      }
      if (!cancelled) {
        setAcoes(result);
        setAnalisando(false);
      }
    })();
    return () => { cancelled = true; };
  }, [status, nfeData?.chaveAcesso]);

  const handleSalvarProdutoModal = async (data: Record<string, any>) => {
    if (!itemParaCadastrar || !nfeData) return;
    setSavingModal(true);
    try {
      const item = itemParaCadastrar.item;
      const index = itemParaCadastrar.index;
      const loteModal = data._lote;
      delete data._lote;
      delete data.preco_custo;
      delete data.frete_custo;

      const qtdEntrada = Math.max(
        1,
        Math.round(Number(loteModal?.quantidade) > 0 ? Number(loteModal.quantidade) : Number(item.qCom || 1))
      );
      const custoUnit = Number(loteModal?.preco_custo) > 0 ? Number(loteModal.preco_custo) : Number(item.vUnCom || 0);
      const fornNome = (
        loteModal?.fornecedor ||
        data.marca ||
        (nfeData.emitenteNome && !nfeData.emitenteNome.includes('DISTRIBUIDORA / FORNECEDOR') ? nfeData.emitenteNome : '') ||
        '—'
      ).trim();

      const codItem = (data.codigo_fabrica || data.codigo || item.cProd || `PRD-${Date.now().toString().slice(-6)}`).trim();

      // Colunas permitidas na tabela produtos (remove frete_custo/preco_custo que pertencem a lotes)
      const COLUNAS_PRODUTOS = [
        'codigo', 'codigo_fabrica', 'codigo_interno', 'nome', 'marca', 'aplicacao',
        'ncm', 'preco_venda', 'markup_percentual', 'estoque_minimo', 'estoque_total',
        'categoria', 'tipo_veiculo', 'icms_percentual', 'ipi_percentual',
        'pis_percentual', 'cofins_percentual', 'localizacao', 'imagem_url', 'imagens'
      ];

      // Verifica se o produto já existe no catálogo para SOMAR ao estoque em vez de falhar por código duplicado
      const prodExistente = await buscarProdutoExistente(codItem, data.nome);
      const estoquePrevio = prodExistente ? Number(prodExistente.estoque_total || 0) : 0;
      const novoEstoque = estoquePrevio + qtdEntrada;

      const rawPayload: Record<string, any> = {
        codigo: prodExistente?.codigo || codItem,
        codigo_fabrica: (data.codigo_fabrica || codItem).trim(),
        codigo_interno: (data.codigo_interno || '').trim(),
        ...data,
        marca: (data.marca || fornNome || 'Geral').trim(),
        aplicacao: (data.aplicacao || 'A definir / Consultar catálogo').trim(),
        categoria: data.categoria || 'Geral',
        tipo_veiculo: data.tipo_veiculo || 'Carro',
        estoque_total: novoEstoque,
        estoque_minimo: Number(data.estoque_minimo || 1),
        markup_percentual: Number(data.markup_percentual || 50),
        localizacao: data.localizacao || 'Corredor A-Prateleira 01-G-01',
      };

      const payload: Record<string, any> = {};
      for (const col of COLUNAS_PRODUTOS) {
        if (rawPayload[col] !== undefined) {
          payload[col] = rawPayload[col];
        }
      }

      let savedProd: any = null;
      if (prodExistente) {
        const { data: updated, error: updErr } = await (supabase as any)
          .from('produtos')
          .update(payload)
          .eq('id', prodExistente.id)
          .select('id, codigo, nome, aplicacao, estoque_total')
          .single();
        if (updErr) throw updErr;
        savedProd = updated;
      } else {
        const { data: inserted, error: prodErr } = await (supabase as any)
          .from('produtos')
          .insert(payload)
          .select('id, codigo, nome, aplicacao, estoque_total')
          .single();
        if (prodErr) throw prodErr;
        savedProd = inserted;
      }

      // Registra o lote de entrada fiscal com preço de custo e chave da NF-e
      await (supabase as any).from('lotes').insert({
        produto_id: savedProd.id,
        fornecedor: fornNome,
        preco_custo: custoUnit,
        quantidade: qtdEntrada,
        data_entrada: (nfeData.dataEmissao || new Date().toISOString()).split('T')[0],
        nfe_chave: nfeData.chaveAcesso || null,
      });

      // Atualiza o item na nota fiscal em memória para refletir nome, código, custo, quantidade e fornecedor reais
      setNfeData(prev => {
        if (!prev) return prev;
        const novosItens = [...prev.itens];
        const itemAtualizado: NFeItem = {
          ...item,
          cProd: savedProd.codigo || codItem,
          xProd: savedProd.nome || data.nome,
          ncm: data.ncm || item.ncm || '',
          qCom: qtdEntrada,
          vUnCom: custoUnit,
          pICMS: Number(data.icms_percentual ?? item.pICMS ?? 0),
          pIPI: Number(data.ipi_percentual ?? item.pIPI ?? 0),
          pPIS: Number(data.pis_percentual ?? item.pPIS ?? 0),
          pCOFINS: Number(data.cofins_percentual ?? item.pCOFINS ?? 0),
        };
        if (index < novosItens.length) {
          novosItens[index] = itemAtualizado;
        } else {
          novosItens.push(itemAtualizado);
        }
        const novoTotal = novosItens.reduce((acc, it) => acc + (Number(it.qCom || 0) * Number(it.vUnCom || 0)), 0);
        const novoEmitente =
          prev.emitenteNome.includes('DISTRIBUIDORA / FORNECEDOR') && fornNome && fornNome !== '—'
            ? fornNome
            : prev.emitenteNome;
        return {
          ...prev,
          emitenteNome: novoEmitente,
          valorTotal: novoTotal > 0 ? novoTotal : prev.valorTotal,
          itens: novosItens,
        };
      });

      // Atualiza o status da linha na tabela para confirmar o cadastro e soma no estoque
      setAcoes(prev => {
        const copy = [...prev];
        copy[index] = {
          acao: 'atualizar',
          produtoId: savedProd.id,
          produtoNome: savedProd.nome,
          aplicacao: savedProd.aplicacao,
          estoqueAtual: estoquePrevio,
          estoqueNovo: novoEstoque,
          jaCadastradoNesteLote: true,
        };
        return copy;
      });

      // Invalida cache de produtos no React Query para aparecer imediatamente em /produtos
      queryClient.invalidateQueries({ queryKey: ['produtos'] });
      queryClient.invalidateQueries({ queryKey: ['produtos-search'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-produtos'] });
      queryClient.invalidateQueries({ queryKey: ['lotes'] });

      toast({
        title: prodExistente ? 'Estoque somado ao produto!' : 'Produto criado na entrada da NF-e!',
        description: `${savedProd.nome}: +${qtdEntrada} un somada(s) ao estoque (Total: ${novoEstoque} un).`,
      });

      setItemParaCadastrar(null);
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar produto da NF-e',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setSavingModal(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleImport = async (forcarReprocessamento = false) => {
    if (!nfeData) return;
    setStatus('importing');

    try {
      // 1. Verificar se a chave já existe em nfe_importadas
      const { data: existingList } = await (supabase as any)
        .from('nfe_importadas')
        .select('id, status')
        .eq('chave_acesso', nfeData.chaveAcesso)
        .limit(1);
      const existing = existingList?.[0];

      if (existing && !forcarReprocessamento) {
        // Verifica se a importação anterior realmente gerou lotes ou se algum item foi cadastrado agora
        const { data: lotesExistentes } = await (supabase as any)
          .from('lotes')
          .select('id')
          .eq('nfe_chave', nfeData.chaveAcesso)
          .limit(1);

        const jaCadastrouNoPreview = acoes.some(a => a?.jaCadastradoNesteLote);
        if (lotesExistentes && lotesExistentes.length > 0 && !jaCadastrouNoPreview) {
          setStatus('duplicate');
          return;
        }
      }

      // 2. Processar todos os itens da nota — criar itens novos automaticamente e somar ao estoque
      let processados = 0;
      const markupConfig = Number(config?.markup_padrao || 50) || 50;

      for (let idx = 0; idx < nfeData.itens.length; idx++) {
        const item = nfeData.itens[idx];
        const acao = acoes[idx];
        const qtdItem = Math.max(1, Math.round(Number(item.qCom || 1)));
        if (acao?.acao === 'ignorar') continue;

        // Se o produto já foi criado/somado via modal durante este preview, já está no estoque!
        if (acao?.jaCadastradoNesteLote) {
          processados++;
          continue;
        }

        let produtoId: string;
        const codItem = (item.cProd || `PRD-${Date.now().toString().slice(-6)}-${idx + 1}`).trim();

        // Verifica se já existe no catálogo (pelo produtoId identificado ou por código/nome)
        let prodExistente: any = null;
        if (acao?.produtoId) {
          const { data: byId } = await (supabase as any)
            .from('produtos')
            .select('id, estoque_total')
            .eq('id', acao.produtoId)
            .limit(1);
          prodExistente = byId?.[0] || null;
        }
        if (!prodExistente) {
          prodExistente = await buscarProdutoExistente(codItem, item.xProd);
        }

        if (prodExistente) {
          produtoId = prodExistente.id;
          const estoquePrevio = Number(prodExistente.estoque_total || 0);
          const novoEstoque = estoquePrevio + qtdItem;
          const { error: updErr } = await (supabase as any)
            .from('produtos')
            .update({
              estoque_total: novoEstoque,
              icms_percentual: item.pICMS || 0,
              ipi_percentual: item.pIPI || 0,
              pis_percentual: item.pPIS || 0,
              cofins_percentual: item.pCOFINS || 0,
              updated_at: new Date().toISOString(),
            })
            .eq('id', produtoId);
          if (updErr) throw updErr;
        } else {
          // Cria automaticamente o item na entrada da NF-e e já soma a quantidade ao estoque!
          const custoBase = Number(item.vUnCom || 0);
          const totalImpostos = (item.pICMS || 0) + (item.pIPI || 0) + (item.pPIS || 0) + (item.pCOFINS || 0);
          const precoVendaSugerido = custoBase > 0
            ? Math.round(custoBase * (1 + totalImpostos / 100) * (1 + markupConfig / 100) * 100) / 100
            : 0;

          const { data: novoProd, error: insertErr } = await (supabase as any)
            .from('produtos')
            .insert({
              codigo: codItem,
              codigo_fabrica: codItem,
              codigo_interno: '',
              nome: (item.xProd || `Peça NF ${nfeData.numero}`).trim(),
              ncm: item.ncm || '',
              marca: (nfeData.emitenteNome && !nfeData.emitenteNome.includes('DISTRIBUIDORA / FORNECEDOR') ? nfeData.emitenteNome : 'Geral').trim(),
              aplicacao: 'A definir / Consultar compatibilidade',
              categoria: 'Geral',
              tipo_veiculo: 'Carro',
              estoque_total: qtdItem,
              estoque_minimo: 1,
              preco_venda: precoVendaSugerido,
              markup_percentual: markupConfig,
              localizacao: 'Corredor A-Prateleira 01-G-01',
              icms_percentual: item.pICMS || 0,
              ipi_percentual: item.pIPI || 0,
              pis_percentual: item.pPIS || 0,
              cofins_percentual: item.pCOFINS || 0,
            })
            .select('id')
            .single();

          if (insertErr) throw insertErr;
          produtoId = (novoProd as any).id;
        }

        // Registra o lote de entrada fiscal
        await (supabase as any).from('lotes').insert({
          produto_id: produtoId,
          fornecedor: nfeData.emitenteNome || '—',
          preco_custo: Number(item.vUnCom || 0),
          quantidade: qtdItem,
          data_entrada: (nfeData.dataEmissao || new Date().toISOString()).split('T')[0],
          nfe_chave: nfeData.chaveAcesso,
        });

        processados++;
      }

      // 3. Registrar ou atualizar NF-e importada
      const { data: { user } } = await supabase.auth.getUser();
      const nfePayload = {
        chave_acesso: nfeData.chaveAcesso,
        numero: nfeData.numero,
        serie: nfeData.serie,
        emitente_cnpj: nfeData.emitenteCnpj,
        emitente_nome: nfeData.emitenteNome,
        destinatario_cnpj: nfeData.destinatarioCnpj || null,
        data_emissao: (nfeData.dataEmissao || new Date().toISOString()).split('T')[0],
        valor_total: nfeData.valorTotal,
        tipo: 'entrada',
        status: 'processada',
        xml_raw: xmlText,
        imported_by: user?.id,
      };

      if (existing) {
        await (supabase as any).from('nfe_importadas').update(nfePayload).eq('id', existing.id);
      } else {
        await (supabase as any).from('nfe_importadas').insert(nfePayload);
      }

      // Invalida cache de produtos no React Query para aparecer imediatamente em /produtos e no balcão!
      queryClient.invalidateQueries({ queryKey: ['produtos'] });
      queryClient.invalidateQueries({ queryKey: ['produtos-search'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-produtos'] });
      queryClient.invalidateQueries({ queryKey: ['lotes'] });
      queryClient.invalidateQueries({ queryKey: ['nfe_importadas'] });

      setImportedCount(processados);
      setStatus('done');
      toast({
        title: 'Entrada no estoque concluída!',
        description: `${processados} item(ns) criado(s)/somado(s) ao estoque com sucesso.`,
      });
    } catch (err: any) {
      toast({ title: 'Erro ao importar', description: err.message, variant: 'destructive' });
      setStatus('error');
    }
  };

  const reset = () => {
    setStatus('idle');
    setNfeData(null);
    setXmlText('');
    setAcoes([]);
    setChaveInput('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const colarChave = async () => {
    try {
      const texto = await navigator.clipboard.readText();
      const apenasDigitos = texto.replace(/\D/g, '').slice(0, 44);
      setChaveInput(apenasDigitos);
      if (apenasDigitos.length === 44) {
        toast({ title: 'Chave colada!', description: '44 dígitos identificados com sucesso.' });
      }
    } catch {
      toast({ title: 'Permissão necessária', description: 'Cole manualmente com Ctrl+V.', variant: 'destructive' });
    }
  };

  // Itens da nota selecionada para exibição na Grade de Custos
  const itensGradeNota = useMemo<NFeItem[]>(() => {
    if (!notaSelecionadaGrade || !notaSelecionadaGrade.xml_raw) return [];
    try {
      const parsed = parseNFeXML(notaSelecionadaGrade.xml_raw);
      return parsed.itens || [];
    } catch (e) {
      console.error('Erro ao fazer parse do XML da nota:', e);
      return [];
    }
  }, [notaSelecionadaGrade]);

  const handleDownloadXml = (nota: any) => {
    if (!nota?.xml_raw) {
      toast({ title: 'XML não disponível', description: 'Esta nota não possui o XML bruto armazenado.', variant: 'destructive' });
      return;
    }
    const blob = new Blob([nota.xml_raw], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NFe-${nota.numero || 'nota'}-${(nota.chave_acesso || '').slice(-8)}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: 'Download iniciado', description: 'Arquivo XML baixado com sucesso.' });
  };

  const handleExcluirNota = async (nota: any) => {
    if (!confirm(`Deseja realmente excluir a NF-e nº ${nota.numero} do fornecedor ${nota.emitente_nome || '—'}? Os lotes de estoque vinculados a esta nota também serão removidos.`)) {
      return;
    }
    setDeletandoNotaId(nota.id);
    try {
      if (nota.chave_acesso) {
        await (supabase as any).from('lotes').delete().eq('nfe_chave', nota.chave_acesso);
      }
      const { error } = await (supabase as any).from('nfe_importadas').delete().eq('id', nota.id);
      if (error) throw error;

      toast({
        title: 'Nota fiscal excluída!',
        description: `NF-e nº ${nota.numero} e seus lotes foram removidos com sucesso.`,
      });
      refetchHistorico();
      if (notaSelecionadaGrade?.id === nota.id) {
        setNotaSelecionadaGrade(null);
      }
    } catch (err: any) {
      toast({ title: 'Erro ao excluir nota', description: err.message, variant: 'destructive' });
    } finally {
      setDeletandoNotaId(null);
    }
  };

  const handleLimparTodoHistorico = async () => {
    setLimpandoTudo(true);
    try {
      // 1. Remove todos os lotes que possuem chave de nota
      await (supabase as any).from('lotes').delete().not('nfe_chave', 'is', null);

      // 2. Remove todas as notas de nfe_importadas
      const { error } = await (supabase as any)
        .from('nfe_importadas')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) throw error;

      toast({
        title: 'Histórico de notas limpo com sucesso!',
        description: 'Todas as notas importadas e seus lotes foram apagados. Você já pode importar novamente.',
      });
      setShowConfirmLimparTudo(false);
      refetchHistorico();
    } catch (err: any) {
      toast({ title: 'Erro ao limpar histórico', description: err.message, variant: 'destructive' });
    } finally {
      setLimpandoTudo(false);
    }
  };

  const notasFiltradas = useMemo(() => {
    if (!filtroHistorico.trim()) return historicoNotas;
    const q = filtroHistorico.toLowerCase();
    return historicoNotas.filter((n: any) =>
      (n.numero || '').toLowerCase().includes(q) ||
      (n.chave_acesso || '').toLowerCase().includes(q) ||
      (n.emitente_nome || '').toLowerCase().includes(q) ||
      (n.emitente_cnpj || '').toLowerCase().includes(q)
    );
  }, [historicoNotas, filtroHistorico]);

  const totalNotas = historicoNotas.length;
  const totalValorCompras = historicoNotas.reduce((acc: number, n: any) => acc + Number(n.valor_total || 0), 0);

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Notas Fiscais de Entrada & SEFAZ</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Entrada de mercadorias no estoque, baixa direta da SEFAZ, histórico de notas e grade de custo por nota.
          </p>
        </div>

        {cnpjEmpresa && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Meu CNPJ:</span>
            <span className="font-mono">{formatarCnpj(cnpjEmpresa)}</span>
          </div>
        )}
      </div>

      {/* Abas Superiores de Navegação */}
      <div className="flex border-b border-border gap-2">
        <button
          type="button"
          onClick={() => setTabPrincipal('entrada')}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors",
            tabPrincipal === 'entrada'
              ? "border-primary text-primary bg-primary/5 rounded-t-lg"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Upload size={16} />
          Nova Entrada de NF-e
        </button>

        <button
          type="button"
          onClick={() => {
            setTabPrincipal('historico');
            refetchHistorico();
          }}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors",
            tabPrincipal === 'historico'
              ? "border-primary text-primary bg-primary/5 rounded-t-lg"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <History size={16} />
          Histórico de Notas & Grade de Custos
          {historicoNotas.length > 0 && (
            <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-primary/20 text-primary font-bold">
              {historicoNotas.length}
            </span>
          )}
        </button>
      </div>

      {/* ABA 1: Entrada de NF-e */}
      {tabPrincipal === 'entrada' && (
        <div className="space-y-6">
          {/* Seletores de Método de Entrada (apenas quando não estiver em preview/done) */}
      {(status === 'idle' || status === 'parsing' || status === 'error' || status === 'duplicate') && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setMetodo('chave')}
              className={cn(
                "p-4 rounded-xl border text-left transition-all",
                metodo === 'chave'
                  ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                  : "border-border bg-card hover:bg-muted/50"
              )}
            >
              <div className="flex items-center gap-2 font-bold text-sm text-foreground">
                <Key size={18} className="text-primary" />
                Baixar por Chave de Acesso
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Cole a chave de 44 dígitos da nota para baixar diretamente da SEFAZ.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setMetodo('dfe_cnpj')}
              className={cn(
                "p-4 rounded-xl border text-left transition-all",
                metodo === 'dfe_cnpj'
                  ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                  : "border-border bg-card hover:bg-muted/50"
              )}
            >
              <div className="flex items-center gap-2 font-bold text-sm text-foreground">
                <DownloadCloud size={18} className="text-primary" />
                Notas Emitidas Contra CNPJ
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Consulte a lista de DF-e recebidos de fornecedores na Receita.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setMetodo('upload')}
              className={cn(
                "p-4 rounded-xl border text-left transition-all",
                metodo === 'upload'
                  ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                  : "border-border bg-card hover:bg-muted/50"
              )}
            >
              <div className="flex items-center gap-2 font-bold text-sm text-foreground">
                <Upload size={18} className="text-primary" />
                Upload de Arquivo XML
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Arraste o arquivo .xml da NF-e salvo em seu computador.
              </p>
            </button>
          </div>

          {/* MÉTODO 1: Baixar por Chave de Acesso de 44 dígitos */}
          {metodo === 'chave' && (
            <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Key size={18} className="text-primary" />
                  <h2 className="font-semibold text-sm">Chave de Acesso da Nota Fiscal (44 dígitos)</h2>
                </div>
                <button
                  type="button"
                  onClick={colarChave}
                  className="text-xs text-primary font-semibold hover:underline flex items-center gap-1"
                >
                  <Copy size={13} /> Colar da Área de Transferência
                </button>
              </div>

              <div>
                <input
                  type="text"
                  value={chaveInput}
                  onChange={e => setChaveInput(e.target.value.replace(/\D/g, '').slice(0, 44))}
                  placeholder="0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000"
                  maxLength={44}
                  className="w-full rounded-lg border bg-background px-4 py-3 text-sm font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-primary/40"
                  autoFocus
                />
                <div className="flex items-center justify-between mt-1.5 text-xs">
                  <span className={cn(
                    "font-mono font-medium",
                    chaveInput.length === 44 ? "text-emerald-600" : "text-muted-foreground"
                  )}>
                    {chaveInput.length} / 44 dígitos
                  </span>
                  {chaveInput.length === 44 && (
                    <span className={cn(
                      "font-semibold flex items-center gap-1",
                      chaveInfo.valida ? "text-emerald-600" : "text-destructive"
                    )}>
                      {chaveInfo.valida ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                      {chaveInfo.valida ? 'Chave Válida (Dígit. Verificador SEFAZ OK)' : 'Dígito Verificador Inválido'}
                    </span>
                  )}
                </div>
              </div>

              {/* Detalhes Decodificados em tempo real */}
              {chaveInput.length >= 22 && (
                <div className="rounded-lg border bg-muted/20 p-3.5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase">UF Emitente</span>
                    <span className="font-semibold text-foreground">{chaveInfo.ufSigla} (cMun {chaveInfo.cUF})</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase">Emissão</span>
                    <span className="font-semibold text-foreground">{chaveInfo.anoMes}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase">CNPJ Fornecedor</span>
                    <span className="font-semibold text-foreground font-mono truncate block">{chaveInfo.cnpjEmitente}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase">Modelo / Série / Nº</span>
                    <span className="font-semibold text-foreground">Mod {chaveInfo.modelo} · S.{chaveInfo.serie} · Nº {chaveInfo.numero || '—'}</span>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => handleBaixarPorChave()}
                disabled={chaveInput.length !== 44 || baixandoSefaz}
                className="w-full btn-primary py-3 flex items-center justify-center gap-2 rounded-lg font-semibold text-sm shadow-sm transition-all disabled:opacity-50"
              >
                {baixandoSefaz ? <Loader2 size={16} className="animate-spin" /> : <DownloadCloud size={16} />}
                {baixandoSefaz ? 'Consultando e Baixando XML da SEFAZ…' : 'Baixar Nota Fiscal Direto da SEFAZ'}
              </button>
            </div>
          )}

          {/* MÉTODO 2: Notas Emitidas Contra o CNPJ (DFe) */}
          {metodo === 'dfe_cnpj' && (
            <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4 animate-fade-in">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <DownloadCloud size={18} className="text-primary" />
                  <div>
                    <h2 className="font-semibold text-sm">DF-e: Notas Emitidas por Fornecedores Contra o CNPJ</h2>
                    <p className="text-xs text-muted-foreground">Distribuição automática de documentos fiscais eletrônicos</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={carregarNotasDFe}
                  disabled={carregandoDFe}
                  className="px-3 py-1.5 rounded-lg border text-xs font-semibold hover:bg-muted transition-colors flex items-center gap-1.5"
                >
                  <RefreshCw size={13} className={cn(carregandoDFe && "animate-spin")} />
                  Atualizar Lista
                </button>
              </div>

              {carregandoDFe ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Loader2 size={24} className="animate-spin mx-auto mb-2 text-primary" />
                  <p className="text-sm">Consultando notas na SEFAZ…</p>
                </div>
              ) : listaDFe.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground space-y-2">
                  <CheckCircle2 size={32} className="mx-auto text-emerald-500/60" />
                  <p className="font-semibold text-foreground text-sm">Nenhuma nota pendente encontrada</p>
                  <p className="text-xs max-w-md mx-auto">
                    Você pode colar a Chave de Acesso diretamente na aba <strong>"Baixar por Chave de Acesso"</strong> para buscar qualquer nota emitida contra a empresa.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Nº / Série</th>
                        <th>Emitente (Fornecedor)</th>
                        <th>Data</th>
                        <th>Valor Total</th>
                        <th className="text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listaDFe.map(n => (
                        <tr key={n.chaveAcesso}>
                          <td className="font-mono text-xs font-semibold">
                            {n.numero}-{n.serie}
                          </td>
                          <td>
                            <p className="font-medium text-xs">{n.emitenteNome}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">{formatarCnpj(n.emitenteCnpj)}</p>
                          </td>
                          <td className="text-xs text-muted-foreground">
                            {new Date(n.dataEmissao + 'T12:00:00').toLocaleDateString('pt-BR')}
                          </td>
                          <td className="text-xs font-semibold">
                            {n.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </td>
                          <td className="text-right">
                            <button
                              type="button"
                              onClick={() => handleBaixarPorChave(n.chaveAcesso)}
                              className="px-3 py-1 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-all shadow-sm"
                            >
                              Baixar e Dar Entrada
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* MÉTODO 3: Upload tradicional de arquivo XML */}
          {metodo === 'upload' && (
            <div
              className={cn(
                'rounded-xl border-2 border-dashed p-12 text-center transition-colors cursor-pointer bg-card animate-fade-in',
                dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30'
              )}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              <input ref={fileRef} type="file" accept=".xml" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
              {status === 'parsing' ? (
                <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary mb-4" />
              ) : (
                <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-4" />
              )}
              <p className="font-semibold text-foreground mb-1">
                {status === 'parsing' ? 'Processando XML…' : 'Arraste o arquivo XML ou clique para selecionar'}
              </p>
              <p className="text-sm text-muted-foreground">Suporta arquivos XML oficiais da NF-e padrão SEFAZ Layout 4.00</p>
            </div>
          )}
        </div>
      )}

      {/* Preview dos Produtos e Conferência de Entrada */}
      {status === 'preview' && nfeData && (
        <div className="space-y-4 animate-fade-in">
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <FileText size={18} className="text-primary" />
              <h2 className="font-semibold">Dados da NF-e Recebida</h2>
              <span className={cn('ml-auto text-xs font-semibold px-2.5 py-0.5 rounded-full', nfeData.tipo === 'entrada' ? 'badge-green' : 'badge-orange')}>
                {nfeData.tipo === 'entrada' ? '↓ Entrada de Mercadoria' : '↑ Saída'}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              {[
                { label: 'Número da Nota', value: `${nfeData.numero} · Série ${nfeData.serie}` },
                { label: 'Data de Emissão', value: new Date(nfeData.dataEmissao + 'T12:00:00').toLocaleDateString('pt-BR') },
                { label: 'Valor Total', value: nfeData.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) },
                { label: 'Emitente (Fornecedor)', value: nfeData.emitenteNome },
                { label: 'CNPJ do Fornecedor', value: formatarCnpj(nfeData.emitenteCnpj) },
                { label: 'Quantidade de Itens', value: `${nfeData.itens.length} produto(s)` },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">{label}</p>
                  <p className="font-medium truncate">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs text-muted-foreground font-mono break-all">
                Chave: {formatarChave44(nfeData.chaveAcesso)}
              </p>
            </div>
          </div>

          {/* Aviso sobre produtos não cadastrados */}
          {acoes.some(a => a.acao === 'criar') && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs animate-fade-in">
              <div className="flex items-center gap-2.5 text-amber-800 dark:text-amber-300">
                <AlertTriangle size={18} className="shrink-0 text-amber-600" />
                <span>
                  Existem <strong>{acoes.filter(a => a.acao === 'criar').length} produto(s) novo(s)</strong> nesta nota fiscal. <strong>Não é necessário criar o item antes:</strong> ao clicar em <em>"Confirmar e Dar Entrada no Estoque"</em> eles serão criados e somados automaticamente, ou clique no botão ao lado para já preencher a <strong>compatibilidade veicular e preço</strong> na própria entrada da nota.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const primeiroNovo = nfeData.itens.findIndex((_, i) => acoes[i]?.acao === 'criar');
                  if (primeiroNovo >= 0) {
                    setItemParaCadastrar({ item: nfeData.itens[primeiroNovo], index: primeiroNovo });
                  }
                }}
                className="shrink-0 px-3.5 py-2 rounded-lg bg-amber-600 text-white font-semibold hover:bg-amber-700 transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Plus size={14} /> Cadastrar Novo na Nota
              </button>
            </div>
          )}

          {/* Lista de Produtos da Nota */}
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b flex flex-wrap items-center gap-2">
              <Package size={16} className="text-primary" />
              <h3 className="font-semibold text-sm">Produtos da Nota Fiscal</h3>
              {analisando && <Loader2 size={14} className="animate-spin text-muted-foreground ml-auto" />}
              {!analisando && (
                <div className="ml-auto flex flex-wrap items-center gap-3 text-xs">
                  {acoes.length > 0 && (
                    <>
                      <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                        <PlusCircle size={13} /> {acoes.filter(a => a.acao === 'criar').length} criar na entrada
                      </span>
                      <span className="flex items-center gap-1 text-blue-600 font-semibold">
                        <ArrowUpCircle size={13} /> {acoes.filter(a => a.acao === 'atualizar').length} somar ao estoque
                      </span>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setItemParaCadastrar({
                        item: {
                          cProd: `PRD-${nfeData.numero}-${nfeData.itens.length + 1}`,
                          xProd: '',
                          ncm: '',
                          qCom: 1,
                          vUnCom: 0,
                          pICMS: 0,
                          pIPI: 0,
                          pPIS: 0,
                          pCOFINS: 0,
                        },
                        index: nfeData.itens.length,
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-primary/40 bg-primary/10 text-primary font-semibold hover:bg-primary/20 transition-colors"
                  >
                    <Plus size={13} /> Criar / Adicionar Item na Nota
                  </button>
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Descrição</th>
                    <th>Qtd</th>
                    <th>Vl. Unit.</th>
                    <th>Total</th>
                    <th>Ação no Estoque & Compatibilidade</th>
                  </tr>
                </thead>
                <tbody>
                  {nfeData.itens.map((it, idx) => {
                    const acao = acoes[idx];
                    return (
                      <tr key={idx} className="hover:bg-muted/40 transition-colors">
                        <td className="font-mono text-xs">{it.cProd}</td>
                        <td className="font-medium text-xs max-w-xs truncate" title={it.xProd}>{it.xProd}</td>
                        <td className="text-xs font-semibold">{it.qCom}</td>
                        <td className="text-xs">{it.vUnCom.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                        <td className="text-xs font-semibold">{(it.qCom * it.vUnCom).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                        <td>
                          {acao?.acao === 'criar' && (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                                <PlusCircle size={11} /> Criar na entrada (+{it.qCom} un)
                              </span>
                              <button
                                type="button"
                                onClick={() => setItemParaCadastrar({ item: it, index: idx })}
                                className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 px-2.5 py-1 rounded-md shadow-sm transition-all"
                              >
                                <Plus size={12} /> Cadastrar com Compatibilidade
                              </button>
                            </div>
                          )}
                          {acao?.acao === 'atualizar' && (
                            <div className="flex flex-col gap-1 py-0.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={cn(
                                  "inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded",
                                  acao.jaCadastradoNesteLote
                                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                    : "bg-blue-500/10 text-blue-700 dark:text-blue-400"
                                )}>
                                  {acao.jaCadastradoNesteLote ? <CheckCircle2 size={12} /> : <ArrowUpCircle size={12} />}
                                  {acao.jaCadastradoNesteLote ? 'Criado & Somado ao Estoque' : 'Já no catálogo (Somar)'}
                                </span>
                                <span className="text-[11px] text-muted-foreground font-mono">
                                  Estoque: {acao.estoqueAtual} ➔ <strong className="text-foreground">{acao.estoqueNovo}</strong> (+{it.qCom})
                                </span>
                                {!acao.jaCadastradoNesteLote && (
                                  <button
                                    type="button"
                                    onClick={() => setItemParaCadastrar({ item: it, index: idx })}
                                    className="text-[11px] font-semibold text-primary hover:underline"
                                  >
                                    Editar item
                                  </button>
                                )}
                              </div>
                              {acao.aplicacao && (
                                <span className="text-[10px] text-muted-foreground truncate max-w-sm" title={acao.aplicacao}>
                                  🚗 Compatibilidade: {acao.aplicacao}
                                </span>
                              )}
                            </div>
                          )}
                          {acao?.acao === 'ignorar' && (
                            <span className="text-[11px] text-muted-foreground">Ignorar</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={reset}
              className="px-4 py-2.5 rounded-lg border text-sm font-semibold hover:bg-muted transition-colors"
            >
              Cancelar / Escolher Outra
            </button>
            <button
              type="button"
              onClick={() => handleImport(false)}
              className="btn-primary px-6 py-2.5 rounded-lg text-sm font-semibold shadow-sm flex items-center gap-2"
            >
              <CheckCircle size={16} /> Confirmar e Dar Entrada no Estoque
            </button>
          </div>
        </div>
      )}

      {/* Modal de Cadastro de Produto com Compatibilidade Veicular */}
      {itemParaCadastrar && (
        <ProdutoModal
          isMinimized={isModalMinimizado}
          onMinimize={() => setIsModalMinimizado(true)}
          onRestore={() => setIsModalMinimizado(false)}
          produto={{
            codigo: itemParaCadastrar.item.cProd,
            codigo_fabrica: itemParaCadastrar.item.cProd,
            nome: itemParaCadastrar.item.xProd.includes('PECA AUTOMOTIVA RECEBIDA VIA SEFAZ') ? '' : itemParaCadastrar.item.xProd,
            marca: nfeData?.emitenteNome && !nfeData.emitenteNome.includes('DISTRIBUIDORA / FORNECEDOR') ? nfeData.emitenteNome : '',
            ncm: itemParaCadastrar.item.ncm || '',
            preco_custo: itemParaCadastrar.item.vUnCom,
            preco_venda: Math.round(itemParaCadastrar.item.vUnCom * 1.5 * 100) / 100,
            markup_percentual: Number(config?.markup_padrao || 50) || 50,
            quantidade_inicial: Math.max(1, Math.round(Number(itemParaCadastrar.item.qCom || 1))),
            fornecedor_inicial: nfeData?.emitenteNome && !nfeData.emitenteNome.includes('DISTRIBUIDORA / FORNECEDOR') ? nfeData.emitenteNome : '',
            tipo_veiculo: 'Carro',
            categoria: 'Geral',
            aplicacao: '',
            icms_percentual: itemParaCadastrar.item.pICMS || 0,
            ipi_percentual: itemParaCadastrar.item.pIPI || 0,
            pis_percentual: itemParaCadastrar.item.pPIS || 0,
            cofins_percentual: itemParaCadastrar.item.pCOFINS || 0,
            estoque_minimo: 1,
          }}
          onClose={() => setItemParaCadastrar(null)}
          onSave={handleSalvarProdutoModal}
          saving={savingModal}
          markupPadrao={config?.markup_padrao || '50'}
          orcamentoLabel={`Importação NF-e ${nfeData?.numero || ''} • Item ${itemParaCadastrar.index + 1}`}
        />
      )}

      {/* Status: Concluído */}
      {status === 'done' && (
        <div className="rounded-xl border bg-card p-8 text-center space-y-4 shadow-sm animate-fade-in">
          <div className="h-12 w-12 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle size={28} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Entrada de Nota Fiscal Realizada com Sucesso!</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {importedCount} item(ns) processado(s), lotes de entrada gerados e estoque atualizado.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate('/produtos')}
              className="btn-primary px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm"
            >
              <Package size={16} /> Ver Produtos no Estoque
            </button>
            <button
              type="button"
              onClick={() => {
                reset();
                setTabPrincipal('historico');
                refetchHistorico();
              }}
              className="px-5 py-2.5 rounded-lg border text-sm font-semibold hover:bg-muted transition-colors flex items-center gap-2"
            >
              <History size={16} /> Grade de Custos da Nota
            </button>
            <button
              type="button"
              onClick={reset}
              className="px-4 py-2.5 rounded-lg border text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              Importar Outra Nota Fiscal
            </button>
          </div>
        </div>
      )}

      {/* Status: Duplicada */}
      {status === 'duplicate' && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-center space-y-3 shadow-sm animate-fade-in">
          <AlertTriangle size={32} className="mx-auto text-amber-600" />
          <h2 className="text-lg font-bold text-foreground">Esta NF-e Já Consta no Histórico</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            A chave de acesso desta nota fiscal já foi registrada anteriormente. Caso os itens ainda não tenham sido somados ao estoque, clique em <strong>Reprocessar e Somar ao Estoque</strong> abaixo.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={reset}
              className="px-4 py-2 rounded-lg border text-sm font-semibold hover:bg-muted"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={() => handleImport(true)}
              className="btn-primary px-5 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm"
            >
              <RefreshCw size={15} /> Reprocessar e Somar Itens ao Estoque
            </button>
          </div>
        </div>
      )}
      </div>
      )}

      {/* ABA 2: Histórico de Notas & Grade de Custos */}
      {tabPrincipal === 'historico' && (
        <div className="space-y-6 animate-fade-in">
          {/* Métricas do Histórico */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border bg-card p-4 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase">Notas Importadas</p>
                <p className="text-2xl font-bold text-foreground mt-1">{totalNotas}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Entradas fiscais registradas</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <FileText size={20} />
              </div>
            </div>

            <div className="rounded-xl border bg-card p-4 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase">Total em Compras</p>
                <p className="text-2xl font-bold text-emerald-600 mt-1">
                  {totalValorCompras.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Valor faturado das notas</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                <DollarSign size={20} />
              </div>
            </div>

            <div className="rounded-xl border bg-card p-4 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase">Média por Nota</p>
                <p className="text-2xl font-bold text-blue-600 mt-1">
                  {(totalNotas > 0 ? totalValorCompras / totalNotas : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Ticket médio de compras</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center">
                <Layers size={20} />
              </div>
            </div>
          </div>

          {/* Barra de Filtros e Ação de Limpar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={filtroHistorico}
                onChange={e => setFiltroHistorico(e.target.value)}
                placeholder="Buscar por número da nota, chave de 44 dígitos, fornecedor ou CNPJ..."
                className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {totalNotas > 0 && (
              <button
                type="button"
                onClick={() => setShowConfirmLimparTudo(true)}
                className="px-3.5 py-2 rounded-lg border border-red-500/40 text-red-600 hover:bg-red-500/10 transition-colors text-xs font-semibold flex items-center justify-center gap-1.5 shrink-0"
              >
                <Trash2 size={14} />
                Limpar Todo o Histórico de Notas
              </button>
            )}
          </div>

          {/* Tabela de Notas Fiscais */}
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            {loadingHistorico ? (
              <div className="py-16 text-center text-muted-foreground flex flex-col items-center gap-2">
                <Loader2 className="animate-spin text-primary" size={28} />
                <span className="text-sm">Carregando notas importadas...</span>
              </div>
            ) : notasFiltradas.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground space-y-3">
                <FileText size={36} className="mx-auto text-muted-foreground/40" />
                <p className="text-sm font-semibold">Nenhuma nota fiscal encontrada no histórico.</p>
                <p className="text-xs max-w-sm mx-auto">
                  {filtroHistorico ? 'Nenhum resultado para a busca informada.' : 'Importe suas notas fiscais de entrada para visualizar os custos e lotes aqui.'}
                </p>
                <button
                  type="button"
                  onClick={() => setTabPrincipal('entrada')}
                  className="btn-primary text-xs px-4 py-2 rounded-lg font-semibold inline-flex items-center gap-1.5 mt-2"
                >
                  <Upload size={14} /> Importar Primeira Nota
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>NF-e / Série</th>
                      <th>Fornecedor / Emitente</th>
                      <th>Data Emissão</th>
                      <th>Valor Total</th>
                      <th>Chave de Acesso</th>
                      <th className="text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notasFiltradas.map((nota: any) => (
                      <tr key={nota.id} className="hover:bg-muted/40 transition-colors">
                        <td>
                          <div className="font-semibold text-xs text-foreground">
                            Nº {nota.numero}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            Série {nota.serie || '1'}
                          </div>
                        </td>
                        <td>
                          <div className="font-medium text-xs text-foreground max-w-xs truncate" title={nota.emitente_nome}>
                            {nota.emitente_nome || 'Fornecedor não identificado'}
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono">
                            {formatarCnpj(nota.emitente_cnpj)}
                          </div>
                        </td>
                        <td className="text-xs">
                          {nota.data_emissao ? new Date(nota.data_emissao + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                        </td>
                        <td className="text-xs font-bold text-foreground">
                          {Number(nota.valor_total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                        <td>
                          <div className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                            <span title={nota.chave_acesso}>
                              ...{nota.chave_acesso?.slice(-12) || '—'}
                            </span>
                            {nota.chave_acesso && (
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(nota.chave_acesso);
                                  toast({ title: 'Chave copiada!', description: 'Chave de 44 dígitos copiada.' });
                                }}
                                title="Copiar chave de acesso"
                                className="p-1 hover:text-primary transition-colors"
                              >
                                <Copy size={12} />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setNotaSelecionadaGrade(nota)}
                              className="px-2.5 py-1 text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 rounded-md transition-colors flex items-center gap-1"
                              title="Visualizar grade de custos dos produtos da nota"
                            >
                              <Eye size={13} />
                              Grade de Custo
                            </button>

                            {nota.xml_raw && (
                              <button
                                type="button"
                                onClick={() => handleDownloadXml(nota)}
                                className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
                                title="Baixar arquivo XML"
                              >
                                <Download size={14} />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleExcluirNota(nota)}
                              disabled={deletandoNotaId === nota.id}
                              className="p-1.5 text-red-500 hover:text-red-700 rounded-md hover:bg-red-500/10 transition-colors disabled:opacity-50"
                              title="Excluir nota e seus lotes"
                            >
                              {deletandoNotaId === nota.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Grade de Custos Completa da NF-e */}
      {notaSelecionadaGrade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-card border rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b flex items-center justify-between bg-muted/20">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <FileText size={20} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                    Grade de Custos · NF-e nº {notaSelecionadaGrade.numero}
                    <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-mono">
                      Série {notaSelecionadaGrade.serie || '1'}
                    </span>
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Fornecedor: <strong>{notaSelecionadaGrade.emitente_nome || '—'}</strong> ({formatarCnpj(notaSelecionadaGrade.emitente_cnpj)})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setNotaSelecionadaGrade(null)}
                className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Sub-header com dados da nota */}
            <div className="px-6 py-3 bg-muted/10 border-b grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Data Emissão</span>
                <span className="font-semibold text-foreground">
                  {notaSelecionadaGrade.data_emissao ? new Date(notaSelecionadaGrade.data_emissao + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Valor Total NF-e</span>
                <span className="font-bold text-emerald-600 text-sm">
                  {Number(notaSelecionadaGrade.valor_total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Total de Itens</span>
                <span className="font-semibold text-foreground">
                  {itensGradeNota.length > 0 ? `${itensGradeNota.length} itens` : 'Calculando...'}
                </span>
              </div>
              <div className="flex items-center justify-end gap-2">
                {notaSelecionadaGrade.xml_raw && (
                  <button
                    type="button"
                    onClick={() => handleDownloadXml(notaSelecionadaGrade)}
                    className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border hover:bg-muted transition-colors flex items-center gap-1.5"
                  >
                    <Download size={13} /> Baixar XML
                  </button>
                )}
              </div>
            </div>

            {/* Tabela de Produtos / Grade de Custo */}
            <div className="flex-1 overflow-y-auto p-6">
              {itensGradeNota.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Package size={32} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Os itens desta nota não puderam ser extraídos do XML.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Descrição da Peça</th>
                        <th>NCM</th>
                        <th>Qtd</th>
                        <th>Preço Custo Unit.</th>
                        <th>Total de Custo</th>
                        <th>ICMS</th>
                        <th>IPI</th>
                        <th>PIS/COFINS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itensGradeNota.map((it, idx) => (
                        <tr key={idx} className="hover:bg-muted/40 transition-colors">
                          <td className="font-mono text-xs font-semibold">{it.cProd}</td>
                          <td className="font-medium text-xs max-w-xs truncate" title={it.xProd}>{it.xProd}</td>
                          <td className="font-mono text-xs text-muted-foreground">{it.ncm || '—'}</td>
                          <td className="text-xs font-bold text-foreground">{it.qCom}</td>
                          <td className="text-xs font-semibold text-emerald-600">
                            {it.vUnCom.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </td>
                          <td className="text-xs font-bold text-foreground">
                            {(it.qCom * it.vUnCom).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </td>
                          <td className="text-[11px] text-muted-foreground">{it.pICMS ? `${it.pICMS}%` : '—'}</td>
                          <td className="text-[11px] text-muted-foreground">{it.pIPI ? `${it.pIPI}%` : '—'}</td>
                          <td className="text-[11px] text-muted-foreground">
                            {it.pPIS || it.pCOFINS ? `${it.pPIS || 0}% / ${it.pCOFINS || 0}%` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/20 font-bold text-xs border-t">
                        <td colSpan={3} className="text-right">TOTAIS DA NOTA:</td>
                        <td>{itensGradeNota.reduce((acc, i) => acc + i.qCom, 0)} un</td>
                        <td>—</td>
                        <td className="text-emerald-600 font-bold">
                          {itensGradeNota.reduce((acc, i) => acc + (i.qCom * i.vUnCom), 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                        <td colSpan={3}>—</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t bg-muted/20 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground font-mono truncate max-w-md">
                Chave: {formatarChave44(notaSelecionadaGrade.chave_acesso)}
              </span>
              <button
                type="button"
                onClick={() => setNotaSelecionadaGrade(null)}
                className="btn-primary text-xs px-4 py-2 rounded-lg font-semibold"
              >
                Fechar Grade de Custos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmar Limpar Todo Histórico de Notas */}
      {showConfirmLimparTudo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-card border border-red-500/30 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 text-center">
            <div className="h-12 w-12 rounded-full bg-red-500/10 text-red-600 flex items-center justify-center mx-auto">
              <AlertOctagon size={28} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">Excluir Todo o Histórico de Notas?</h3>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                Esta ação apagará permanentemente todas as <strong>{totalNotas} nota(s) importada(s)</strong> do histórico e removerá os lotes de entrada associados a elas.
              </p>
              <p className="text-xs font-semibold text-amber-600 mt-2">
                Use esta opção para limpar registros com valores/itens incorretos e reimportá-las limpas.
              </p>
            </div>
            <div className="flex gap-3 justify-center pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmLimparTudo(false)}
                disabled={limpandoTudo}
                className="px-4 py-2 rounded-lg border text-xs font-semibold hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleLimparTodoHistorico}
                disabled={limpandoTudo}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors text-xs font-semibold flex items-center gap-1.5 shadow-sm"
              >
                {limpandoTudo ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Sim, Limpar Todo Histórico
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
