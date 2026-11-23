import { useState, useEffect } from 'react';
import { Settings, Building2, Percent, Save, Loader2, Receipt, CreditCard, Lock, Eye, EyeOff, FileText, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAppContext } from '@/components/Layout';
import { cn } from '@/lib/utils';
import CertificadoA1 from '@/components/CertificadoA1';

interface ConfigMap {
  [key: string]: string;
}

const CONFIG_KEYS = [
  'empresa_nome',
  'empresa_cnpj',
  'empresa_ie',
  'empresa_endereco',
  'empresa_cidade',
  'empresa_uf',
  'empresa_cep',
  'empresa_telefone',
  'empresa_email',
  'markup_padrao',
  'comissao_percentual',
  'moeda',
  'icms_percentual',
  'ipi_percentual',
  'pis_percentual',
  'cofins_percentual',
  'infinitepay_habilitado',
  'mercadopago_habilitado',
  // Emissão Fiscal (NFC-e e NF-e)
  'nfe_ambiente', // 'homologacao' | 'producao'
  'nfe_regime_tributario', // '1' - Simples Nacional, '3' - Regime Normal
  'nfce_serie', // '1'
  'nfce_proximo_numero', // '1'
  'nfce_id_csc', // '000001'
  'nfce_csc', // Código de Segurança do Contribuinte
  'nfe_serie', // '1'
  'nfe_proximo_numero', // '1'
  'nfe_natureza_operacao', // 'Venda de mercadoria'
  'nfe_cfop_padrao', // '5102'
  'nfe_cfop_interestadual', // '6102'
  'nfe_focus_token',
];

function useConfiguracoes() {
  return useQuery({
    queryKey: ['configuracoes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('configuracoes')
        .select('chave, valor');
      if (error) throw error;
      const map: ConfigMap = {};
      (data ?? []).forEach((r: any) => { map[r.chave] = r.valor; });
      return map;
    },
  });
}

