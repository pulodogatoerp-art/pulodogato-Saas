import { X, MessageCircle, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { ItemOrcamento, Cliente } from '@/types';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface WhatsAppModalProps {
  cliente: Cliente;
  itens: ItemOrcamento[];
  total: number;
  numeroOrcamento: string;
  onClose: () => void;
}

export default function WhatsAppModal({ cliente, itens, total, numeroOrcamento, onClose }: WhatsAppModalProps) {
  const [copied, setCopied] = useState(false);

  const { data: empresa } = useQuery({
    queryKey: ['configuracoes-whatsapp'],
    queryFn: async () => {
      const { data } = await supabase
        .from('configuracoes')
        .select('chave, valor')
        .in('chave', ['empresa_telefone', 'empresa_nome']);
      const map: Record<string, string> = {};
      (data ?? []).forEach((r: any) => { map[r.chave] = r.valor; });
      return map;
    },
  });

  const nomeEmpresa = empresa?.empresa_nome_fantasia?.trim() || empresa?.empresa_nome?.trim() || 'G Autopeças & Acessórios';
  const telefoneLoja = empresa?.empresa_telefone?.trim();
  const contatoLinha = telefoneLoja ? `\n\n📱 *${nomeEmpresa}* — ${telefoneLoja}` : `\n\n📱 *${nomeEmpresa}*`;

  const mensagem = `Olá ${cliente.nome}! 👋\n\nSegue seu orçamento *${numeroOrcamento}* da *${nomeEmpresa}*:\n\n${itens.map(i => `• ${i.produto.nome} (${i.quantidade}x) — ${(i.quantidade * i.precoUnitario).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`).join('\n')}\n\n*Total: ${total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}*\n\nEste orçamento tem validade de 3 dias. Qualquer dúvida estamos à disposição! 😊${contatoLinha}`;

  const whatsappUrl = `https://wa.me/55${cliente.telefone.replace(/\D/g, '')}?text=${encodeURIComponent(mensagem)}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(mensagem);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-2xl shadow-lg w-full max-w-md animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ background: '#25D366' }}>
              <MessageCircle size={18} className="text-white" />
            </div>
            <div>
              <h2 className="font-bold text-base">Enviar via WhatsApp</h2>
              <p className="text-xs text-muted-foreground">{cliente.telefone}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Preview */}
        <div className="px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Prévia da Mensagem</p>
          <div
            className="rounded-xl p-4 text-sm leading-relaxed whitespace-pre-wrap"
            style={{ background: '#ECF9EC', color: '#1a1a1a', fontFamily: 'system-ui', fontSize: '0.8125rem' }}
          >
            {mensagem}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-6 py-4 border-t">
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors flex-1 justify-center"
          >
            {copied ? <Check size={15} className="text-success" /> : <Copy size={15} />}
            {copied ? 'Copiado!' : 'Copiar Texto'}
          </button>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 flex-1 justify-center"
            style={{ background: '#25D366' }}
            onClick={onClose}
          >
            <MessageCircle size={15} />
            Abrir WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
