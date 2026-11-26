import { useAppContext } from '@/components/Layout';
import { ShoppingCart, Loader2, Eye, X, FileText, Printer, Download, CheckCircle, AlertCircle, Send, Receipt, UserCheck, XCircle } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  NFeVendaData,
  NFeResultado,
  TipoDocumentoFiscal,
  ModeloFiscal,
  getVendaNFeRecord,
  emitirDocumentoFiscal,
  cancelarDocumentoFiscal,
  baixarXmlNFe,
} from '@/services/nfeService';
import DanfeModal from '@/components/DanfeModal';
import DanfeNfceModal from '@/components/DanfeNfceModal';

interface VendaDB {
  id: string;
  numero: string;
  cliente_id: string | null;
  cliente_nome: string;
  total: number;
  forma_pagamento: string;
  created_by: string | null;
  created_at: string;
  frete_transportadora: string;
  frete_valor: number;
  tipo_documento_fiscal?: string;
  nfe_chave?: string;
  nfe_numero?: string;
  nfe_protocolo?: string;
  nfe_status?: string;
  nfe_xml?: string;
}

interface ItemVendaDB {
  id: string;
  produto_id: string | null;
  produto_nome: string;
  produto_codigo: string;
  quantidade: number;
  preco_unitario: number;
  subtotal: number;
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function useVendas() {
  return useQuery({
    queryKey: ['vendas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendas')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as VendaDB[];
    },
  });
}

function useItensVenda(vendaId: string | null) {
  return useQuery({
    queryKey: ['itens_venda', vendaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('itens_venda')
        .select('*')
        .eq('venda_id', vendaId!);
      if (error) throw error;
      return (data ?? []) as ItemVendaDB[];
    },
    enabled: !!vendaId,
  });
}

function useConfiguracoes() {
  return useQuery({
    queryKey: ['configuracoes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('configuracoes').select('chave, valor');
      if (error) throw error;
      const map: Record<string, string> = {};
      (data ?? []).forEach((r: any) => { map[r.chave] = r.valor; });
      return map;
    },
  });
}