export default function Configuracoes() {
  const { userRole } = useAppContext();
  const isAdmin = userRole === 'admin';
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: config, isLoading } = useConfiguracoes();

  const [form, setForm] = useState<ConfigMap>({});
  const [dirty, setDirty] = useState(false);

  // Alterar senha pessoal
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmaSenha, setConfirmaSenha] = useState('');
  const [showSenha, setShowSenha] = useState(false);
  const [savingSenha, setSavingSenha] = useState(false);

  const handleAlterarSenha = async () => {
    if (!senhaAtual) {
      toast({ title: 'Informe sua senha atual', variant: 'destructive' });
      return;
    }
    if (novaSenha.length < 8 || !/[A-Z]/.test(novaSenha) || !/[0-9]/.test(novaSenha)) {
      toast({ title: 'Senha fraca', description: 'Mínimo 8 caracteres, com uma letra maiúscula e um número.', variant: 'destructive' });
      return;
    }
    if (novaSenha !== confirmaSenha) {
      toast({ title: 'As senhas não coincidem', variant: 'destructive' });
      return;
    }
    if (novaSenha === senhaAtual) {
      toast({ title: 'A nova senha deve ser diferente da atual', variant: 'destructive' });
      return;
    }
    setSavingSenha(true);
    // Reautentica para validar a senha atual
    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email;
    if (!email) {
      setSavingSenha(false);
      toast({ title: 'Sessão inválida. Faça login novamente.', variant: 'destructive' });
      return;
    }
    const { error: signErr } = await supabase.auth.signInWithPassword({ email, password: senhaAtual });
    if (signErr) {
      setSavingSenha(false);
      toast({ title: 'Senha atual incorreta', variant: 'destructive' });
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    setSavingSenha(false);
    if (error) {
      toast({ title: 'Erro ao alterar senha', description: error.message, variant: 'destructive' });
      return;
    }
    setSenhaAtual('');
    setNovaSenha('');
    setConfirmaSenha('');
    toast({ title: 'Senha alterada com sucesso!' });
  };

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
      const rows = CONFIG_KEYS.map(key => ({
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
      toast({ title: 'Configurações salvas com sucesso!' });
    },
    onError: (e: any) => {
      toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const renderField = (label: string, configKey: string, placeholder?: string, type = 'text', disabled = false) => (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
        {label}
      </label>
      <input
        type={type}
        value={form[configKey] ?? ''}
        onChange={e => update(configKey, e.target.value)}
        placeholder={placeholder}
        disabled={disabled || !isAdmin}
        className={cn(
          'w-full rounded-lg border bg-background px-3 py-2.5 text-sm transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'placeholder:text-muted-foreground/50'
        )}
      />
    </div>
  );

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Dados da empresa e preferências do sistema</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => saveMutation.mutate()}
            disabled={!dirty || saveMutation.isPending}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-all',
              'bg-primary text-primary-foreground hover:opacity-90',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              'shadow-sm'
            )}
          >
            {saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Salvar
          </button>
        )}
      </div>

      {/* Dados da Empresa */}
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-2 px-5 py-4 border-b">
          <Building2 size={16} className="text-primary" />
          <h2 className="font-semibold text-sm">Dados da Empresa</h2>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            {renderField("Nome da Empresa / Razão Social", "empresa_nome", "Ex: AutoPeças Central LTDA")}
          </div>
          {renderField("CNPJ", "empresa_cnpj", "00.000.000/0000-00")}
          {renderField("Inscrição Estadual (IE)", "empresa_ie", "Ex: 280000000 ou ISENTO")}
          {renderField("Telefone", "empresa_telefone", "(00) 00000-0000")}
          {renderField("E-mail", "empresa_email", "contato@empresa.com")}
          <div className="sm:col-span-2">
            {renderField("Endereço (Logradouro, Nº e Bairro)", "empresa_endereco", "Ex: Av. Afonso Pena, 1234, Centro")}
          </div>
          {renderField("Cidade / Município", "empresa_cidade", "Ex: Campo Grande")}
          <div className="grid grid-cols-2 gap-2">
            {renderField("UF", "empresa_uf", "MS")}
            {renderField("CEP", "empresa_cep", "79000-000")}
          </div>
        </div>
      </div>

      {isAdmin && <CertificadoA1 />}

      {/* Emissão Fiscal - NFC-e e NF-e */}
      {isAdmin && (
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-primary" />
              <h2 className="font-semibold text-sm">Configuração de Emissão Fiscal (NFC-e e NF-e · SEFAZ)</h2>
            </div>
            <span className={cn(
              "text-xs px-2.5 py-0.5 rounded-full font-semibold",
              (form['nfe_ambiente'] || 'homologacao') === 'producao'
                ? "bg-emerald-500/15 text-emerald-600"
                : "bg-amber-500/15 text-amber-600"
            )}>
              {(form['nfe_ambiente'] || 'homologacao') === 'producao' ? '● Ambiente Produção (Real)' : '○ Ambiente Homologação (Testes)'}
            </span>
          </div>
          <div className="p-5 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Ambiente de Emissão
                </label>
                <select
                  value={form['nfe_ambiente'] || 'homologacao'}
                  onChange={e => update('nfe_ambiente', e.target.value)}
                  disabled={!isAdmin}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="homologacao">Homologação (Testes SEFAZ sem validade jurídica)</option>
                  <option value="producao">Produção (SEFAZ Oficial / Notas Reais)</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  Mantenha em homologação para testar o fluxo de envio e impressão de DANFE.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Regime Tributário (CRT)
                </label>
                <select
                  value={form['nfe_regime_tributario'] || '1'}
                  onChange={e => update('nfe_regime_tributario', e.target.value)}
                  disabled={!isAdmin}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="1">1 - Simples Nacional (ME / EPP)</option>
                  <option value="2">2 - Simples Nacional - Excesso de Sublimite</option>
                  <option value="3">3 - Regime Normal (Lucro Presumido / Lucro Real)</option>
                </select>
              </div>
            </div>

            {/* Seção 1: Cupom Fiscal Eletrônico (NFC-e - Mod 65) */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-primary flex items-center gap-1.5">
                    🧾 Cupom Fiscal Eletrônico (NFC-e · Modelo 65)
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Utilizado no balcão e consumidor final. Emite em bobina térmica de 80mm com QR Code oficial da SEFAZ.
                  </p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-primary/20 text-primary uppercase">
                  Varejo & Balcão
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                {renderField("Série da NFC-e", "nfce_serie", "1")}
                {renderField("Próximo Nº NFC-e", "nfce_proximo_numero", "1", "number")}
                {renderField("Id do Token CSC", "nfce_id_csc", "000001")}
                {renderField("Código CSC (Token SEFAZ)", "nfce_csc", "Código CSC da SEFAZ")}
              </div>
            </div>

            {/* Seção 2: Nota Fiscal Eletrônica (NF-e - Mod 55) */}
            <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-1.5">
                    📄 Nota Fiscal Eletrônica (NF-e · Modelo 55)
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    DANFE completo em folha A4, transporte/frete, vendas PJ e interestaduais.
                  </p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-muted text-muted-foreground uppercase">
                  Transporte & A4
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                {renderField("Série da NF-e", "nfe_serie", "1")}
                {renderField("Próximo Nº NF-e", "nfe_proximo_numero", "1", "number")}
                {renderField("CFOP Estadual", "nfe_cfop_padrao", "5102")}
                {renderField("CFOP Interestadual", "nfe_cfop_interestadual", "6102")}
              </div>

              <div className="pt-1">
                {renderField("Natureza da Operação Padrão", "nfe_natureza_operacao", "Venda de mercadoria adquirida de terceiros")}
              </div>
            </div>

            {/* Seção 3: API Fiscal Integrada */}
            <div className="pt-1">
              {renderField("Token da API Fiscal (Focus NFe - Opcional)", "nfe_focus_token", "Insira seu token para transmissão direta")}
              <p className="text-xs text-muted-foreground mt-1.5">
                Se você possui conta na <strong>Focus NFe</strong>, insira sua chave para transmissão direta em tempo real (NFC-e e NF-e). Caso deixe em branco, o sistema utilizará o motor nativo integrado com o Certificado Digital A1.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Markup e Preços */}
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-2 px-5 py-4 border-b">
          <Percent size={16} className="text-primary" />
          <h2 className="font-semibold text-sm">Markup e Preços</h2>
        </div>
        <div className="p-5 space-y-4">
          <div className="max-w-xs">
            {renderField("Markup Padrão (%)", "markup_padrao", "30", "number")}
            <p className="text-xs text-muted-foreground mt-1.5">
              Percentual aplicado automaticamente ao cadastrar novos produtos.
            </p>
          </div>
          {isAdmin && (
            <div className="max-w-xs">
              {renderField("Comissão de Vendedor (%)", "comissao_percentual", "5", "number")}
              <p className="text-xs text-muted-foreground mt-1.5">
                Percentual de comissão aplicado sobre o valor de cada venda finalizada.
              </p>
            </div>
          )}
          <div className="max-w-xs">
            {renderField("Moeda", "moeda", "BRL", "text", true)}
            <p className="text-xs text-muted-foreground mt-1.5">
              Moeda padrão utilizada em todo o sistema.
            </p>
          </div>
        </div>
      </div>

      {/* Impostos - Regime MS */}
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-2 px-5 py-4 border-b">
          <Receipt size={16} className="text-primary" />
          <h2 className="font-semibold text-sm">Impostos — Regime Tributário MS</h2>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            {renderField("ICMS (%)", "icms_percentual", "17", "number")}
            <p className="text-xs text-muted-foreground mt-1.5">
              Alíquota interna do ICMS para o estado do Mato Grosso do Sul.
            </p>
          </div>
          <div>
            {renderField("IPI (%)", "ipi_percentual", "0", "number")}
            <p className="text-xs text-muted-foreground mt-1.5">
              Imposto sobre Produtos Industrializados.
            </p>
          </div>
          <div>
            {renderField("PIS (%)", "pis_percentual", "1.65", "number")}
            <p className="text-xs text-muted-foreground mt-1.5">
              Contribuição para o Programa de Integração Social.
            </p>
          </div>
          <div>
            {renderField("COFINS (%)", "cofins_percentual", "7.6", "number")}
            <p className="text-xs text-muted-foreground mt-1.5">
              Contribuição para o Financiamento da Seguridade Social.
            </p>
          </div>
        </div>
      </div>

      {/* Gateways de Pagamento */}
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-2 px-5 py-4 border-b">
          <CreditCard size={16} className="text-primary" />
          <h2 className="font-semibold text-sm">Gateways de Pagamento</h2>
        </div>
        <div className="p-5 space-y-6">
          {/* InfinitePay */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm">InfinitePay</p>
                <p className="text-xs text-muted-foreground">Aceite pagamentos via InfinitePay (Crédito, Débito, Pix)</p>
              </div>
              <button
                onClick={() => update('infinitepay_habilitado', form['infinitepay_habilitado'] === 'true' ? 'false' : 'true')}
                disabled={!isAdmin}
                className={cn(
                  'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                  form['infinitepay_habilitado'] === 'true' ? 'bg-primary' : 'bg-muted-foreground/30',
                  !isAdmin && 'opacity-50 cursor-not-allowed'
                )}
              >
                <span className={cn(
                  'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                  form['infinitepay_habilitado'] === 'true' ? 'translate-x-6' : 'translate-x-1'
                )} />
              </button>
            </div>
          </div>

          <div className="border-t" />

          {/* MercadoPago */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm">MercadoPago</p>
                <p className="text-xs text-muted-foreground">Aceite pagamentos via MercadoPago (Crédito, Débito, Pix, Boleto)</p>
              </div>
              <button
                onClick={() => update('mercadopago_habilitado', form['mercadopago_habilitado'] === 'true' ? 'false' : 'true')}
                disabled={!isAdmin}
                className={cn(
                  'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                  form['mercadopago_habilitado'] === 'true' ? 'bg-primary' : 'bg-muted-foreground/30',
                  !isAdmin && 'opacity-50 cursor-not-allowed'
                )}
              >
                <span className={cn(
                  'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                  form['mercadopago_habilitado'] === 'true' ? 'translate-x-6' : 'translate-x-1'
                )} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {!isAdmin && (
        <div className="rounded-lg border border-warning/30 bg-warning-light p-4 text-sm text-warning">
          Apenas administradores podem alterar as configurações.
        </div>
      )}

      {/* Alterar Senha de Acesso */}
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-2 px-5 py-4 border-b">
          <Lock size={16} className="text-primary" />
          <h2 className="font-semibold text-sm">Alterar Senha de Acesso</h2>
        </div>
        <div className="p-5 space-y-4 max-w-md">
          <p className="text-xs text-muted-foreground">
            Altere a senha utilizada para entrar no sistema. Mínimo 8 caracteres, incluindo uma letra maiúscula e um número.
          </p>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Senha atual</label>
            <input
              type={showSenha ? 'text' : 'password'}
              value={senhaAtual}
              onChange={e => setSenhaAtual(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Nova senha</label>
            <div className="relative">
              <input
                type={showSenha ? 'text' : 'password'}
                value={novaSenha}
                onChange={e => setNovaSenha(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border bg-background px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button type="button" onClick={() => setShowSenha(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground">
                {showSenha ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Confirmar nova senha</label>
            <input
              type={showSenha ? 'text' : 'password'}
              value={confirmaSenha}
              onChange={e => setConfirmaSenha(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            onClick={handleAlterarSenha}
            disabled={savingSenha || !novaSenha || !confirmaSenha}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {savingSenha ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
            Alterar senha
          </button>
        </div>
      </div>
    </div>
  );
}
