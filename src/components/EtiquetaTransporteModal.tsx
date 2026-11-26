import React, { useState } from 'react';
import { Printer, X, Truck, Package, MapPin, User } from 'lucide-react';
import logoGAutopecas from '@/assets/logo-g-autopecas.jpg';
import { formatarChave } from '@/services/nfeService';

export interface EtiquetaTransporteProps {
  dados: {
    numeroVenda: string;
    dataEmissao: Date;
    chaveNfe?: string;
    numeroNfce?: string;
    valorTotal: number;
    freteTransportadora?: string;
    freteValor?: number;
    remetente: {
      nomeFantasia: string;
      razaoSocial?: string;
      cnpj?: string;
      endereco?: string;
      cidade?: string;
      uf?: string;
      cep?: string;
      telefone?: string;
    };
    destinatario: {
      nome: string;
      cpfCnpj?: string;
      endereco?: string;
      bairro?: string;
      cidade?: string;
      uf?: string;
      cep?: string;
      telefone?: string;
    };
    itens: Array<{
      codigo?: string;
      descricao: string;
      quantidade: number;
    }>;
  };
  onClose: () => void;
}

function BarcodeEtiqueta({ value }: { value: string }) {
  const clean = value.replace(/[^0-9A-Za-z]/g, '') || '0000000000';
  const bars: number[] = [];
  for (let i = 0; i < clean.length; i++) {
    const d = clean.charCodeAt(i);
    bars.push((d % 3) + 1, ((d * 2) % 3) + 1);
  }
  let x = 6;
  return (
    <svg viewBox="0 0 280 34" className="w-full h-8 object-contain" preserveAspectRatio="none">
      <rect width="280" height="34" fill="#fff" />
      {bars.slice(0, 75).map((width, idx) => {
        const cx = x;
        x += width * 2.2 + (idx % 2 === 0 ? 1.2 : 1.8);
        if (cx > 274) return null;
        return <rect key={idx} x={cx} y={2} width={width * 1.2} height={30} fill="#000" />;
      })}
    </svg>
  );
}

