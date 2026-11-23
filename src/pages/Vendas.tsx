import { useAppContext } from '@/components/Layout';
import { ShoppingCart, Loader2, Eye, X, FileText, Printer, Download, CheckCircle, AlertCircle, Send } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  NFeVendaData,
  NFeResultado,
  getVendaNFeRecord,
  emitirNFe,
  baixarXmlNFe,
} from '@/services/nfeService';
import DanfeModal from '@/components/DanfeModal';

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

  // Estados para Emissão e Visualização de DANFE
  const [vendaParaEmitir, setVendaParaEmitir] = useState<VendaDB | null>(null);
  const { data: itensParaEmitir } = useItensVenda(vendaParaEmitir?.id ?? null);
  const [danfeAtivo, setDanfeAtivo] = useState<{ dados: NFeVendaData; resultado: NFeResultado } | null>(null);
  const [emitindo, setEmitindo] = useState(false);

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
  const handleAbrirEmissao = async (venda: VendaDB) => {
    setVendaParaEmitir(venda);

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

  // Disparo da transmissão da NF-e
  const handleConfirmarEmissao = async () => {
    if (!vendaParaEmitir || !itensParaEmitir) return;

    if (!destinatarioForm.nome.trim()) {
      toast({ title: 'Nome do cliente é obrigatório', variant: 'destructive' });
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
      const serie = config?.['nfe_serie'] || '1';
      const proximoNum = parseInt(config?.['nfe_proximo_numero'] || '1', 10);
      const ambiente = (config?.['nfe_ambiente'] || 'homologacao') as 'homologacao' | 'producao';
      const natOp = config?.['nfe_natureza_operacao'] || 'Venda de mercadoria adquirida de terceiros';
      const cfopPadrao = config?.['nfe_cfop_padrao'] || '5102';
      const tokenFocus = config?.['nfe_focus_token'] || '';

      const freteVal = Number(vendaParaEmitir.frete_valor) || 0;
      const totalItens = itensParaEmitir.reduce((acc, it) => acc + Number(it.subtotal), 0);

      const nfeData: NFeVendaData = {
        vendaId: vendaParaEmitir.id,
        vendaNumero: vendaParaEmitir.numero,
        dataEmissao: new Date(),
        naturezaOperacao: natOp,
        serie,
        numero: proximoNum,
        ambiente,
        formaPagamento: vendaParaEmitir.forma_pagamento || 'Dinheiro',
        freteModalidade: freteVal > 0 ? 0 : 9,
        freteTransportadora: vendaParaEmitir.frete_transportadora,
        freteValor: freteVal,
        totalProdutos: totalItens,
        totalVenda: Number(vendaParaEmitir.total),
        emitente: {
          cnpj: cnpjEmpresa,
          razaoSocial: config?.['empresa_nome'] || 'AutoPeças',
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
          nome: destinatarioForm.nome,
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

      const resultado = await emitirNFe(nfeData, tokenFocus);

      queryClient.invalidateQueries({ queryKey: ['configuracoes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-nfes'] });

      toast({
        title: 'NF-e Autorizada com Sucesso!',
        description: `Chave: ${resultado.chaveAcesso.slice(0, 15)}... Pronto para impressão.`,
      });

      setVendaParaEmitir(null);
      // Abre o DANFE diretamente para conferência e impressão
      setDanfeAtivo({ dados: nfeData, resultado });
    } catch (err: any) {
      toast({
        title: 'Erro na emissão da NF-e',
        description: err.message || 'Verifique os dados cadastrais da empresa e tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setEmitindo(false);
    }
  };

  // Abrir DANFE já emitido anteriormente
  const handleAbrirDanfeExistente = (venda: VendaDB, nfeRecord: NFeResultado) => {
    const freteVal = Number(venda.frete_valor) || 0;
    const nfeData: NFeVendaData = {
      vendaId: venda.id,
      vendaNumero: venda.numero,
      dataEmissao: new Date(nfeRecord.dataAutorizacao || venda.created_at),
      naturezaOperacao: config?.['nfe_natureza_operacao'] || 'Venda de mercadoria adquirida de terceiros',
      serie: nfeRecord.serie || '1',
      numero: nfeRecord.numero,
      ambiente: (config?.['nfe_ambiente'] || 'homologacao') as 'homologacao' | 'producao',
      formaPagamento: venda.forma_pagamento || 'Dinheiro',
      freteModalidade: freteVal > 0 ? 0 : 9,
      freteTransportadora: venda.frete_transportadora,
      freteValor: freteVal,
      totalProdutos: Number(venda.total) - freteVal,
      totalVenda: Number(venda.total),
      emitente: {
        cnpj: config?.['empresa_cnpj'] || '00.000.000/0000-00',
        razaoSocial: config?.['empresa_nome'] || 'AutoPeças',
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
        nome: venda.cliente_nome,
        cpfCnpj: '',
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

    setDanfeAtivo({ dados: nfeData, resultado: nfeRecord });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Vendas e Emissão Fiscal</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {vendas?.length ?? 0} vendas realizadas · Emissão de NF-e e DANFE para transporte
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
            <h2 className="font-semibold text-sm">Histórico de Vendas & Emissão de NF-e</h2>
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
                  <th>NF-e / Transporte</th>
                  <th className="text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {vendas.map(v => {
                  const nfeRecord = getVendaNFeRecord(v.id);
                  const isEmitida = nfeRecord?.status === 'autorizada';

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

                      {/* Coluna de Status da NF-e */}
                      <td>
                        {isEmitida ? (
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-500/15 text-emerald-600">
                              <CheckCircle size={12} />
                              NF-e Nº {nfeRecord.numero}
                            </span>
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
                          {isEmitida ? (
                            <>
                              <button
                                onClick={() => handleAbrirDanfeExistente(v, nfeRecord)}
                                className="px-2.5 py-1 text-xs font-semibold rounded-md bg-emerald-600 text-white hover:bg-emerald-500 transition-colors flex items-center gap-1 shadow-sm"
                                title="Visualizar e Imprimir DANFE"
                              >
                                <Printer size={13} />
                                DANFE
                              </button>
                              {nfeRecord.xml && (
                                <button
                                  onClick={() => baixarXmlNFe(nfeRecord.chaveAcesso, nfeRecord.xml)}
                                  className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                  title="Baixar XML da NF-e"
                                >
                                  <Download size={14} />
                                </button>
                              )}
                            </>
                          ) : (
                            <button
                              onClick={() => handleAbrirEmissao(v)}
                              className="px-2.5 py-1 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1 shadow-sm"
                              title="Emitir NF-e para transporte"
                            >
                              <FileText size={13} />
                              Emitir NF-e
                            </button>
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

      {/* Modal de Confirmação e Emissão de NF-e */}
      {vendaParaEmitir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="relative bg-background rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto border">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-background z-10">
              <div className="flex items-center gap-2">
                <FileText className="text-primary" size={20} />
                <h2 className="font-bold text-lg">Emitir NF-e · Venda {vendaParaEmitir.numero}</h2>
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
              {/* Alerta de Ambiente */}
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
                <span className="font-mono text-[11px]">Série {config?.['nfe_serie'] || '1'} · Nº {config?.['nfe_proximo_numero'] || '1'}</span>
              </div>

              {/* Dados do Destinatário */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Dados do Destinatário (Cliente)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium mb-1">Nome / Razão Social</label>
                    <input
                      type="text"
                      value={destinatarioForm.nome}
                      onChange={e => setDestinatarioForm(f => ({ ...f, nome: e.target.value }))}
                      className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                      placeholder="Nome do cliente"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">CPF ou CNPJ</label>
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
                </div>
              </div>

              {/* Itens e Totais */}
              <div className="space-y-2 border-t pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Itens da Nota Fiscal ({itensParaEmitir?.length ?? 0})
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
                    <span className="text-xs text-muted-foreground mr-2">Total da NF-e:</span>
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
                  className="px-5 py-2 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center gap-2 shadow-sm disabled:opacity-60"
                >
                  {emitindo ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                  {emitindo ? 'Transmitindo para a SEFAZ…' : 'Autorizar e Gerar DANFE'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Visualizador de DANFE para Impressão */}
      {danfeAtivo && (
        <DanfeModal
          dados={danfeAtivo.dados}
          resultado={danfeAtivo.resultado}
          onClose={() => setDanfeAtivo(null)}
        />
      )}

      {/* Detail Modal da Venda */}
      {selectedVenda && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedId(null)} />
          <div className="relative bg-background rounded-2xl shadow-lg w-full max-w-md animate-fade-in max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-background rounded-t-2xl z-10">
              <h2 className="font-bold text-lg">Venda {selectedVenda.numero}</h2>
              <button onClick={() => setSelectedId(null)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="flex justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Cliente</p>
                  <p className="font-semibold">{selectedVenda.cliente_nome}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Pagamento</p>
                  <p className="font-semibold">{selectedVenda.forma_pagamento}</p>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Itens</p>
                <div className="space-y-2">
                  {(itensDetail ?? []).map(item => (
                    <div key={item.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div>
                        <p className="text-sm font-medium">{item.produto_nome}</p>
                        <p className="text-xs text-muted-foreground">{item.produto_codigo} · {item.quantidade}x {fmt(item.preco_unitario)}</p>
                      </div>
                      <p className="font-semibold text-sm">{fmt(item.subtotal)}</p>
                    </div>
                  ))}
                </div>
              </div>

              {Number(selectedVenda.frete_valor) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Frete{selectedVenda.frete_transportadora ? ` (${selectedVenda.frete_transportadora})` : ''}</span>
                  <span className="font-medium">{fmt(Number(selectedVenda.frete_valor))}</span>
                </div>
              )}

              <div className="flex justify-between items-center pt-2 border-t">
                <span className="font-bold">Total</span>
                <span className="text-xl font-bold text-primary">{fmt(selectedVenda.total)}</span>
              </div>

              {/* Seção Fiscal no Modal de Detalhes */}
              <div className="pt-3 border-t">
                {(() => {
                  const nfeRecord = getVendaNFeRecord(selectedVenda.id);
                  if (nfeRecord?.status === 'autorizada') {
                    return (
                      <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                            <CheckCircle size={14} /> NF-e Nº {nfeRecord.numero} Autorizada
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono">Série {nfeRecord.serie}</span>
                        </div>
                        <p className="text-[10px] font-mono text-muted-foreground break-all">
                          {nfeRecord.chaveAcesso}
                        </p>
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => {
                              setSelectedId(null);
                              handleAbrirDanfeExistente(selectedVenda, nfeRecord);
                            }}
                            className="flex-1 py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <Printer size={13} />
                            Imprimir DANFE
                          </button>
                          {nfeRecord.xml && (
                            <button
                              onClick={() => baixarXmlNFe(nfeRecord.chaveAcesso, nfeRecord.xml)}
                              className="py-1.5 px-3 rounded-lg border text-xs font-medium hover:bg-muted flex items-center justify-center gap-1.5 transition-colors"
                            >
                              <Download size={13} />
                              XML
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <button
                      onClick={() => {
                        setSelectedId(null);
                        handleAbrirEmissao(selectedVenda);
                      }}
                      className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors shadow-sm"
                    >
                      <FileText size={15} />
                      Emitir NF-e desta Venda
                    </button>
                  );
                })()}
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
