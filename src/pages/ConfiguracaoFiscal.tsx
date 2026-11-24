import React, { useState, useEffect } from 'react';
import {
  FileText, Building2, Receipt, ShieldCheck, Key, Percent,
  Save, Loader2, CheckCircle2, AlertCircle, MapPin, Landmark,
  DownloadCloud, Globe, Eye, EyeOff
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAppContext } from '@/components/Layout';
import { cn } from '@/lib/utils';
import CertificadoA1 from '@/components/CertificadoA1';

const FISCAL_KEYS = [
  'empresa_nome',
  'empresa_nome_fantasia',
  'empresa_cnpj',
  'empresa_ie',
  'empresa_im',
  'empresa_cnae',
  'empresa_endereco',
  'empresa_numero',
  'empresa_bairro',
  'empresa_cidade',
  'empresa_cmun', // Código IBGE do Município (5002704 = Campo Grande/MS)
  'empresa_uf',
  'empresa_cep',
  'empresa_telefone',
  'empresa_email',
  // Tributação e CRT
  'nfe_ambiente', // 'homologacao' | 'producao'
  'nfe_regime_tributario', // '1' - Simples Nacional, '3' - Regime Normal
  // NFC-e (Modelo 65)
  'nfce_serie',
  'nfce_proximo_numero',
  'nfce_id_csc',
  'nfce_csc',
  // NF-e (Modelo 55)
  'nfe_serie',
  'nfe_proximo_numero',
  'nfe_natureza_operacao',
  'nfe_cfop_padrao',
  'nfe_cfop_interestadual',
  // API Fiscal e DFe
  'nfe_focus_token',
  // Alíquotas
  'icms_percentual',
  'ipi_percentual',
  'pis_percentual',
  'cofins_percentual',
];

type FiscalTab = 'geral' | 'nfce' | 'nfe' | 'certificado' | 'dfe' | 'tributos';