export default function EtiquetaTransporteModal({ dados, onClose }: EtiquetaTransporteProps) {
  const [transportadora, setTransportadora] = useState(dados.freteTransportadora || 'Transporte Próprio / Motoboy / Correios');
  const [volumes, setVolumes] = useState('1 / 1');
  const [peso, setPeso] = useState('');
  const [observacao, setObservacao] = useState('FRÁGIL - AUTOPEÇAS');
  const [destNome, setDestNome] = useState(dados.destinatario.nome || 'Consumidor Final');
  const [destEnd, setDestEnd] = useState(dados.destinatario.endereco || '');
  const [destCidadeUf, setDestCidadeUf] = useState(
    [dados.destinatario.cidade, dados.destinatario.uf].filter(Boolean).join(' - ') || 'Campo Grande - MS'
  );
  const [destCep, setDestCep] = useState(dados.destinatario.cep || '');
  const [destTel, setDestTel] = useState(dados.destinatario.telefone || '');

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="etiqueta-print-root fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto print:p-0 print:bg-white print:static">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: 100mm 150mm;
            margin: 3mm;
          }
          body * {
            visibility: hidden !important;
          }
          .etiqueta-print-root,
          .etiqueta-print-root .etiqueta-area,
          .etiqueta-print-root .etiqueta-area * {
            visibility: visible !important;
          }
          .etiqueta-print-root {
            position: absolute !important;
            inset: 0 !important;
            background: #fff !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
          }
          .etiqueta-area {
            width: 94mm !important;
            max-width: 94mm !important;
            border: 1.5px solid #000 !important;
            box-shadow: none !important;
            margin: 0 auto !important;
            padding: 3mm !important;
          }
          .no-print {
            display: none !important;
          }
        }
      ` }} />

      <div className="relative w-full max-w-lg bg-background rounded-2xl shadow-2xl overflow-hidden my-auto border print:border-none print:shadow-none print:rounded-none">
        {/* Header de Ações */}
        <div className="no-print flex items-center justify-between px-5 py-3.5 bg-slate-900 text-white">
          <div className="flex items-center gap-2">
            <Truck className="text-amber-400" size={20} />
            <div>
              <span className="font-semibold text-sm block leading-none">Nota Resumida · Etiqueta de Transporte</span>
              <span className="text-[10px] text-slate-300 font-mono">Pedido {dados.numeroVenda}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Printer size={14} /> Imprimir Etiqueta
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Campos Rápidos de Ajuste antes de Imprimir */}
        <div className="no-print p-4 border-b bg-muted/30 grid grid-cols-2 gap-2.5 text-xs">
          <div>
            <label className="block font-semibold text-muted-foreground mb-1">Transportadora / Envio</label>
            <input
              value={transportadora}
              onChange={(e) => setTransportadora(e.target.value)}
              className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-semibold text-muted-foreground mb-1">Volumes</label>
              <input
                value={volumes}
                onChange={(e) => setVolumes(e.target.value)}
                className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block font-semibold text-muted-foreground mb-1">Peso (kg)</label>
              <input
                value={peso}
                onChange={(e) => setPeso(e.target.value)}
                placeholder="Ex: 2,5 kg"
                className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs"
              />
            </div>
          </div>
          <div>
            <label className="block font-semibold text-muted-foreground mb-1">Destinatário</label>
            <input
              value={destNome}
              onChange={(e) => setDestNome(e.target.value)}
              className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="block font-semibold text-muted-foreground mb-1">Telefone Dest.</label>
            <input
              value={destTel}
              onChange={(e) => setDestTel(e.target.value)}
              placeholder="(67) 99999-9999"
              className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs"
            />
          </div>
          <div className="col-span-2 grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="block font-semibold text-muted-foreground mb-1">Endereço de Entrega</label>
              <input
                value={destEnd}
                onChange={(e) => setDestEnd(e.target.value)}
                placeholder="Rua, Número, Bairro"
                className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block font-semibold text-muted-foreground mb-1">CEP</label>
              <input
                value={destCep}
                onChange={(e) => setDestCep(e.target.value)}
                placeholder="79000-000"
                className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs"
              />
            </div>
          </div>
          <div>
            <label className="block font-semibold text-muted-foreground mb-1">Cidade / UF</label>
            <input
              value={destCidadeUf}
              onChange={(e) => setDestCidadeUf(e.target.value)}
              className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="block font-semibold text-muted-foreground mb-1">Observação na Etiqueta</label>
            <input
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs"
            />
          </div>
        </div>

        {/* Etiqueta de Transporte (Área Impressa) */}
        <div className="p-4 bg-slate-100/70 print:p-0 print:bg-white">
          <div
            className="etiqueta-area mx-auto bg-white text-black border-2 border-black rounded-lg p-3.5 space-y-2.5 print:rounded-none"
            style={{ maxWidth: '370px', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '11px' }}
          >
            {/* Topo: Logo + Remetente */}
            <div className="flex items-center gap-2.5 pb-2 border-b-2 border-black">
              <img
                src={logoGAutopecas}
                alt="G Autopeças & Acessórios"
                className="w-12 h-12 object-contain rounded bg-black shrink-0"
              />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="font-black text-xs uppercase truncate">{dados.remetente.nomeFantasia || 'G Autopeças & Acessórios'}</p>
                {dados.remetente.cnpj && <p className="text-[9px] font-mono">CNPJ: {dados.remetente.cnpj}</p>}
                <p className="text-[9px] text-gray-700 truncate">
                  {[dados.remetente.cidade, dados.remetente.uf].filter(Boolean).join(' - ') || 'Campo Grande - MS'}
                  {dados.remetente.telefone ? ` · ${dados.remetente.telefone}` : ''}
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className="inline-block bg-black text-white text-[9px] font-bold px-2 py-0.5 rounded uppercase">
                  Transporte
                </span>
                <p className="text-[10px] font-mono font-bold mt-0.5">{dados.numeroVenda}</p>
              </div>
            </div>

            {/* Destinatário */}
            <div className="border border-black rounded p-2 bg-gray-50/70 space-y-0.5">
              <p className="text-[9px] font-bold uppercase tracking-wider text-gray-600 flex items-center gap-1">
                <MapPin size={10} /> Destinatário
              </p>
              <p className="font-black text-sm uppercase leading-tight">{destNome}</p>
              {dados.destinatario.cpfCnpj && (
                <p className="text-[10px] font-mono">CPF/CNPJ: {dados.destinatario.cpfCnpj}</p>
              )}
              {destEnd && <p className="text-[11px] font-semibold">{destEnd}</p>}
              <p className="text-[11px] font-bold">
                {destCidadeUf}{destCep ? ` · CEP: ${destCep}` : ''}
              </p>
              {destTel && <p className="text-[10px]">Fone: {destTel}</p>}
            </div>

            {/* Dados Logísticos */}
            <div className="grid grid-cols-3 gap-1.5 text-[10px] border border-black rounded p-1.5">
              <div className="col-span-2">
                <span className="text-[8px] uppercase text-gray-600 block font-bold">Transportadora / Envio</span>
                <span className="font-bold uppercase">{transportadora}</span>
              </div>
              <div>
                <span className="text-[8px] uppercase text-gray-600 block font-bold">Volumes / Peso</span>
                <span className="font-bold">{volumes}{peso ? ` · ${peso}` : ''}</span>
              </div>
            </div>

            {/* Resumo da Nota / Conteúdo */}
            <div className="border border-black rounded p-2 space-y-1">
              <div className="flex items-center justify-between text-[9px] font-bold uppercase border-b border-gray-300 pb-0.5">
                <span className="flex items-center gap-1"><Package size={10} /> Conteúdo Resumido</span>
                <span>{dados.numeroNfce ? `NFC-e Nº ${dados.numeroNfce}` : `Pedido ${dados.numeroVenda}`}</span>
              </div>
              <div className="space-y-0.5 text-[10px] max-h-24 overflow-hidden">
                {dados.itens.slice(0, 6).map((it, idx) => (
                  <div key={idx} className="flex justify-between gap-2">
                    <span className="truncate font-medium">
                      {it.quantidade}x {it.descricao}
                    </span>
                    {it.codigo && <span className="font-mono text-[9px] text-gray-600 shrink-0">{it.codigo}</span>}
                  </div>
                ))}
                {dados.itens.length > 6 && (
                  <p className="text-[9px] text-gray-600 italic">+ {dados.itens.length - 6} outro(s) item(ns)...</p>
                )}
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-dashed border-gray-400 text-[10px] font-bold">
                <span>VALOR TOTAL DECLARADO:</span>
                <span>{fmt(dados.valorTotal)}</span>
              </div>
            </div>

            {/* Observação + Código de Barras */}
            {observacao && (
              <div className="text-center bg-black text-white text-[10px] font-black py-1 px-2 rounded uppercase tracking-wider">
                {observacao}
              </div>
            )}

            <div className="pt-1 text-center">
              <BarcodeEtiqueta value={dados.chaveNfe || dados.numeroVenda} />
              {dados.chaveNfe && (
                <p className="text-[8px] font-mono text-gray-700 mt-0.5 break-all">
                  Chave NFC-e: {formatarChave(dados.chaveNfe)}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
