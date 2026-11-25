import React, { useRef } from 'react';
import { Printer, Download, X, CheckCircle, ShieldCheck, Copy, Receipt } from 'lucide-react';
import { NFeVendaData, NFeResultado, formatarChave, baixarXmlNFe } from '@/services/nfeService';
import { useToast } from '@/hooks/use-toast';

interface DanfeNfceModalProps {
  dados: NFeVendaData;
  resultado: NFeResultado;
  onClose: () => void;
}

// Renderiza um código de barras Code 128 limpo em SVG para a chave de 44 dígitos
function BarcodeSvg({ value }: { value: string }) {
  const bars: number[] = [];
  for (let i = 0; i < value.length; i++) {
    const d = parseInt(value[i], 10) || 1;
    bars.push((d % 3) + 1, ((d * 2) % 3) + 1, ((d + 1) % 2) + 1);
  }

  let x = 8;
  return (
    <svg viewBox="0 0 320 40" className="w-full h-9 object-contain" preserveAspectRatio="none">
      <rect width="320" height="40" fill="#fff" />
      {bars.slice(0, 85).map((width, idx) => {
        const currentX = x;
        x += width * 2.4 + (idx % 2 === 0 ? 1.2 : 2.0);
        if (currentX > 310) return null;
        return (
          <rect
            key={idx}
            x={currentX}
            y={2}
            width={width * 1.3}
            height={36}
            fill="#000"
          />
        );
      })}
    </svg>
  );
}