export default function Vendas() {
  const { userRole } = useAppContext();
  const isAdmin = userRole === 'admin';
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: vendas, isLoading } = useVendas();
  const { data: config } = useConfiguracoes();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: itensDetail } = useItensVenda(selectedId);

  // Estados para Emissão e Visualização
  const [vendaParaEmitir, setVendaParaEmitir] = useState<VendaDB | null>(null);
  const [tipoDocumentoEmissao, setTipoDocumentoEmissao] = useState<TipoDocumentoFiscal>('nfce');
  const { data: itensParaEmitir } = useItensVenda(vendaParaEmitir?.id ?? null);
  const [danfeAtivo, setDanfeAtivo] = useState<{ dados: NFeVendaData; resultado: NFeResultado } | null>(null);
  const [emitindo, setEmitindo] = useState(false);
  const [docParaCancelar, setDocParaCancelar] = useState<{ venda: VendaDB; nfeRecord?: NFeResultado | null } | null>(null);
  const [justificativaCancelamento, setJustificativaCancelamento] = useState('');
  const [cancelando, setCancelando] = useState(false);

  // Formulário do destinatário para emissão (permite conferir/editar dados no modal)
  const [destinatarioForm, setDestinatarioForm] = useState({
    nome: '',
    cpfCnpj: '',
    endereco: '',
    bairro: 'Centro',
    cidade: 'Campo Grande',
    uf: 'MS',
    cep: '79000-000',
    telefone: '',
  });

  const selectedVenda = vendas?.find(v => v.id === selectedId);

  // Iniciar fluxo de emissão
  const handleAbrirEmissao = async (venda: VendaDB, tipoPref: TipoDocumentoFiscal = 'nfce') => {
    setVendaParaEmitir(venda);
    setTipoDocumentoEmissao(tipoPref);

    // Carrega dados do cliente se cadastrado por ID ou busca por nome
    let cliData: any = null;
    if (venda.cliente_id) {
      const { data: cli } = await supabase.from('clientes').select('*').eq('id', venda.cliente_id).maybeSingle();
      cliData = cli;
    } else if (venda.cliente_nome && venda.cliente_nome !== 'Cliente Balcão') {
      const { data: cli } = await supabase.from('clientes').select('*').ilike('nome', venda.cliente_nome).maybeSingle();
      cliData = cli;
    }

    if (cliData) {
      setDestinatarioForm({
        nome: cliData.nome || venda.cliente_nome,
        cpfCnpj: cliData.cpf_cnpj || '',
        endereco: cliData.endereco || 'Logradouro principal',
        bairro: 'Centro',
        cidade: config?.['empresa_cidade'] || 'Campo Grande',
        uf: config?.['empresa_uf'] || 'MS',
        cep: '79000-000',
        telefone: cliData.telefone || '',
      });
      return;
    }

    setDestinatarioForm({
      nome: venda.cliente_nome || 'Consumidor Final',
      cpfCnpj: '',
      endereco: 'Logradouro principal',
      bairro: 'Centro',
      cidade: config?.['empresa_cidade'] || 'Campo Grande',
      uf: config?.['empresa_uf'] || 'MS',
      cep: '79000-000',
      telefone: '',
    });
  };

  // Disparo da transmissão da NFC-e ou NF-e
  const handleConfirmarEmissao = async () => {
    if (!vendaParaEmitir || !itensParaEmitir) return;

    const isNfce = tipoDocumentoEmissao === 'nfce';

    if (!isNfce && !destinatarioForm.nome.trim()) {
      toast({ title: 'Nome do cliente é obrigatório para emissão de NF-e', variant: 'destructive' });
      return;
    }

    const cnpjEmpresa = config?.['empresa_cnpj'] || '';
    if (!cnpjEmpresa) {
      toast({
        title: 'CNPJ da empresa não configurado',
        description: 'Acesse Configurações e preencha os dados da sua empresa antes de emitir.',
        variant: 'destructive',
      });
      return;
    }

    setEmitindo(true);

    try {
      const serie = isNfce ? (config?.['nfce_serie'] || '1') : (config?.['nfe_serie'] || '1');
      const proximoNum = parseInt(isNfce ? (config?.['nfce_proximo_numero'] || '1') : (config?.['nfe_proximo_numero'] || '1'), 10);
      const ambiente = (config?.['nfe_ambiente'] || 'producao') as 'homologacao' | 'producao';
      const natOp = isNfce ? 'VENDA AO CONSUMIDOR' : (config?.['nfe_natureza_operacao'] || 'Venda de mercadoria adquirida de terceiros');
      const cfopPadrao = config?.['nfe_cfop_padrao'] || '5102';
      const tokenFocus = config?.['nfe_focus_token'] || '';

      const freteVal = Number(vendaParaEmitir.frete_valor) || 0;
      const totalItens = itensParaEmitir.reduce((acc, it) => acc + Number(it.subtotal), 0);

      const docData: NFeVendaData = {
        vendaId: vendaParaEmitir.id,
        vendaNumero: vendaParaEmitir.numero,
        dataEmissao: new Date(),
        naturezaOperacao: natOp,
        serie,
        numero: proximoNum,
        modelo: isNfce ? '65' : '55',
        tipo: tipoDocumentoEmissao,
        ambiente,
        formaPagamento: vendaParaEmitir.forma_pagamento || 'Dinheiro',
        freteModalidade: freteVal > 0 ? 0 : 9,
        freteTransportadora: vendaParaEmitir.frete_transportadora,
        freteValor: freteVal,
        totalProdutos: totalItens,
        totalVenda: Number(vendaParaEmitir.total),
        cscId: ambiente === 'homologacao'
          ? (config?.['nfce_id_csc_homologacao'] || config?.['nfce_id_csc'] || '000001')
          : (config?.['nfce_id_csc'] || '000001'),
        cscToken: ambiente === 'homologacao'
          ? (config?.['nfce_csc_homologacao'] || config?.['nfce_csc'] || 'ffa0a4ef9c0175f8e08893a1b45c5ef39661')
          : (config?.['nfce_csc'] || '801f32f748c67f2b31b530e515983c469c37'),
        emitente: {
          cnpj: cnpjEmpresa,
          razaoSocial: config?.['empresa_nome'] || 'G Autopeças & Acessórios',
          nomeFantasia: config?.['empresa_nome_fantasia'] || 'G Autopeças & Acessórios',
          ie: config?.['empresa_ie'] || 'ISENTO',
          endereco: config?.['empresa_endereco'] || 'Rua Principal',
          cidade: config?.['empresa_cidade'] || 'Campo Grande',
          uf: config?.['empresa_uf'] || 'MS',
          cep: config?.['empresa_cep'] || '79000-000',
          telefone: config?.['empresa_telefone'] || '',
          email: config?.['empresa_email'] || '',
          regimeTributario: config?.['nfe_regime_tributario'] || '1',
        },
        destinatario: {
          nome: destinatarioForm.nome.trim() || 'CONSUMIDOR FINAL',
          cpfCnpj: destinatarioForm.cpfCnpj,
          endereco: destinatarioForm.endereco,
          bairro: destinatarioForm.bairro,
          cidade: destinatarioForm.cidade,
          uf: destinatarioForm.uf,
          cep: destinatarioForm.cep,
          telefone: destinatarioForm.telefone,
        },
        itens: itensParaEmitir.map((it, idx) => ({
          id: it.id,
          codigo: it.produto_codigo || `COD-${idx + 1}`,
          descricao: it.produto_nome,
          ncm: '87082999',
          cfop: cfopPadrao,
          unidade: 'UN',
          quantidade: it.quantidade,
          valorUnitario: Number(it.preco_unitario),
          valorTotal: Number(it.subtotal),
          icmsAliquota: Number(config?.['icms_percentual'] || 17),
          pisAliquota: Number(config?.['pis_percentual'] || 1.65),
          cofinsAliquota: Number(config?.['cofins_percentual'] || 7.6),
        })),
      };

      const resultado = await emitirDocumentoFiscal(docData, tokenFocus);

      queryClient.invalidateQueries({ queryKey: ['configuracoes'] });
      queryClient.invalidateQueries({ queryKey: ['vendas'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-nfes'] });

      toast({
        title: isNfce ? 'Cupom Fiscal (NFC-e) Emitido com Sucesso!' : 'NF-e Autorizada com Sucesso!',
        description: `Chave: ${resultado.chaveAcesso.slice(0, 15)}... Pronto para impressão.`,
      });

      setVendaParaEmitir(null);
      // Abre o DANFE/Cupom diretamente para conferência e impressão
      setDanfeAtivo({ dados: docData, resultado });
    } catch (err: any) {
      toast({
        title: 'Erro na emissão fiscal',
        description: err.message || 'Verifique os dados cadastrais da empresa e tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setEmitindo(false);
    }
  };

  const handleConfirmarCancelamento = async () => {
    if (!docParaCancelar) return;
    const just = justificativaCancelamento.trim();
    if (just.length < 15) {
      toast({
        title: 'Justificativa muito curta',
        description: 'A SEFAZ exige no mínimo 15 caracteres para cancelar NF-e ou NFC-e.',
        variant: 'destructive',
      });
      return;
    }

    setCancelando(true);
    try {
      const { venda, nfeRecord } = docParaCancelar;
      const tipoDoc: TipoDocumentoFiscal = (nfeRecord?.tipo || venda.tipo_documento_fiscal) === 'nfce' ? 'nfce' : 'nfe';
      const ambiente = (config?.['nfe_ambiente'] || 'producao') as 'homologacao' | 'producao';
      const res = await cancelarDocumentoFiscal({
        vendaId: venda.id,
        vendaNumero: venda.numero,
        chaveAcesso: nfeRecord?.chaveAcesso || venda.nfe_chave || '',
        numero: nfeRecord?.numero || Number(venda.nfe_numero || 1),
        serie: nfeRecord?.serie || '1',
        tipo: tipoDoc,
        justificativa: just,
        ambiente,
        tokenFocus: config?.['nfe_focus_token'],
      });

      queryClient.invalidateQueries({ queryKey: ['vendas'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-nfes'] });
      queryClient.invalidateQueries({ queryKey: ['nfe_importadas'] });

      toast({
        title: tipoDoc === 'nfce' ? 'Cupom Fiscal (NFC-e) cancelado!' : 'NF-e cancelada!',
        description: `Protocolo: ${res.protocoloCancelamento}`,
      });
      setDocParaCancelar(null);
      setJustificativaCancelamento('');
    } catch (err: any) {
      toast({
        title: 'Erro ao cancelar documento fiscal',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setCancelando(false);
    }
  };

  // Abrir documento já emitido anteriormente (NFC-e ou NF-e)
  const handleAbrirDanfeExistente = (venda: VendaDB, nfeRecord?: NFeResultado | null) => {
    const isNfce = (nfeRecord?.tipo || venda.tipo_documento_fiscal) === 'nfce';
    const freteVal = Number(venda.frete_valor) || 0;

    const nfeData: NFeVendaData = {
      vendaId: venda.id,
      vendaNumero: venda.numero,
      dataEmissao: new Date(nfeRecord?.dataAutorizacao || venda.created_at),
      naturezaOperacao: isNfce ? 'VENDA AO CONSUMIDOR' : (config?.['nfe_natureza_operacao'] || 'Venda de mercadoria adquirida de terceiros'),
      serie: nfeRecord?.serie || '1',
      numero: nfeRecord?.numero || Number(venda.nfe_numero || 1),
      modelo: isNfce ? '65' : '55',
      tipo: isNfce ? 'nfce' : 'nfe',
      ambiente: (config?.['nfe_ambiente'] || 'producao') as 'homologacao' | 'producao',
      formaPagamento: venda.forma_pagamento || 'Dinheiro',
      freteModalidade: freteVal > 0 ? 0 : 9,
      freteTransportadora: venda.frete_transportadora,
      freteValor: freteVal,
      totalProdutos: Number(venda.total) - freteVal,
      totalVenda: Number(venda.total),
      emitente: {
        cnpj: config?.['empresa_cnpj'] || '00.000.000/0000-00',
        razaoSocial: config?.['empresa_nome'] || 'G Autopeças & Acessórios',
        nomeFantasia: config?.['empresa_nome_fantasia'] || 'G Autopeças & Acessórios',
        ie: config?.['empresa_ie'] || 'ISENTO',
        endereco: config?.['empresa_endereco'] || 'Rua Principal',
        cidade: config?.['empresa_cidade'] || 'Campo Grande',
        uf: config?.['empresa_uf'] || 'MS',
        cep: config?.['empresa_cep'] || '79000-000',
        telefone: config?.['empresa_telefone'] || '',
        email: config?.['empresa_email'] || '',
        regimeTributario: config?.['nfe_regime_tributario'] || '1',
      },
      destinatario: {
        nome: venda.cliente_nome || 'CONSUMIDOR FINAL',
        cpfCnpj: (venda as any).cliente_cpf_cnpj || '',
      },
      itens: [
        {
          id: '1',
          codigo: 'PRD-01',
          descricao: `Itens da Venda ${venda.numero}`,
          ncm: '87082999',
          cfop: config?.['nfe_cfop_padrao'] || '5102',
          unidade: 'UN',
          quantidade: 1,
          valorUnitario: Number(venda.total) - freteVal,
          valorTotal: Number(venda.total) - freteVal,
          icmsAliquota: Number(config?.['icms_percentual'] || 17),
        },
      ],
    };

    const resultado: NFeResultado = nfeRecord || {
      sucesso: true,
      status: 'autorizada',
      modelo: isNfce ? '65' : '55',
      tipo: isNfce ? 'nfce' : 'nfe',
      chaveAcesso: venda.nfe_chave || '50260000000000000000000000000000000000000000',
      numero: Number(venda.nfe_numero || 1),
      serie: '1',
      protocoloAutorizacao: venda.nfe_protocolo || '150260000000000',
      dataAutorizacao: venda.created_at,
      mensagem: isNfce ? 'NFC-e Autorizada' : 'NF-e Autorizada',
      xml: venda.nfe_xml,
    };

    setDanfeAtivo({ dados: nfeData, resultado });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Vendas e Emissão Fiscal</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {vendas?.length ?? 0} vendas realizadas · Emissão de Cupom Fiscal (NFC-e) e NF-e
          </p>
        </div>

        {config?.['empresa_cnpj'] && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border text-xs text-muted-foreground">
            <span className={cn(
              "h-2 w-2 rounded-full",
              config?.['nfe_ambiente'] === 'producao' ? "bg-emerald-500" : "bg-amber-500"
            )} />
            <span>SEFAZ: {config?.['nfe_ambiente'] === 'producao' ? 'Produção (Real)' : 'Homologação (Testes)'}</span>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : !vendas?.length ? (
        <div className="rounded-xl border bg-card shadow-sm py-16 text-center">
          <ShoppingCart size={40} className="mx-auto mb-3 text-muted-foreground/30" />
          <p className="font-semibold text-muted-foreground">Nenhuma venda registrada</p>
          <p className="text-sm text-muted-foreground/70 mt-1">As vendas aparecerão aqui quando orçamentos forem finalizados</p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b">
            <ShoppingCart size={16} className="text-primary" />
            <h2 className="font-semibold text-sm">Histórico de Vendas & Documentos Fiscais</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nº Venda</th>
                  <th>Cliente</th>
                  <th>Data</th>
                  <th>Total</th>
                  <th>Pagamento</th>
                  <th>Documento Fiscal</th>
                  <th className="text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {vendas.map(v => {
                  const nfeRecord = getVendaNFeRecord(v.id);
                  const isCancelada = nfeRecord?.status === 'cancelada' || v.nfe_status === 'cancelada';
                  const isEmitida = !isCancelada && (nfeRecord?.status === 'autorizada' || v.nfe_status === 'autorizada');
                  const isNfce = (nfeRecord?.tipo || v.tipo_documento_fiscal) === 'nfce';
                  const numDoc = nfeRecord?.numero || v.nfe_numero;

                  return (
                    <tr key={v.id}>
                      <td className="font-mono text-xs font-semibold text-primary">{v.numero}</td>
                      <td className="font-medium">{v.cliente_nome}</td>
                      <td className="text-muted-foreground text-sm">
                        {new Date(v.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="font-semibold">{fmt(v.total)}</td>
                      <td>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-muted text-muted-foreground">
                          {v.forma_pagamento}
                        </span>
                      </td>

                      {/* Coluna de Status do Documento Fiscal */}
                      <td>
                        {isCancelada ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-red-500/15 text-red-600">
                            <XCircle size={12} />
                            {isNfce ? 'NFC-e' : 'NF-e'} Nº {numDoc} Cancelada
                          </span>
                        ) : isEmitida ? (
                          <div className="flex items-center gap-1.5">
                            {isNfce ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-500/15 text-emerald-600">
                                <Receipt size={12} />
                                NFC-e Nº {numDoc}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-blue-500/15 text-blue-600">
                                <FileText size={12} />
                                NF-e Nº {numDoc}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-slate-500/10 text-muted-foreground">
                            Não emitida
                          </span>
                        )}
                      </td>

                      {/* Botões de Ação */}
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {(isEmitida || isCancelada) ? (
                            <>
                              <button
                                onClick={() => handleAbrirDanfeExistente(v, nfeRecord)}
                                className={cn(
                                  "px-2.5 py-1 text-xs font-semibold rounded-md text-white transition-colors flex items-center gap-1 shadow-sm",
                                  isCancelada ? "bg-slate-600 hover:bg-slate-500" : isNfce ? "bg-emerald-600 hover:bg-emerald-500" : "bg-blue-600 hover:bg-blue-500"
                                )}
                                title={isNfce ? "Visualizar e Imprimir Cupom Fiscal (80mm)" : "Visualizar e Imprimir DANFE A4"}
                              >
                                {isNfce ? <Receipt size={13} /> : <Printer size={13} />}
                                {isNfce ? 'Cupom Fiscal' : 'DANFE'}
                              </button>
                              {(nfeRecord?.xml || v.nfe_xml) && (
                                <button
                                  onClick={() => baixarXmlNFe(nfeRecord?.chaveAcesso || v.nfe_chave || '', nfeRecord?.xml || v.nfe_xml, isNfce ? 'nfce' : 'nfe')}
                                  className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                  title="Baixar XML oficial"
                                >
                                  <Download size={14} />
                                </button>
                              )}
                              {isEmitida && (
                                <button
                                  onClick={() => {
                                    setDocParaCancelar({ venda: v, nfeRecord });
                                    setJustificativaCancelamento('');
                                  }}
                                  className="px-2 py-1 text-xs font-semibold rounded-md border border-red-500/40 text-red-600 hover:bg-red-500/10 transition-colors flex items-center gap-1"
                                  title={`Cancelar ${isNfce ? 'Cupom Fiscal (NFC-e)' : 'Nota Fiscal (NF-e)'} na SEFAZ`}
                                >
                                  <XCircle size={13} />
                                  Cancelar
                                </button>
                              )}
                              {isCancelada && (
                                <button
                                  onClick={() => handleAbrirEmissao(v, isNfce ? 'nfce' : 'nfe')}
                                  className="px-2 py-1 text-xs font-semibold rounded-md border hover:bg-muted transition-colors"
                                  title="Emitir novo documento fiscal para esta venda"
                                >
                                  Reemitir
                                </button>
                              )}
                            </>
                          ) : (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleAbrirEmissao(v, 'nfce')}
                                className="px-2.5 py-1 text-xs font-semibold rounded-md bg-emerald-600 text-white hover:bg-emerald-500 transition-colors flex items-center gap-1 shadow-sm"
                                title="Emitir Cupom Fiscal (NFC-e) para consumidor balcão"
                              >
                                <Receipt size={13} />
                                Cupom (NFC-e)
                              </button>
                              <button
                                onClick={() => handleAbrirEmissao(v, 'nfe')}
                                className="px-2.5 py-1 text-xs font-semibold rounded-md border hover:bg-muted transition-colors flex items-center gap-1 shadow-sm"
                                title="Emitir NF-e (DANFE A4) completa"
                              >
                                <FileText size={13} />
                                NF-e
                              </button>
                            </div>
                          )}

                          <button
                            onClick={() => setSelectedId(v.id)}
                            className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                            title="Ver detalhes da venda"
                          >
                            <Eye size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de Confirmação e Emissão Fiscal */}
      {vendaParaEmitir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="relative bg-background rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto border">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-background z-10">
              <div className="flex items-center gap-2">
                {tipoDocumentoEmissao === 'nfce' ? (
                  <Receipt className="text-emerald-500" size={20} />
                ) : (
                  <FileText className="text-primary" size={20} />
                )}
                <h2 className="font-bold text-lg">
                  Emitir {tipoDocumentoEmissao === 'nfce' ? 'Cupom Fiscal (NFC-e)' : 'Nota Fiscal (NF-e)'} · Venda {vendaParaEmitir.numero}
                </h2>
              </div>
              <button
                onClick={() => setVendaParaEmitir(null)}
                disabled={emitindo}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Seletor de Tipo de Documento: NFC-e ou NF-e */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Escolha o Tipo de Documento Fiscal
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setTipoDocumentoEmissao('nfce')}
                    className={cn(
                      "p-3.5 rounded-xl border text-left transition-all",
                      tipoDocumentoEmissao === 'nfce'
                        ? "border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/30"
                        : "border-border hover:bg-muted/50"
                    )}
                  >
                    <div className="flex items-center gap-2 font-bold text-sm text-foreground">
                      <Receipt size={16} className="text-emerald-600" />
                      Cupom Fiscal (NFC-e)
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Modelo 65 · Varejo e Balcão. Emissão rápida em bobina 80mm com QR Code.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTipoDocumentoEmissao('nfe')}
                    className={cn(
                      "p-3.5 rounded-xl border text-left transition-all",
                      tipoDocumentoEmissao === 'nfe'
                        ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                        : "border-border hover:bg-muted/50"
                    )}
                  >
                    <div className="flex items-center gap-2 font-bold text-sm text-foreground">
                      <FileText size={16} className="text-primary" />
                      Nota Fiscal (NF-e)
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Modelo 55 · DANFE A4 tradicional. Obrigatória para transporte de carga e PJ.
                    </p>
                  </button>
                </div>
              </div>

              {/* Alerta de Ambiente SEFAZ */}
              <div className={cn(
                "p-3 rounded-xl border text-xs flex items-center justify-between",
                config?.['nfe_ambiente'] === 'producao'
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                  : "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400"
              )}>
                <div className="flex items-center gap-2">
                  <AlertCircle size={16} />
                  <span>
                    Ambiente:{' '}
                    <strong>{config?.['nfe_ambiente'] === 'producao' ? 'Produção SEFAZ Oficial (Nota Real)' : 'Homologação SEFAZ (Ambiente de Testes)'}</strong>
                  </span>
                </div>
                <span className="font-mono text-[11px]">
                  {tipoDocumentoEmissao === 'nfce' ? (
                    `NFC-e Série ${config?.['nfce_serie'] || '1'} · Nº ${config?.['nfce_proximo_numero'] || '1'}`
                  ) : (
                    `NF-e Série ${config?.['nfe_serie'] || '1'} · Nº ${config?.['nfe_proximo_numero'] || '1'}`
                  )}
                </span>
              </div>

              {/* Dados do Destinatário / Consumidor */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {tipoDocumentoEmissao === 'nfce' ? 'Dados do Consumidor (Opcional)' : 'Dados do Destinatário (Cliente)'}
                  </h3>
                  {tipoDocumentoEmissao === 'nfce' && (
                    <button
                      type="button"
                      onClick={() => setDestinatarioForm(f => ({ ...f, nome: 'CONSUMIDOR FINAL', cpfCnpj: '' }))}
                      className="text-[11px] text-primary hover:underline flex items-center gap-1"
                    >
                      <UserCheck size={12} /> Consumidor Não Identificado
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium mb-1">Nome / Razão Social</label>
                    <input
                      type="text"
                      value={destinatarioForm.nome}
                      onChange={e => setDestinatarioForm(f => ({ ...f, nome: e.target.value }))}
                      className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                      placeholder={tipoDocumentoEmissao === 'nfce' ? "CONSUMIDOR FINAL ou Nome" : "Nome do cliente ou empresa"}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">
                      CPF ou CNPJ {tipoDocumentoEmissao === 'nfce' && '(Opcional no cupom)'}
                    </label>
                    <input
                      type="text"
                      value={destinatarioForm.cpfCnpj}
                      onChange={e => setDestinatarioForm(f => ({ ...f, cpfCnpj: e.target.value }))}
                      className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono"
                      placeholder="000.000.000-00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Telefone</label>
                    <input
                      type="text"
                      value={destinatarioForm.telefone}
                      onChange={e => setDestinatarioForm(f => ({ ...f, telefone: e.target.value }))}
                      className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                      placeholder="(00) 00000-0000"
                    />
                  </div>

                  {tipoDocumentoEmissao === 'nfe' && (
                    <>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium mb-1">Endereço de Entrega</label>
                        <input
                          type="text"
                          value={destinatarioForm.endereco}
                          onChange={e => setDestinatarioForm(f => ({ ...f, endereco: e.target.value }))}
                          className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                          placeholder="Rua, número, bairro"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">Cidade</label>
                        <input
                          type="text"
                          value={destinatarioForm.cidade}
                          onChange={e => setDestinatarioForm(f => ({ ...f, cidade: e.target.value }))}
                          className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium mb-1">UF</label>
                          <input
                            type="text"
                            maxLength={2}
                            value={destinatarioForm.uf}
                            onChange={e => setDestinatarioForm(f => ({ ...f, uf: e.target.value.toUpperCase() }))}
                            className="w-full rounded-lg border bg-background px-3 py-2 text-sm uppercase text-center"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">CEP</label>
                          <input
                            type="text"
                            value={destinatarioForm.cep}
                            onChange={e => setDestinatarioForm(f => ({ ...f, cep: e.target.value }))}
                            className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono"
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Itens e Totais */}
              <div className="space-y-2 border-t pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Itens a Transmitir ({itensParaEmitir?.length ?? 0})
                </h3>
                <div className="max-h-36 overflow-y-auto space-y-1.5 border rounded-lg p-2.5 bg-muted/20 text-xs">
                  {(itensParaEmitir ?? []).map((it, idx) => (
                    <div key={it.id || idx} className="flex items-center justify-between py-1 border-b last:border-0">
                      <div>
                        <span className="font-medium">{it.produto_nome}</span>
                        <span className="text-muted-foreground ml-2">({it.quantidade}x {fmt(it.preco_unitario)})</span>
                      </div>
                      <span className="font-semibold">{fmt(it.subtotal)}</span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center pt-2">
                  <div className="text-xs text-muted-foreground">
                    Frete:{' '}
                    <strong>
                      {Number(vendaParaEmitir.frete_valor) > 0 ? fmt(Number(vendaParaEmitir.frete_valor)) : 'Sem frete'}
                    </strong>
                    {vendaParaEmitir.frete_transportadora ? ` (${vendaParaEmitir.frete_transportadora})` : ''}
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-muted-foreground mr-2">
                      Total {tipoDocumentoEmissao === 'nfce' ? 'da NFC-e' : 'da NF-e'}:
                    </span>
                    <span className="text-lg font-bold text-primary">{fmt(vendaParaEmitir.total)}</span>
                  </div>
                </div>
              </div>

              {/* Botão de Envio */}
              <div className="pt-2 flex justify-end gap-3 border-t">
                <button
                  type="button"
                  onClick={() => setVendaParaEmitir(null)}
                  disabled={emitindo}
                  className="px-4 py-2 text-sm rounded-lg border hover:bg-muted transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmarEmissao}
                  disabled={emitindo}
                  className={cn(
                    "px-5 py-2 text-sm font-semibold rounded-lg text-white transition-colors flex items-center gap-2 shadow-sm disabled:opacity-60",
                    tipoDocumentoEmissao === 'nfce' ? "bg-emerald-600 hover:bg-emerald-500" : "bg-primary hover:bg-primary/90"
                  )}
                >
                  {emitindo ? <Loader2 className="animate-spin" size={16} /> : (tipoDocumentoEmissao === 'nfce' ? <Receipt size={16} /> : <Send size={16} />)}
                  {emitindo
                    ? 'Transmitindo para a SEFAZ…'
                    : tipoDocumentoEmissao === 'nfce'
                      ? 'Autorizar e Imprimir Cupom (NFC-e)'
                      : 'Autorizar e Gerar DANFE (NF-e)'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Cancelamento de NFC-e / NF-e */}
      {docParaCancelar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="relative bg-background rounded-2xl shadow-xl w-full max-w-md border overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b bg-red-500/5">
              <div className="flex items-center gap-2">
                <XCircle className="text-red-600" size={20} />
                <h2 className="font-bold text-base">
                  Cancelar {(docParaCancelar.nfeRecord?.tipo || docParaCancelar.venda.tipo_documento_fiscal) === 'nfce' ? 'Cupom Fiscal (NFC-e)' : 'Nota Fiscal (NF-e)'}
                </h2>
              </div>
              <button
                onClick={() => setDocParaCancelar(null)}
                disabled={cancelando}
                className="p-1.5 rounded-lg hover:bg-muted"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="rounded-lg border bg-muted/20 p-3 text-xs space-y-1">
                <p><strong>Venda:</strong> {docParaCancelar.venda.numero} · {docParaCancelar.venda.cliente_nome}</p>
                <p><strong>Documento Nº:</strong> {docParaCancelar.nfeRecord?.numero || docParaCancelar.venda.nfe_numero}</p>
                <p className="font-mono text-[11px] text-muted-foreground break-all">
                  Chave: {docParaCancelar.nfeRecord?.chaveAcesso || docParaCancelar.venda.nfe_chave}
                </p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Justificativa do Cancelamento (SEFAZ) *
                  </label>
                  <span className={cn(
                    "text-[11px] font-mono",
                    justificativaCancelamento.trim().length >= 15 ? "text-emerald-600" : "text-amber-600"
                  )}>
                    {justificativaCancelamento.trim().length}/15 mín.
                  </span>
                </div>
                <textarea
                  value={justificativaCancelamento}
                  onChange={e => setJustificativaCancelamento(e.target.value)}
                  rows={3}
                  placeholder="Ex: Erro no preenchimento dos dados ou desistência da compra pelo cliente."
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30"
                />
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setDocParaCancelar(null)}
                  disabled={cancelando}
                  className="px-4 py-2 rounded-lg border text-sm font-medium hover:bg-muted"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmarCancelamento}
                  disabled={cancelando || justificativaCancelamento.trim().length < 15}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
                >
                  {cancelando && <Loader2 size={14} className="animate-spin" />}
                  Confirmar Cancelamento
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Visualizador de Documentos Fiscais */}
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
