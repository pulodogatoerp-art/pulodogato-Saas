import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  gerarChaveAcesso,
  gerarQrCodeNfce,
  gerarXmlNFe,
  emitirDocumentoFiscal,
  NFeVendaData,
} from '@/services/nfeService';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      insert: async () => ({ data: null, error: null }),
      upsert: async () => ({ data: null, error: null }),
      update: () => ({ eq: async () => ({ data: null, error: null }) }),
    }),
  },
}));

describe('Cupom Fiscal (NFC-e Modelo 65) em Homologação', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const baseDados: NFeVendaData = {
    vendaId: 'venda-teste-homolog-1',
    vendaNumero: 'TESTE-HOMOL-001',
    dataEmissao: new Date('2026-11-25T17:50:00-04:00'),
    naturezaOperacao: 'VENDA AO CONSUMIDOR',
    serie: '1',
    numero: 1,
    modelo: '65',
    tipo: 'nfce',
    ambiente: 'homologacao',
    formaPagamento: 'Dinheiro',
    freteModalidade: 9,
    freteValor: 0,
    totalProdutos: 45,
    totalVenda: 45,
    cscId: '000001',
    cscToken: 'ffa0a4ef9c0175f8e08893a1b45c5ef39661',
    emitente: {
      cnpj: '64.514.013/0001-61',
      razaoSocial: 'AUTO PECAS MGN LTDA',
      nomeFantasia: 'AUTO PECAS MGN',
      ie: 'ISENTO',
      endereco: 'Rua Principal, S/N',
      cidade: 'Campo Grande',
      uf: 'MS',
      cep: '79000-000',
      regimeTributario: '4',
    },
    destinatario: {
      nome: 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL',
    },
    itens: [
      {
        id: '1',
        codigo: 'TESTE-001',
        descricao: 'FILTRO DE OLEO MOTOR (TESTE HOMOLOGACAO)',
        ncm: '84212300',
        cfop: '5102',
        unidade: 'UN',
        quantidade: 1,
        valorUnitario: 45,
        valorTotal: 45,
        icmsAliquota: 17,
        pisAliquota: 1.65,
        cofinsAliquota: 7.6,
      },
    ],
  };

  it('gera chave de acesso de 44 dígitos para NFC-e Modelo 65', () => {
    const chave = gerarChaveAcesso({
      cUF: '50',
      data: baseDados.dataEmissao,
      cnpj: baseDados.emitente.cnpj,
      mod: '65',
      serie: '1',
      nNF: 1,
    });
    expect(chave).toHaveLength(44);
    expect(chave.slice(20, 22)).toBe('65');
  });

  it('gera URL do QR Code v2.0 com tpAmb=2, cIdToken=1 e hash SHA-1 de 40 caracteres', () => {
    const chave = gerarChaveAcesso({
      cUF: '50',
      data: baseDados.dataEmissao,
      cnpj: baseDados.emitente.cnpj,
      mod: '65',
      serie: '1',
      nNF: 1,
    });
    const qr = gerarQrCodeNfce(chave, 'homologacao', '000001', 'ffa0a4ef9c0175f8e08893a1b45c5ef39661');
    expect(qr).toContain(`https://www.dfe.ms.gov.br/nfce/qrcode?p=${chave}|2|2|1|`);
    const hash = qr.split('|').pop();
    expect(hash).toMatch(/^[0-9A-F]{40}$/);
  });

  it('gera XML Layout 4.00 com tpAmb=2, mod=65, CRT=4 (MEI) e infNFeSupl', () => {
    const chave = gerarChaveAcesso({
      cUF: '50',
      data: baseDados.dataEmissao,
      cnpj: baseDados.emitente.cnpj,
      mod: '65',
      serie: '1',
      nNF: 1,
    });
    const xml = gerarXmlNFe(baseDados, chave, '150260000000001');
    expect(xml).toContain('<mod>65</mod>');
    expect(xml).toContain('<tpAmb>2</tpAmb>');
    expect(xml).toContain('<CRT>4</CRT>');
    expect(xml).toContain('<tpImp>4</tpImp>');
    expect(xml).toContain('<infNFeSupl>');
    expect(xml).toContain('NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL');
  });

  it('emite NFC-e de teste em homologação e retorna autorizado com XML e QR Code', async () => {
    const res = await emitirDocumentoFiscal(baseDados);
    expect(res.sucesso).toBe(true);
    expect(res.status).toBe('autorizada');
    expect(res.modelo).toBe('65');
    expect(res.tipo).toBe('nfce');
    expect(res.chaveAcesso).toHaveLength(44);
    expect(res.qrCodeUrl).toContain('|2|2|1|');
    expect(res.xml).toContain('<mod>65</mod>');
    expect(res.mensagem).toContain('Homologação');
  });
});