export default function ConfiguracaoFiscal() {
  const { userRole } = useAppContext();
  const isAdmin = userRole === 'admin';
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [tabAtiva, setTabAtiva] = useState<FiscalTab>('geral');
  const [form, setForm] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const { data: config, isLoading } = useQuery({
    queryKey: ['configuracoes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('configuracoes').select('chave, valor');
      if (error) throw error;
      const map: Record<string, string> = {};
      (data ?? []).forEach((r: any) => { map[r.chave] = r.valor; });
      return map;
    },
  });

  useEffect(() => {
    if (config) {
      setForm(config);
      setDirty(false);
    }
  }, [config]);

  const update = (key: string, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const rows = FISCAL_KEYS.map(key => ({
        chave: key,
        valor: form[key] ?? '',
        updated_at: new Date().toISOString(),
      }));
      const { error } = await (supabase as any)
        .from('configuracoes')
        .upsert(rows, { onConflict: 'chave' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configuracoes'] });
      setDirty(false);
      toast({
        title: 'Configurações Fiscais salvas!',
        description: 'Os parâmetros da SEFAZ, NFC-e e NF-e foram atualizados com sucesso.',
      });
    },
    onError: (err: any) => {
      toast({ title: 'Erro ao salvar configurações fiscais', description: err.message, variant: 'destructive' });
    },
  });

  const renderField = (label: string, key: string, placeholder = '', type = 'text', helper = '') => (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </label>
      <input
        type={type}
        value={form[key] ?? ''}
        onChange={e => update(key, e.target.value)}
        placeholder={placeholder}
        disabled={!isAdmin}
        className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60 transition-all font-mono"
      />
      {helper && <p className="text-[11px] text-muted-foreground mt-1">{helper}</p>}
    </div>
  );

  const ambienteAtual = form['nfe_ambiente'] || 'homologacao';
  const regimeAtual = form['nfe_regime_tributario'] || '1';

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header com Ações */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Landmark className="text-primary" size={24} />
            <h1 className="text-2xl font-bold text-foreground">Configuração Fiscal (SEFAZ)</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Gestão do Certificado Digital A1, parâmetros da NFC-e (Mod 65), NF-e (Mod 55) e download de notas emitidas contra o CNPJ.
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={() => saveMutation.mutate()}
            disabled={!dirty || saveMutation.isPending}
            className={cn(
              "btn-primary flex items-center gap-2 px-5 py-2.5 shadow-sm text-sm font-semibold rounded-lg transition-all",
              dirty ? "animate-pulse" : "opacity-70 cursor-not-allowed"
            )}
          >
            {saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saveMutation.isPending ? 'Salvando…' : dirty ? 'Salvar Alterações Fiscais' : 'Configurações Salvas'}
          </button>
        )}
      </div>

      {/* Cards de Status Rápido */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground font-semibold uppercase">Ambiente SEFAZ</p>
          <div className="flex items-center gap-2 mt-1">
            <span className={cn(
              "h-2.5 w-2.5 rounded-full",
              ambienteAtual === 'producao' ? "bg-emerald-500" : "bg-amber-500"
            )} />
            <span className="font-bold text-sm">
              {ambienteAtual === 'producao' ? 'Produção (Oficial)' : 'Homologação (Testes)'}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {ambienteAtual === 'producao' ? 'Notas com valor fiscal' : 'SEFAZ de testes sem validade'}
          </p>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground font-semibold uppercase">Regime Tributário</p>
          <p className="font-bold text-sm mt-1">
            {regimeAtual === '1' ? '1 - Simples Nacional' : regimeAtual === '2' ? '2 - Sublimite Simples' : regimeAtual === '4' ? '4 - MEI (Simples Nacional)' : '3 - Regime Normal'}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {regimeAtual === '4' ? 'Microempreendedor Individual' : regimeAtual === '1' ? 'ME / EPP optante' : 'Regime de Apuração'}
          </p>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground font-semibold uppercase">Próxima NFC-e (Balcão)</p>
          <p className="font-bold text-sm mt-1 text-emerald-600 font-mono">
            Série {form['nfce_serie'] || '1'} · Nº {form['nfce_proximo_numero'] || '1'}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Modelo 65 · Cupom</p>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground font-semibold uppercase">Próxima NF-e (A4)</p>
          <p className="font-bold text-sm mt-1 text-blue-600 font-mono">
            Série {form['nfe_serie'] || '1'} · Nº {form['nfe_proximo_numero'] || '1'}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Modelo 55 · Danfe</p>
        </div>
      </div>

      {/* Navegação por Abas */}
      <div className="flex border-b border-border overflow-x-auto gap-2">
        {[
          { id: 'geral', label: 'Emitente & Endereço', icon: Building2 },
          { id: 'certificado', label: 'Certificado Digital A1', icon: ShieldCheck },
          { id: 'nfce', label: 'Cupom Fiscal (NFC-e)', icon: Receipt },
          { id: 'nfe', label: 'Nota Fiscal (NF-e)', icon: FileText },
          { id: 'dfe', label: 'SEFAZ & Baixa contra CNPJ', icon: DownloadCloud },
          { id: 'tributos', label: 'Alíquotas de Impostos', icon: Percent },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTabAtiva(id as FiscalTab)}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 whitespace-nowrap transition-colors",
              tabAtiva === id
                ? "border-primary text-primary bg-primary/5 rounded-t-lg"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-6">

          {/* ABA 1: Emitente & Endereço Fiscal */}
          {tabAtiva === 'geral' && (
            <div className="space-y-6 animate-fade-in">
              <div className="rounded-xl border bg-card p-5 space-y-4 shadow-sm">
                <div className="flex items-center gap-2 border-b pb-3">
                  <Building2 size={18} className="text-primary" />
                  <h2 className="font-semibold text-sm">Dados Oficiais da Empresa (Emitente)</h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    {renderField("Razão Social", "empresa_nome", "Razão Social conforme Cartão CNPJ")}
                  </div>
                  <div>
                    {renderField("Nome Fantasia", "empresa_nome_fantasia", "Nome Fantasia da Loja")}
                  </div>
                  <div>
                    {renderField("CNPJ da Empresa", "empresa_cnpj", "00.000.000/0000-00", "text", "Apenas números ou formatado")}
                  </div>
                  <div>
                    {renderField("Inscrição Estadual (IE)", "empresa_ie", "ISENTO ou número da IE")}
                  </div>
                  <div>
                    {renderField("Inscrição Municipal (IM)", "empresa_im", "Opcional")}
                  </div>
                  <div>
                    {renderField("CNAE Principal", "empresa_cnae", "4530-7/03 - Comércio de autopeças")}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      Regime Tributário (CRT)
                    </label>
                    <select
                      value={form['nfe_regime_tributario'] || '1'}
                      onChange={e => update('nfe_regime_tributario', e.target.value)}
                      disabled={!isAdmin}
                      className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="1">1 - Simples Nacional (Microempresa ou EPP)</option>
                      <option value="2">2 - Simples Nacional - Excesso de Sublimite de Receita</option>
                      <option value="4">4 - Simples Nacional - Microempreendedor Individual (MEI)</option>
                      <option value="3">3 - Regime Normal (Lucro Presumido ou Lucro Real)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Endereço Fiscal para SEFAZ */}
              <div className="rounded-xl border bg-card p-5 space-y-4 shadow-sm">
                <div className="flex items-center gap-2 border-b pb-3">
                  <MapPin size={18} className="text-primary" />
                  <h2 className="font-semibold text-sm">Endereço Fiscal (Validação SEFAZ)</h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="sm:col-span-3">
                    {renderField("Logradouro", "empresa_endereco", "Ex: Av. Coronel Antonino")}
                  </div>
                  <div>
                    {renderField("Número", "empresa_numero", "Ex: 1234")}
                  </div>
                  <div>
                    {renderField("Bairro", "empresa_bairro", "Centro")}
                  </div>
                  <div>
                    {renderField("Cidade / Município", "empresa_cidade", "Campo Grande")}
                  </div>
                  <div>
                    {renderField("UF", "empresa_uf", "MS")}
                  </div>
                  <div>
                    {renderField("Código IBGE do Município (cMun)", "empresa_cmun", "5002704", "text", "Campo Grande/MS: 5002704")}
                  </div>
                  <div>
                    {renderField("CEP", "empresa_cep", "79000-000")}
                  </div>
                  <div>
                    {renderField("Telefone da Loja", "empresa_telefone", "(67) 3333-0000")}
                  </div>
                  <div className="sm:col-span-2">
                    {renderField("E-mail para XMLs", "empresa_email", "fiscal@autopecasmgn.com.br")}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ABA 2: Certificado Digital A1 */}
          {tabAtiva === 'certificado' && (
            <div className="space-y-4 animate-fade-in">
              <div className="rounded-xl border bg-card p-5 space-y-4 shadow-sm">
                <div className="flex items-center justify-between border-b pb-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={20} className="text-emerald-500" />
                    <div>
                      <h2 className="font-semibold text-sm">Certificado Digital ICP-Brasil A1 (.pfx / .p12)</h2>
                      <p className="text-xs text-muted-foreground">Necessário para assinar XMLs, emitir NFC-e / NF-e e consultar notas contra o CNPJ</p>
                    </div>
                  </div>
                </div>

                <CertificadoA1 />
              </div>
            </div>
          )}

          {/* ABA 3: Cupom Fiscal (NFC-e - Mod 65) */}
          {tabAtiva === 'nfce' && (
            <div className="rounded-xl border bg-card p-5 space-y-5 shadow-sm animate-fade-in">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <Receipt size={20} className="text-emerald-600" />
                  <div>
                    <h2 className="font-semibold text-sm">NFC-e · Nota Fiscal de Consumidor Eletrônica (Modelo 65)</h2>
                    <p className="text-xs text-muted-foreground">Documento emitido no balcão e impresso em bobina térmica de 80mm com QR Code</p>
                  </div>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-600">
                  Bobina 80mm
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {renderField("Série da NFC-e", "nfce_serie", "1", "text", "Geralmente série 1")}
                {renderField("Próximo Número NFC-e", "nfce_proximo_numero", "1", "number", "Sequencial da próxima emissão")}
                {renderField("ID do Token CSC", "nfce_id_csc", "000001", "text", "Ex: 000001 (fornecido pela SEFAZ)")}
                {renderField("Código Token CSC (SEFAZ)", "nfce_csc", "Código alfanumérico do CSC", "password", "Segurança do QR Code")}
              </div>

              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 text-xs space-y-1.5 text-muted-foreground">
                <p className="font-semibold text-emerald-700 dark:text-emerald-400">
                  ℹ️ O que é o Código CSC da SEFAZ?
                </p>
                <p>
                  O <strong>CSC (Código de Segurança do Contribuinte)</strong> e o <strong>ID do Token</strong> são gerados no portal da SEFAZ do seu Estado. Eles são obrigatórios para validar o QR Code impresso no cupom fiscal para que o consumidor possa consultar a nota no smartphone.
                </p>
              </div>
            </div>
          )}

          {/* ABA 4: Nota Fiscal Eletrônica (NF-e - Mod 55) */}
          {tabAtiva === 'nfe' && (
            <div className="rounded-xl border bg-card p-5 space-y-5 shadow-sm animate-fade-in">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <FileText size={20} className="text-primary" />
                  <div>
                    <h2 className="font-semibold text-sm">NF-e · Nota Fiscal Eletrônica (Modelo 55)</h2>
                    <p className="text-xs text-muted-foreground">Documento fiscal completo impresso em folha A4 com dados de transportadora e destinatário</p>
                  </div>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded bg-primary/10 text-primary">
                  Formato A4
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {renderField("Série da NF-e", "nfe_serie", "1", "text", "Série padrão")}
                {renderField("Próximo Número NF-e", "nfe_proximo_numero", "1", "number", "Sequencial da próxima NF-e")}
                {renderField("CFOP Estadual Padrão", "nfe_cfop_padrao", "5102", "text", "5102 = Venda dentro do Estado")}
                {renderField("CFOP Interestadual Padrão", "nfe_cfop_interestadual", "6102", "text", "6102 = Venda para fora do Estado")}
              </div>

              <div>
                {renderField("Natureza da Operação Padrão", "nfe_natureza_operacao", "Venda de mercadoria adquirida de terceiros")}
              </div>
            </div>
          )}

          {/* ABA 5: SEFAZ & Baixa contra CNPJ */}
          {tabAtiva === 'dfe' && (
            <div className="rounded-xl border bg-card p-5 space-y-5 shadow-sm animate-fade-in">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <DownloadCloud size={20} className="text-primary" />
                  <div>
                    <h2 className="font-semibold text-sm">Integração SEFAZ & Baixa de Notas Emitidas Contra o CNPJ</h2>
                    <p className="text-xs text-muted-foreground">Ambiente de comunicação e API para download automático de NF-e por chave de acesso</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Ambiente SEFAZ
                  </label>
                  <select
                    value={form['nfe_ambiente'] || 'homologacao'}
                    onChange={e => update('nfe_ambiente', e.target.value)}
                    disabled={!isAdmin}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="homologacao">Homologação (Ambiente de Testes da SEFAZ)</option>
                    <option value="producao">Produção (Ambiente Oficial da SEFAZ - Notas Reais)</option>
                  </select>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Em Produção, todas as transmissões e consultas são registradas oficialmente na Receita Estadual.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Token da API Fiscal (Focus NFe - Opcional)
                  </label>
                  <div className="relative">
                    <input
                      type={showToken ? 'text' : 'password'}
                      value={form['nfe_focus_token'] ?? ''}
                      onChange={e => update('nfe_focus_token', e.target.value)}
                      placeholder="Token para download e transmissão instantânea"
                      className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground pr-10 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Utilizado para consultar e baixar o XML completo das notas emitidas por fornecedores direto da SEFAZ.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl border bg-muted/20 space-y-2">
                <h3 className="font-semibold text-xs uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <CheckCircle2 size={15} className="text-emerald-500" />
                  Como funciona a Baixa de Notas por Chave de Acesso:
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Ao informar a Chave de 44 dígitos na tela <strong>Importar NF-e</strong>, o sistema consulta a SEFAZ, valida o dígito verificador, recupera o XML com todos os produtos, quantidades, NCM e impostos de entrada, e atualiza o seu estoque automaticamente criando o lote correspondente.
                </p>
              </div>
            </div>
          )}

          {/* ABA 6: Alíquotas Padrão */}
          {tabAtiva === 'tributos' && (
            <div className="rounded-xl border bg-card p-5 space-y-5 shadow-sm animate-fade-in">
              <div className="flex items-center gap-2 border-b pb-3">
                <Percent size={18} className="text-primary" />
                <h2 className="font-semibold text-sm">Alíquotas Padrão de Tributos (%)</h2>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {renderField("ICMS Padrão (%)", "icms_percentual", "17", "number")}
                {renderField("PIS Padrão (%)", "pis_percentual", "1.65", "number")}
                {renderField("COFINS Padrão (%)", "cofins_percentual", "7.60", "number")}
                {renderField("IPI Padrão (%)", "ipi_percentual", "0.00", "number")}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