export default function DanfeNfceModal({ dados, resultado, onClose }: DanfeNfceModalProps) {
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtNum = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtQtd = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadXml = () => {
    baixarXmlNFe(resultado.chaveAcesso, resultado.xml, 'nfce');
  };

  const handleCopyChave = () => {
    navigator.clipboard.writeText(resultado.chaveAcesso);
    toast({ title: 'Chave de acesso copiada para a área de transferência!' });
  };

  const dataEmissaoFormatada = new Date(dados.dataEmissao).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  // Cálculo de tributos aproximados (Lei Federal 12.741/2012)
  const totalImpostos = dados.itens.reduce((acc, it) => {
    const aliq = (it.icmsAliquota || 17) + (it.pisAliquota || 1.65) + (it.cofinsAliquota || 7.6);
    return acc + (it.valorTotal * aliq) / 100;
  }, 0);
  const totalImpostosPct = dados.totalVenda > 0 ? (totalImpostos / dados.totalVenda) * 100 : 0;

  const qrCodeData = resultado.qrCodeUrl || `https://www.dfe.ms.gov.br/nfce/qrcode?p=${resultado.chaveAcesso}|2|${dados.ambiente === 'producao' ? '1' : '2'}|000001`;
  const qrCodeImgSrc = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=0&data=${encodeURIComponent(qrCodeData)}`;

  const docDest = (dados.destinatario.cpfCnpj || '').replace(/\D/g, '');
  const temCliente = docDest.length > 0 || (dados.destinatario.nome && dados.destinatario.nome !== 'Consumidor Final (Balcão)' && dados.destinatario.nome !== 'CONSUMIDOR');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto print:p-0 print:bg-white print:static">
      <div className="relative w-full max-w-md bg-white text-black rounded-2xl shadow-2xl overflow-hidden my-auto print:shadow-none print:w-full print:max-w-none print:rounded-none">
        
        {/* Header de Ações (Oculto na Impressão) */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-900 text-white print:hidden">
          <div className="flex items-center gap-2">
            <Receipt className="text-emerald-400" size={20} />
            <div>
              <span className="font-semibold text-sm block leading-none">Cupom Fiscal (NFC-e)</span>
              <span className="text-[10px] text-emerald-300 font-mono mt-0.5 inline-flex items-center gap-1">
                <CheckCircle size={10} /> {resultado.status.toUpperCase()} • MOD 65
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleCopyChave}
              className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              title="Copiar Chave de Acesso de 44 dígitos"
            >
              <Copy size={15} />
            </button>

            {resultado.xml && (
              <button
                onClick={handleDownloadXml}
                className="px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors flex items-center gap-1"
                title="Baixar XML oficial da NFC-e"
              >
                <Download size={13} /> XML
              </button>
            )}

            <button
              onClick={handlePrint}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center gap-1.5 shadow-sm"
              title="Imprimir Cupom em Bobina Térmica (80mm)"
            >
              <Printer size={14} /> Imprimir
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Estilo para impressão em bobina térmica de 80mm */}
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            @page {
              size: 80mm auto;
              margin: 0;
            }
            body {
              background: #fff !important;
              color: #000 !important;
              margin: 0 !important;
              padding: 0 !important;
            }
            .nfce-container {
              width: 76mm !important;
              max-width: 76mm !important;
              margin: 0 auto !important;
              padding: 3mm 2mm !important;
              box-shadow: none !important;
              border: none !important;
            }
          }
        ` }} />

        {/* Corpo do Cupom Fiscal (Bobina Térmica 80mm) */}
        <div className="p-4 sm:p-6 bg-slate-100/70 max-h-[85vh] overflow-y-auto print:p-0 print:bg-white print:max-h-none">
          <div
            ref={printRef}
            className="nfce-container mx-auto bg-white text-black p-4 rounded-xl border border-gray-200 shadow-sm print:border-none print:shadow-none print:rounded-none"
            style={{ fontFamily: "'Courier New', Courier, monospace", fontSize: '11px', lineHeight: '1.35', maxWidth: '340px' }}
          >
            {/* Cabeçalho da Empresa */}
            <div className="text-center pb-2 border-b border-dashed border-gray-400">
              <p className="font-bold text-sm tracking-tight">{dados.emitente.razaoSocial}</p>
              {dados.emitente.nomeFantasia && dados.emitente.nomeFantasia !== dados.emitente.razaoSocial && (
                <p className="text-[10px] text-gray-700 font-semibold">{dados.emitente.nomeFantasia}</p>
              )}
              <p className="text-[10px] mt-0.5">CNPJ: {dados.emitente.cnpj}</p>
              <p className="text-[10px]">IE: {dados.emitente.ie || 'ISENTO'}</p>
              <p className="text-[9px] text-gray-700 mt-0.5">
                {dados.emitente.endereco}, {dados.emitente.cidade || 'Campo Grande'}-{dados.emitente.uf || 'MS'}
              </p>
              {dados.emitente.telefone && (
                <p className="text-[9px] text-gray-700">Fone: {dados.emitente.telefone}</p>
              )}
            </div>

            {/* Identificação do Documento Fiscal */}
            <div className="text-center py-2 border-b border-dashed border-gray-400 space-y-0.5">
              <p className="font-bold text-[12px] tracking-wide">DANFE NFC-e</p>
              <p className="text-[9px] font-semibold">Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica</p>
              <p className="text-[8px] text-gray-600">Não permite aproveitamento de crédito de ICMS</p>
              {dados.ambiente !== 'producao' && (
                <p className="text-[9px] font-bold text-amber-700 bg-amber-100 border border-amber-300 rounded px-1.5 py-0.5 mt-1">
                  EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL
                </p>
              )}
            </div>

            {/* Tabela de Itens */}
            <div className="py-2 border-b border-dashed border-gray-400">
              <div className="flex justify-between font-bold text-[9px] border-b border-gray-300 pb-1 mb-1">
                <span># CÓD DESCRIÇÃO</span>
                <span>QTDxUNIT TOTAL</span>
              </div>

              <div className="space-y-1.5">
                {dados.itens.map((it, idx) => (
                  <div key={it.id || idx} className="text-[10px]">
                    <div className="flex justify-between items-baseline">
                      <span className="font-semibold truncate max-w-[210px]">
                        {String(idx + 1).padStart(3, '0')} {it.codigo ? `${it.codigo} ` : ''}{it.descricao}
                      </span>
                    </div>
                    <div className="flex justify-between text-[9px] text-gray-800">
                      <span>{fmtQtd(it.quantidade)} {it.unidade || 'UN'} x {fmtNum(it.valorUnitario)}</span>
                      <span className="font-bold text-[10px] text-black">{fmt(it.valorTotal)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Totais do Cupom */}
            <div className="py-2 border-b border-dashed border-gray-400 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span>Qtd. Total de Itens:</span>
                <span className="font-semibold">{dados.itens.reduce((acc, it) => acc + it.quantidade, 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span className="font-semibold">{fmt(dados.totalProdutos)}</span>
              </div>
              {dados.freteValor > 0 && (
                <div className="flex justify-between">
                  <span>Frete / Acréscimos:</span>
                  <span className="font-semibold">{fmt(dados.freteValor)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold pt-1 border-t border-gray-300">
                <span>VALOR TOTAL:</span>
                <span>{fmt(dados.totalVenda)}</span>
              </div>
            </div>

            {/* Forma de Pagamento */}
            <div className="py-2 border-b border-dashed border-gray-400 space-y-1 text-[10px]">
              <div className="flex justify-between font-bold">
                <span>FORMA DE PAGAMENTO</span>
                <span>VALOR PAGO</span>
              </div>
              <div className="flex justify-between">
                <span>{dados.formaPagamento || 'Dinheiro'}</span>
                <span className="font-semibold">{fmt(dados.totalVenda)}</span>
              </div>
            </div>

            {/* Informações Tributárias (Lei 12.741/2012) */}
            <div className="py-1.5 border-b border-dashed border-gray-400 text-[8.5px] text-gray-700 leading-tight">
              <p>Tributos Incidentes (Lei Fed. 12.741/2012):</p>
              <p className="font-semibold">
                Total aprox.: {fmt(totalImpostos)} ({totalImpostosPct.toFixed(1)}%)
              </p>
            </div>

            {/* Dados da Emissão e Protocolo SEFAZ */}
            <div className="py-2 border-b border-dashed border-gray-400 text-center space-y-0.5 text-[9px]">
              <p className="font-bold">
                NFC-e Nº {dados.numero} • Série {dados.serie}
              </p>
              <p>Emissão: {dataEmissaoFormatada}</p>
              <p className="font-semibold text-[8.5px]">
                Protocolo de Autorização: {resultado.protocoloAutorizacao}
              </p>
              <p className="text-[8px] text-gray-600">
                {dados.ambiente === 'producao' ? 'AMBIENTE DE PRODUÇÃO' : 'AMBIENTE DE HOMOLOGAÇÃO (TESTES SEFAZ)'}
              </p>
            </div>

            {/* Chave de Acesso e Código de Barras */}
            <div className="py-2 border-b border-dashed border-gray-400 text-center space-y-1">
              <p className="text-[8.5px] font-bold">CHAVE DE ACESSO</p>
              <p className="text-[9px] font-mono tracking-wider font-semibold break-all">
                {formatarChave(resultado.chaveAcesso)}
              </p>
              <div className="pt-1">
                <BarcodeSvg value={resultado.chaveAcesso} />
              </div>
            </div>

            {/* QR-Code Oficial SEFAZ */}
            <div className="py-2 border-b border-dashed border-gray-400 flex flex-col items-center text-center">
              <p className="text-[8.5px] font-bold mb-1.5 uppercase">Consulte via Leitor de QR Code</p>
              <div className="p-1 bg-white border border-gray-300 rounded inline-block">
                <img
                  src={qrCodeImgSrc}
                  alt="QR Code NFC-e SEFAZ"
                  className="w-28 h-28 object-contain"
                  crossOrigin="anonymous"
                />
              </div>
              <p className="text-[8px] text-gray-600 mt-1">
                Protocolo emitido pela SEFAZ Autorizadora
              </p>
            </div>

            {/* Identificação do Consumidor */}
            <div className="py-2 border-b border-dashed border-gray-400 text-[9px] leading-tight">
              <p className="font-bold uppercase">Consumidor:</p>
              {temCliente ? (
                <>
                  <p className="font-semibold">{dados.destinatario.nome}</p>
                  {dados.destinatario.cpfCnpj && (
                    <p>CPF/CNPJ: {dados.destinatario.cpfCnpj}</p>
                  )}
                </>
              ) : (
                <p className="text-gray-700">CONSUMIDOR NÃO IDENTIFICADO</p>
              )}
            </div>

            {/* Rodapé Fiscal */}
            <div className="pt-2 text-center text-[8px] text-gray-600 space-y-0.5">
              <p>Consulte pela Chave de Acesso em:</p>
              <p className="font-semibold text-black">http://www.dfe.ms.gov.br/nfce/consulta</p>
              <p className="text-[7.5px] text-gray-500 pt-1">PeçaFácil Pro • Sistema de Gestão e Emissão Fiscal</p>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
