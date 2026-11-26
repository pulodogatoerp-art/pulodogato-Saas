import React from 'react';
import { Printer, Download, X, CheckCircle, ShieldCheck } from 'lucide-react';
import { NFeVendaData, NFeResultado, formatarChave, baixarXmlNFe } from '@/services/nfeService';
import logoGAutopecas from '@/assets/logo-g-autopecas.jpg';

interface DanfeModalProps {
  dados: NFeVendaData;
  resultado: NFeResultado;
  onClose: () => void;
}

// Renderiza um código de barras simulado em SVG proporcional e limpo no padrão Code 128
function BarcodeSvg({ value }: { value: string }) {
  const bars: number[] = [];
  // Gera padrão visual consistente com base nos dígitos
  for (let i = 0; i < value.length; i++) {
    const d = parseInt(value[i], 10) || 1;
    bars.push(d % 3 + 1, (d * 2) % 3 + 1, (d + 1) % 2 + 1);
  }

  let x = 10;
  return (
    <svg viewBox="0 0 400 55" className="w-full h-12 object-contain" preserveAspectRatio="none">
      <rect width="400" height="55" fill="#fff" />
      {bars.slice(0, 100).map((width, idx) => {
        const currentX = x;
        x += width * 2.8 + (idx % 2 === 0 ? 1.5 : 2.5);
        if (currentX > 385) return null;
        return (
          <rect
            key={idx}
            x={currentX}
            y={2}
            width={width * 1.5}
            height={48}
            fill="#000"
          />
        );
      })}
    </svg>
  );
}

