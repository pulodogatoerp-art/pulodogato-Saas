import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Upload, FileText, CheckCircle, AlertTriangle, XCircle, Loader2,
  Package, PlusCircle, ArrowUpCircle, Key, DownloadCloud, Search,
  RefreshCw, Copy, CheckCircle2, ShieldCheck, Landmark, Plus, Wrench
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
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

  // tpNF: 0=entrada, 1=saida
  const tpNF = get('tpNF', ide);
  const tipo: 'entrada' | 'saida' = tpNF === '1' ? 'saida' : 'entrada';

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

export default function ImportarNFe() {
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
  const [savingModal, setSavingModal] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const MAX_FILE_SIZE_MB = 5;
  const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

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

  // Analisa cada item: existe no catálogo? criar ou atualizar estoque?
  useEffect(() => {
    if (status !== 'preview' || !nfeData) return;
    let cancelled = false;
    (async () => {
      setAnalisando(true);
      const result: ItemAcao[] = [];
      for (const item of nfeData.itens) {
        if (item.qCom <= 0) {
          result.push({ acao: 'ignorar' });
          continue;
        }

        // Procura no catálogo por código da nota ou código de fábrica
        const { data: prod } = await (supabase as any)
          .from('produtos')
          .select('id, nome, aplicacao, estoque_total')
          .or(`codigo.eq.${item.cProd},codigo_fabrica.eq.${item.cProd}`)
          .maybeSingle();

        if (prod) {
          const delta = nfeData.tipo === 'entrada' ? item.qCom : -item.qCom;
          const estoqueAtual = Number((prod as any).estoque_total ?? 0);
          const estoqueNovo = Math.max(0, estoqueAtual + delta);
          result.push({
            acao: 'atualizar',
            produtoId: (prod as any).id,
            produtoNome: (prod as any).nome,
            aplicacao: (prod as any).aplicacao,
            estoqueAtual,
            estoqueNovo,
            jaCadastradoNesteLote: false,
          });
        } else if (nfeData.tipo === 'entrada') {
          result.push({
            acao: 'criar',
            estoqueAtual: 0,
            estoqueNovo: item.qCom,
            jaCadastradoNesteLote: false,
          });
        } else {
          result.push({ acao: 'ignorar' });
        }
      }
      if (!cancelled) {
        setAcoes(result);
        setAnalisando(false);
      }
    })();
    return () => { cancelled = true; };
  }, [status, nfeData]);

  const handleSalvarProdutoModal = async (data: Record<string, any>) => {
    if (!itemParaCadastrar || !nfeData) return;
    setSavingModal(true);
    try {
      const item = itemParaCadastrar.item;
      const index = itemParaCadastrar.index;
      delete data._lote;

      // Define o estoque total inicial com a quantidade exata da nota fiscal
      const payload = {
        ...data,
        estoque_total: item.qCom,
      };

      const { data: inserted, error: prodErr } = await (supabase as any)
        .from('produtos')
        .insert(payload)
        .select('id, codigo, nome, aplicacao, estoque_total')
        .single();

      if (prodErr) throw prodErr;

      // Registra o lote de entrada fiscal com preço de custo e chave da NF-e
      await (supabase as any).from('lotes').insert({
        produto_id: inserted.id,
        fornecedor: nfeData.emitenteNome || '—',
        preco_custo: item.vUnCom,
        quantidade: item.qCom,
        data_entrada: nfeData.dataEmissao || new Date().toISOString(),
        nfe_chave: nfeData.chaveAcesso || null,
      });

      // Atualiza o status da linha na tabela para confirmar o cadastro e estoque
      setAcoes(prev => {
        const copy = [...prev];
        copy[index] = {
          acao: 'atualizar',
          produtoId: inserted.id,
          produtoNome: inserted.nome,
          aplicacao: inserted.aplicacao,
          estoqueAtual: 0,
          estoqueNovo: item.qCom,
          jaCadastradoNesteLote: true,
        };
        return copy;
      });

      toast({
        title: 'Produto cadastrado com compatibilidade!',
        description: `${inserted.nome} cadastrado com sucesso. Estoque de ${item.qCom} un registrado.`,
      });

      setItemParaCadastrar(null);
    } catch (err: any) {
      toast({
        title: 'Erro ao cadastrar produto',
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

  const handleImport = async () => {
    if (!nfeData) return;
    setStatus('importing');

    try {
      // 1. Verificar duplicata
      const { data: existing } = await (supabase as any)
        .from('nfe_importadas')
        .select('id')
        .eq('chave_acesso', nfeData.chaveAcesso)
        .maybeSingle();

      if (existing) {
        setStatus('duplicate');
        return;
      }

      // 2. Processar itens — criar/atualizar produtos e lotes
      let processados = 0;
      for (let idx = 0; idx < nfeData.itens.length; idx++) {
        const item = nfeData.itens[idx];
        const acao = acoes[idx];
        if (item.qCom <= 0 || acao?.acao === 'ignorar') continue;

        // Se o produto já foi cadastrado via modal com compatibilidade durante este preview
        if (acao?.jaCadastradoNesteLote) {
          processados++;
          continue;
        }

        let produtoId: string;

        if (acao?.acao === 'atualizar' && acao.produtoId) {
          produtoId = acao.produtoId;
          const novoEstoque = acao.estoqueNovo ?? ((acao.estoqueAtual ?? 0) + item.qCom);
          await (supabase as any)
            .from('produtos')
            .update({
              estoque_total: novoEstoque,
              icms_percentual: item.pICMS,
              ipi_percentual: item.pIPI,
              pis_percentual: item.pPIS,
              cofins_percentual: item.pCOFINS,
              updated_at: new Date().toISOString(),
            })
            .eq('id', produtoId);
        } else if (nfeData.tipo === 'entrada') {
          // Se não foi cadastrado manualmente com compatibilidade, cadastra automático com dados da nota
          const { data: novoProd, error: insertErr } = await (supabase as any)
            .from('produtos')
            .insert({
              codigo: item.cProd,
              codigo_fabrica: item.cProd,
              nome: item.xProd,
              ncm: item.ncm,
              marca: nfeData.emitenteNome,
              aplicacao: 'A definir / Consultar compatibilidade',
              categoria: 'Geral',
              tipo_veiculo: 'Carro',
              estoque_total: item.qCom,
              preco_venda: Math.round(item.vUnCom * 1.5 * 100) / 100,
              icms_percentual: item.pICMS,
              ipi_percentual: item.pIPI,
              pis_percentual: item.pPIS,
              cofins_percentual: item.pCOFINS,
            })
            .select('id')
            .single();

          if (insertErr) throw insertErr;
          produtoId = (novoProd as any).id;
        } else {
          continue;
        }

        if (nfeData.tipo === 'entrada') {
          await (supabase as any).from('lotes').insert({
            produto_id: produtoId,
            fornecedor: nfeData.emitenteNome,
            preco_custo: item.vUnCom,
            quantidade: item.qCom,
            data_entrada: nfeData.dataEmissao || new Date().toISOString(),
            nfe_chave: nfeData.chaveAcesso,
          });
        }

        processados++;
      }

      // 3. Registrar NF-e importada
      const { data: { user } } = await supabase.auth.getUser();
      await (supabase as any).from('nfe_importadas').insert({
        chave_acesso: nfeData.chaveAcesso,
        numero: nfeData.numero,
        serie: nfeData.serie,
        emitente_cnpj: nfeData.emitenteCnpj,
        emitente_nome: nfeData.emitenteNome,
        destinatario_cnpj: nfeData.destinatarioCnpj || null,
        data_emissao: nfeData.dataEmissao,
        valor_total: nfeData.valorTotal,
        tipo: nfeData.tipo,
        status: 'processada',
        xml_raw: xmlText,
        imported_by: user?.id,
      });

      setImportedCount(processados);
      setStatus('done');
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

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Importar NF-e & Baixa SEFAZ</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Baixe notas emitidas contra seu CNPJ via Chave de Acesso ou faça upload do XML para dar entrada no estoque.
          </p>
        </div>

        {cnpjEmpresa && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Meu CNPJ:</span>
            <span className="font-mono">{formatarCnpj(cnpjEmpresa)}</span>
          </div>
        )}
      </div>

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
                  Existem <strong>{acoes.filter(a => a.acao === 'criar').length} produto(s) novos</strong> nesta nota fiscal. Recomendamos cadastrar a <strong>compatibilidade veicular</strong> para que os vendedores encontrem a peça na busca por veículo do balcão.
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
                <Plus size={14} /> Cadastrar Primeiro Novo
              </button>
            </div>
          )}

          {/* Lista de Produtos da Nota */}
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b flex items-center gap-2">
              <Package size={16} className="text-primary" />
              <h3 className="font-semibold text-sm">Produtos da Nota Fiscal</h3>
              {analisando && <Loader2 size={14} className="animate-spin text-muted-foreground ml-auto" />}
              {!analisando && acoes.length > 0 && (
                <div className="ml-auto flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                    <PlusCircle size={13} /> {acoes.filter(a => a.acao === 'criar').length} novos
                  </span>
                  <span className="flex items-center gap-1 text-blue-600 font-semibold">
                    <ArrowUpCircle size={13} /> {acoes.filter(a => a.acao === 'atualizar').length} somar ao estoque
                  </span>
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
                                <PlusCircle size={11} /> Não Cadastrado (+{it.qCom})
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
                                  {acao.jaCadastradoNesteLote ? 'Cadastrado agora' : 'Já no catálogo'}
                                </span>
                                <span className="text-[11px] text-muted-foreground font-mono">
                                  Estoque: {acao.estoqueAtual} ➔ <strong className="text-foreground">{acao.estoqueNovo}</strong> (+{it.qCom})
                                </span>
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
              onClick={handleImport}
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
          produto={{
            codigo: itemParaCadastrar.item.cProd,
            codigo_fabrica: itemParaCadastrar.item.cProd,
            nome: itemParaCadastrar.item.xProd,
            marca: nfeData?.emitenteNome || '',
            ncm: itemParaCadastrar.item.ncm || '',
            preco_custo: itemParaCadastrar.item.vUnCom,
            preco_venda: Math.round(itemParaCadastrar.item.vUnCom * 1.5 * 100) / 100,
            markup_percentual: 50,
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
          <button
            type="button"
            onClick={reset}
            className="btn-primary px-5 py-2.5 rounded-lg text-sm font-semibold"
          >
            Importar Outra Nota Fiscal
          </button>
        </div>
      )}

      {/* Status: Duplicada */}
      {status === 'duplicate' && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-center space-y-3 shadow-sm animate-fade-in">
          <AlertTriangle size={32} className="mx-auto text-amber-600" />
          <h2 className="text-lg font-bold text-foreground">Esta NF-e Já Foi Importada Anteriormente!</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            A chave de acesso desta nota fiscal já consta no banco de dados e seus itens já foram computados no estoque para evitar duplicidade.
          </p>
          <button
            type="button"
            onClick={reset}
            className="px-4 py-2 rounded-lg border text-sm font-semibold hover:bg-muted"
          >
            Voltar
          </button>
        </div>
      )}
    </div>
  );
}
