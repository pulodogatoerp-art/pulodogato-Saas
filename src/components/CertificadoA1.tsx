import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Upload, Loader2, CheckCircle2, KeyRound, Calendar, Building, FileCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

export default function CertificadoA1() {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [savingSenha, setSavingSenha] = useState(false);
  const [novaSenha, setNovaSenha] = useState('');
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [showReplace, setShowReplace] = useState(false);

  const { data: certInfo, isLoading } = useQuery({
    queryKey: ['certificado-a1-info'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('configuracoes')
        .select('chave, valor')
        .in('chave', [
          'nfe_certificado_status',
          'nfe_certificado_titular',
          'nfe_certificado_validade',
          'nfe_certificado_emissor',
          'nfe_certificado_arquivo',
          'empresa_cnpj',
          'nfe_certificado_senha'
        ]);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data ?? []).forEach((r: any) => { map[r.chave] = r.valor; });
      return {
        ativo: map['nfe_certificado_status'] === 'ativo',
        titular: map['nfe_certificado_titular'] || 'MARCELO RIBEIRO ARISTIDES',
        cnpj: map['empresa_cnpj'] || '64.514.013/0001-61',
        validade: map['nfe_certificado_validade'] || '12/11/2027',
        emissor: map['nfe_certificado_emissor'] || 'AC SyngularID Multipla (ICP-Brasil)',
        arquivo: map['nfe_certificado_arquivo'] || '64.514.013_MARCELO_RIBEIRO_ARISTIDES_64514013000161.pfx',
        hasSenha: Boolean(map['nfe_certificado_senha']),
      };
    },
  });

  const handleSalvarSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novaSenha) return;
    setSavingSenha(true);
    try {
      const { error } = await supabase
        .from('configuracoes')
        .upsert({ chave: 'nfe_certificado_senha', valor: novaSenha, updated_at: new Date().toISOString() }, { onConflict: 'chave' });
      if (error) throw error;
      setMessage('Senha do certificado salva com sucesso.');
      setFailed(false);
      setNovaSenha('');
      await queryClient.invalidateQueries({ queryKey: ['certificado-a1-info'] });
    } catch (err: any) {
      setFailed(true);
      setMessage(err.message || 'Erro ao salvar a senha.');
    } finally {
      setSavingSenha(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) return;
    setBusy(true); setMessage('');
    try {
      const fileName = file.name;
      const filePath = `empresa/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from('certificados-a1')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Atualiza configurações com o novo arquivo
      await supabase.from('configuracoes').upsert([
        { chave: 'nfe_certificado_status', valor: 'ativo', updated_at: new Date().toISOString() },
        { chave: 'nfe_certificado_arquivo', valor: fileName, updated_at: new Date().toISOString() },
        ...(password ? [{ chave: 'nfe_certificado_senha', valor: password, updated_at: new Date().toISOString() }] : []),
      ], { onConflict: 'chave' });

      setPassword('');
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      setFailed(false);
      setMessage('Certificado enviado e configurado com sucesso.');
      setShowReplace(false);
      await queryClient.invalidateQueries({ queryKey: ['certificado-a1-info'] });
    } catch (error: any) {
      setFailed(true);
      setMessage(error.message || 'Falha ao salvar o certificado.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border bg-card shadow-sm p-5 space-y-5" aria-labelledby="a1-title">
      <div className="flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-2">
          <ShieldCheck size={20} className="text-primary" />
          <h2 id="a1-title" className="font-semibold text-base">Certificado Digital A1 (ICP-Brasil)</h2>
        </div>
        {certInfo?.ativo && (
          <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-600">
            <CheckCircle2 size={14} /> Ativo e Integrado
          </span>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 size={16} className="animate-spin" /> Carregando status do certificado...
        </p>
      ) : certInfo?.ativo && !showReplace ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 p-4 rounded-lg bg-muted/40 border text-sm">
            <div className="flex items-start gap-2.5">
              <Building size={16} className="text-muted-foreground mt-0.5" />
              <div>
                <span className="text-xs text-muted-foreground block font-medium">Titular / Razão Social</span>
                <span className="font-semibold text-foreground">{certInfo.titular}</span>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <FileCheck size={16} className="text-muted-foreground mt-0.5" />
              <div>
                <span className="text-xs text-muted-foreground block font-medium">CNPJ Vinculado</span>
                <span className="font-semibold text-foreground">{certInfo.cnpj}</span>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Calendar size={16} className="text-muted-foreground mt-0.5" />
              <div>
                <span className="text-xs text-muted-foreground block font-medium">Validade SEFAZ</span>
                <span className="font-semibold text-emerald-600">{certInfo.validade} (Válido)</span>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <ShieldCheck size={16} className="text-muted-foreground mt-0.5" />
              <div>
                <span className="text-xs text-muted-foreground block font-medium">Autoridade Emissora</span>
                <span className="font-semibold text-foreground">{certInfo.emissor}</span>
              </div>
            </div>
            <div className="sm:col-span-2 pt-2 border-t flex items-center justify-between text-xs text-muted-foreground">
              <span>Arquivo no Storage: <strong className="text-foreground">{certInfo.arquivo}</strong></span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowReplace(true)}
                className="text-xs h-7"
              >
                Substituir Certificado
              </Button>
            </div>
          </div>

          {/* Cadastro da Senha do Certificado para Emissão */}
          <form onSubmit={handleSalvarSenha} className="p-4 rounded-lg border bg-background space-y-3">
            <div className="flex items-center gap-2">
              <KeyRound size={16} className="text-primary" />
              <label htmlFor="senha-cert" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Senha do Certificado A1 {certInfo.hasSenha ? '(Já cadastrada)' : '(Pendente)'}
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              A senha é necessária para assinar as notas fiscais (NF-e/NFC-e) na transmissão com a SEFAZ.
            </p>
            <div className="flex items-center gap-2 max-w-md">
              <input
                id="senha-cert"
                type="password"
                autoComplete="off"
                placeholder={certInfo.hasSenha ? '•••••••• (Digite para alterar)' : 'Digite a senha do certificado'}
                value={novaSenha}
                onChange={e => setNovaSenha(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
              />
              <Button type="submit" size="sm" disabled={savingSenha || !novaSenha}>
                {savingSenha ? <Loader2 size={14} className="animate-spin" /> : 'Salvar Senha'}
              </Button>
            </div>
          </form>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="a1-file" className="block text-sm font-medium mb-1.5">
              Arquivo do Certificado A1 (.pfx ou .p12)
            </label>
            <input
              ref={fileInput}
              id="a1-file"
              type="file"
              accept=".pfx,.p12"
              required
              disabled={busy}
              onChange={e => { setFile(e.target.files?.[0] ?? null); setMessage(''); }}
              className="block w-full min-w-0 text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-2 file:text-foreground"
            />
          </div>
          <div>
            <label htmlFor="a1-password" className="block text-sm font-medium mb-1.5">
              Senha do certificado
            </label>
            <input
              id="a1-password"
              type="password"
              autoComplete="off"
              placeholder="Digite a senha do arquivo .pfx"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={busy}
              className="w-full max-w-md rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-center gap-2 pt-2">
            <Button type="submit" disabled={busy || !file}>
              {busy ? <Loader2 className="animate-spin" /> : <Upload />}
              {busy ? 'Enviando...' : 'Salvar e Ativar Certificado'}
            </Button>
            {certInfo?.ativo && (
              <Button type="button" variant="ghost" onClick={() => setShowReplace(false)}>
                Cancelar
              </Button>
            )}
          </div>
        </form>
      )}

      {message && (
        <p role={failed ? 'alert' : 'status'} className={failed ? 'text-sm text-destructive' : 'text-sm text-emerald-600'}>
          {message}
        </p>
      )}
    </section>
  );
}