export default function DanfeModal({ dados, resultado, onClose }: DanfeModalProps) {
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtNum = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadXml = () => {
    baixarXmlNFe(resultado.chaveAcesso, resultado.xml);
  };

  const totalICMS = dados.itens.reduce((acc, item) => acc + ((item.valorTotal * (item.icmsAliquota || 0)) / 100), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto print:p-0 print:bg-white print:static">
      <div className="relative w-full max-w-4xl bg-white text-black rounded-xl shadow-2xl overflow-hidden my-auto print:shadow-none print:w-full print:max-w-none print:rounded-none">
        
        {/* Header de Ações (Oculto na Impressão) */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-slate-900 text-white print:hidden">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-emerald-400" size={20} />
            <span className="font-semibold text-sm">DANFE — Nota Fiscal Eletrônica</span>
            <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-mono flex items-center gap-1">
              <CheckCircle size={12} /> {resultado.status.toUpperCase()}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {resultado.xml && (
              <button
                onClick={handleDownloadXml}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors flex items-center gap-1.5"
                title="Baixar XML oficial da NF-e"
              >
                <Download size={14} />
                Baixar XML
              </button>
            )}

            <button
              onClick={handlePrint}
              className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center gap-1.5 shadow-sm"
              title="Imprimir DANFE para Envio"
            >
              <Printer size={14} />
              Imprimir DANFE
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Corpo do DANFE no Layout Padrão SEFAZ (Folha A4) */}
        <div className="p-4 sm:p-6 text-[10px] leading-tight font-sans bg-white print:p-0">
          
          {/* TOPO: Emitente | DANFE Identificação | Chave de Acesso */}
          <div className="grid grid-cols-12 border-2 border-black">
            
            {/* Emitente */}
            <div className="col-span-12 sm:col-span-5 p-2 border-b sm:border-b-0 sm:border-r border-black flex flex-col justify-between">
              <div className="flex items-start gap-2.5">
                <img
                  src={logoGAutopecas}
                  alt="G Autopeças & Acessórios"
                  className="w-14 h-14 object-contain rounded-md shrink-0 bg-black"
                />
                <div className="min-w-0">
                  <h1 className="font-bold text-xs uppercase tracking-tight">{dados.emitente.nomeFantasia || 'G Autopeças & Acessórios'}</h1>
                  <p className="font-semibold text-[9px] text-gray-700">{dados.emitente.razaoSocial}</p>
                  <p className="mt-1">{dados.emitente.endereco}</p>
                  <p>{dados.emitente.cidade || 'Campo Grande'} - {dados.emitente.uf || 'MS'} | CEP: {dados.emitente.cep || '79000-000'}</p>
                  {dados.emitente.telefone && <p>Fone: {dados.emitente.telefone}</p>}
                </div>
              </div>
              <div className="mt-2 pt-1 border-t border-dashed border-gray-400 font-mono text-[9px]">
                <p>CNPJ: <strong>{dados.emitente.cnpj}</strong></p>
                <p>IE: <strong>{dados.emitente.ie || 'ISENTO'}</strong></p>
              </div>
            </div>

            {/* Identificação DANFE */}
            <div className="col-span-6 sm:col-span-3 p-2 border-b sm:border-b-0 sm:border-r border-black text-center flex flex-col justify-between">
              <div>
                <h2 className="font-black text-sm tracking-wider">DANFE</h2>
                <p className="text-[8px] uppercase">Documento Auxiliar da Nota Fiscal Eletrônica</p>
              </div>
              <div className="my-1.5 flex justify-center items-center gap-2">
                <span className="text-[8px]">0 - Entrada<br />1 - Saída</span>
                <span className="inline-block border-2 border-black font-bold text-xs px-2 py-0.5">1</span>
              </div>
              <div>
                <p className="font-bold text-[11px]">Nº {String(dados.numero).padStart(9, '0')}</p>
                <p className="font-semibold text-[9px]">SÉRIE {dados.serie}</p>
                <p className="text-[8px] text-gray-600">FOLHA 1/1</p>
              </div>
            </div>

            {/* Código de Barras & Chave de Acesso */}
            <div className="col-span-6 sm:col-span-4 p-2 flex flex-col justify-between">
              <div className="border border-black p-1 text-center bg-white">
                <BarcodeSvg value={resultado.chaveAcesso} />
              </div>
              <div className="mt-1 text-center">
                <p className="text-[8px] font-bold uppercase">Chave de Acesso</p>
                <p className="font-mono text-[9px] font-bold tracking-tight break-all">
                  {formatarChave(resultado.chaveAcesso)}
                </p>
              </div>
              <div className="text-[8px] border-t border-gray-300 pt-1 text-center">
                <p className="text-gray-700">Consulta de autenticidade no portal nacional da NF-e:</p>
                <p className="font-semibold text-[8px] text-blue-900 underline">www.nfe.fazenda.gov.br/portal</p>
              </div>
            </div>
          </div>

          {/* PROTOCOLO DE AUTORIZAÇÃO */}
          <div className="grid grid-cols-12 border-x-2 border-b-2 border-black bg-gray-50 text-[9px]">
            <div className="col-span-7 p-1 border-r border-black">
              <span className="text-[7px] uppercase font-bold text-gray-600 block">Natureza da Operação</span>
              <span className="font-bold">{dados.naturezaOperacao}</span>
            </div>
            <div className="col-span-5 p-1">
              <span className="text-[7px] uppercase font-bold text-gray-600 block">Protocolo de Autorização de Uso</span>
              <span className="font-bold font-mono">{resultado.protocoloAutorizacao} — {new Date(resultado.dataAutorizacao).toLocaleString('pt-BR')}</span>
            </div>
          </div>

          {/* DESTINATÁRIO / REMETENTE */}
          <div className="mt-1 border-2 border-black">
            <div className="bg-gray-200 px-1.5 py-0.5 border-b border-black font-bold uppercase text-[8px]">
              Destinatário / Remetente
            </div>
            <div className="grid grid-cols-12 text-[9px]">
              <div className="col-span-8 p-1 border-r border-b border-black">
                <span className="text-[7px] uppercase text-gray-600 block">Nome / Razão Social</span>
                <span className="font-bold">{dados.destinatario.nome}</span>
              </div>
              <div className="col-span-4 p-1 border-b border-black">
                <span className="text-[7px] uppercase text-gray-600 block">CNPJ / CPF</span>
                <span className="font-mono font-bold">{dados.destinatario.cpfCnpj || 'Consumidor Final'}</span>
              </div>
              <div className="col-span-6 p-1 border-r border-b border-black">
                <span className="text-[7px] uppercase text-gray-600 block">Endereço</span>
                <span>{dados.destinatario.endereco || 'Não informado'}</span>
              </div>
              <div className="col-span-4 p-1 border-r border-b border-black">
                <span className="text-[7px] uppercase text-gray-600 block">Bairro / Distrito</span>
                <span>{dados.destinatario.bairro || 'Centro'}</span>
              </div>
              <div className="col-span-2 p-1 border-b border-black">
                <span className="text-[7px] uppercase text-gray-600 block">CEP</span>
                <span className="font-mono">{dados.destinatario.cep || '79000-000'}</span>
              </div>
              <div className="col-span-6 p-1 border-r border-black">
                <span className="text-[7px] uppercase text-gray-600 block">Município</span>
                <span>{dados.destinatario.cidade || 'Campo Grande'}</span>
              </div>
              <div className="col-span-1 p-1 border-r border-black text-center">
                <span className="text-[7px] uppercase text-gray-600 block">UF</span>
                <span className="font-bold">{dados.destinatario.uf || 'MS'}</span>
              </div>
              <div className="col-span-3 p-1 border-r border-black">
                <span className="text-[7px] uppercase text-gray-600 block">Telefone</span>
                <span>{dados.destinatario.telefone || '—'}</span>
              </div>
              <div className="col-span-2 p-1">
                <span className="text-[7px] uppercase text-gray-600 block">Data Emissão</span>
                <span className="font-bold">{dados.dataEmissao.toLocaleDateString('pt-BR')}</span>
              </div>
            </div>
          </div>

          {/* CÁLCULO DO IMPOSTO */}
          <div className="mt-1 border-2 border-black">
            <div className="bg-gray-200 px-1.5 py-0.5 border-b border-black font-bold uppercase text-[8px]">
              Cálculo do Imposto
            </div>
            <div className="grid grid-cols-5 text-[9px] text-right">
              <div className="p-1 border-r border-b border-black">
                <span className="text-[7px] uppercase text-gray-600 block text-left">Base de Cálculo ICMS</span>
                <span className="font-mono">{fmtNum(dados.totalProdutos)}</span>
              </div>
              <div className="p-1 border-r border-b border-black">
                <span className="text-[7px] uppercase text-gray-600 block text-left">Valor do ICMS</span>
                <span className="font-mono">{fmtNum(totalICMS)}</span>
              </div>
              <div className="p-1 border-r border-b border-black">
                <span className="text-[7px] uppercase text-gray-600 block text-left">Base de Cálculo ICMS ST</span>
                <span className="font-mono">0,00</span>
              </div>
              <div className="p-1 border-r border-b border-black">
                <span className="text-[7px] uppercase text-gray-600 block text-left">Valor ICMS ST</span>
                <span className="font-mono">0,00</span>
              </div>
              <div className="p-1 border-b border-black">
                <span className="text-[7px] uppercase text-gray-600 block text-left">Valor Total dos Produtos</span>
                <span className="font-mono font-bold">{fmt(dados.totalProdutos)}</span>
              </div>
              <div className="p-1 border-r border-black">
                <span className="text-[7px] uppercase text-gray-600 block text-left">Valor do Frete</span>
                <span className="font-mono">{fmtNum(dados.freteValor)}</span>
              </div>
              <div className="p-1 border-r border-black">
                <span className="text-[7px] uppercase text-gray-600 block text-left">Valor do Seguro</span>
                <span className="font-mono">0,00</span>
              </div>
              <div className="p-1 border-r border-black">
                <span className="text-[7px] uppercase text-gray-600 block text-left">Desconto</span>
                <span className="font-mono">0,00</span>
              </div>
              <div className="p-1 border-r border-black">
                <span className="text-[7px] uppercase text-gray-600 block text-left">Outras Despesas</span>
                <span className="font-mono">0,00</span>
              </div>
              <div className="p-1 bg-gray-100">
                <span className="text-[7px] uppercase text-gray-800 block text-left font-bold">Valor Total da Nota</span>
                <span className="font-mono font-black text-[11px] text-black">{fmt(dados.totalVenda)}</span>
              </div>
            </div>
          </div>

          {/* TRANSPORTADOR / VOLUMES TRANSPORTADOS */}
          <div className="mt-1 border-2 border-black">
            <div className="bg-gray-200 px-1.5 py-0.5 border-b border-black font-bold uppercase text-[8px]">
              Transportador / Volumes Transportados
            </div>
            <div className="grid grid-cols-12 text-[9px]">
              <div className="col-span-6 p-1 border-r border-black">
                <span className="text-[7px] uppercase text-gray-600 block">Razão Social</span>
                <span className="font-bold">{dados.freteTransportadora || 'Transporte próprio / Correios'}</span>
              </div>
              <div className="col-span-3 p-1 border-r border-black">
                <span className="text-[7px] uppercase text-gray-600 block">Frete por Conta</span>
                <span>{dados.freteModalidade === 0 ? '0 - Emitente (CIF)' : dados.freteModalidade === 1 ? '1 - Destinatário (FOB)' : '9 - Sem Frete'}</span>
              </div>
              <div className="col-span-3 p-1">
                <span className="text-[7px] uppercase text-gray-600 block">Forma de Pagamento</span>
                <span className="font-semibold">{dados.formaPagamento}</span>
              </div>
            </div>
          </div>

          {/* DADOS DOS PRODUTOS / SERVIÇOS */}
          <div className="mt-1 border-2 border-black overflow-x-auto">
            <div className="bg-gray-200 px-1.5 py-0.5 border-b border-black font-bold uppercase text-[8px]">
              Dados dos Produtos / Serviços
            </div>
            <table className="w-full text-[8px] border-collapse">
              <thead>
                <tr className="border-b border-black bg-gray-50 text-[7px] uppercase">
                  <th className="p-1 text-left border-r border-black">Cód. Prod</th>
                  <th className="p-1 text-left border-r border-black">Descrição do Produto</th>
                  <th className="p-1 text-center border-r border-black">NCM</th>
                  <th className="p-1 text-center border-r border-black">CFOP</th>
                  <th className="p-1 text-center border-r border-black">UN</th>
                  <th className="p-1 text-right border-r border-black">Qtd</th>
                  <th className="p-1 text-right border-r border-black">Vlr Unit</th>
                  <th className="p-1 text-right border-r border-black">Vlr Total</th>
                  <th className="p-1 text-right border-r border-black">BC ICMS</th>
                  <th className="p-1 text-right">Alíq %</th>
                </tr>
              </thead>
              <tbody>
                {dados.itens.map((item, idx) => (
                  <tr key={idx} className="border-b border-gray-300 last:border-b-0 font-mono">
                    <td className="p-1 border-r border-black text-left">{item.codigo || `PRD-${idx + 1}`}</td>
                    <td className="p-1 border-r border-black text-left font-sans font-semibold">{item.descricao}</td>
                    <td className="p-1 border-r border-black text-center">{item.ncm || '8708.29.99'}</td>
                    <td className="p-1 border-r border-black text-center">{item.cfop || '5102'}</td>
                    <td className="p-1 border-r border-black text-center">{item.unidade || 'UN'}</td>
                    <td className="p-1 border-r border-black text-right">{item.quantidade}</td>
                    <td className="p-1 border-r border-black text-right">{fmtNum(item.valorUnitario)}</td>
                    <td className="p-1 border-r border-black text-right font-bold">{fmtNum(item.valorTotal)}</td>
                    <td className="p-1 border-r border-black text-right">{fmtNum(item.valorTotal)}</td>
                    <td className="p-1 text-right">{(item.icmsAliquota || 0).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* DADOS ADICIONAIS */}
          <div className="mt-1 border-2 border-black">
            <div className="bg-gray-200 px-1.5 py-0.5 border-b border-black font-bold uppercase text-[8px]">
              Dados Adicionais
            </div>
            <div className="p-1.5 text-[8px] text-gray-800 leading-normal min-h-[45px]">
              <p><strong>Informações Complementares:</strong> {dados.informacoesAdicionais || 'Documento emitido por ME ou EPP optante pelo Simples Nacional. Não gera direito a crédito fiscal de IPI.'}</p>
              <p className="mt-1 text-gray-600 font-mono">Venda ref: {dados.vendaNumero} | Emissor: PeçaFácil Pro | Regime Especial ICMS MS</p>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
