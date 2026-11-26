import { supabase } from '@/integrations/supabase/client';

export interface DadosReferenciaPeca {
  encontrado: boolean;
  fonte: 'catalogo_local' | 'base_referencias' | 'padrao_fabricante';
  codigoReferencia: string;
  nome?: string;
  marca?: string;
  categoria?: string;
  tipo_veiculo?: string;
  aplicacao?: string;
  ncm?: string;
  observacao?: string;
}

interface EntradaReferencia {
  codigos: string[];
  nome: string;
  marca: string;
  categoria: string;
  tipo_veiculo: string;
  aplicacao: string;
  ncm: string;
}

// Base de referências automotivas mais comuns no balcão de autopeças
const BASE_REFERENCIAS: EntradaReferencia[] = [
  {
    codigos: ['PSL55', 'PSL 55', 'W712/75', 'W71275', 'PH5949', 'OC90', 'OC 90', 'TM1', 'WO-120', 'WO120'],
    nome: 'FILTRO DE OLEO DO MOTOR',
    marca: 'TECFIL',
    categoria: 'Filtros',
    tipo_veiculo: 'Carro',
    aplicacao: 'GM CELTA / CORSA / PRISMA / ONIX / COBALT / MONTANA / SPIN 1.0 1.4 1.8',
    ncm: '84212300',
  },
  {
    codigos: ['PSL560', 'W7MULTI', 'PH5548', 'OC250', 'WO-200', 'WO200'],
    nome: 'FILTRO DE OLEO DO MOTOR',
    marca: 'TECFIL',
    categoria: 'Filtros',
    tipo_veiculo: 'Carro',
    aplicacao: 'VW GOL / FOX / POLO / VOYAGE / SAVEIRO / UP 1.0 1.6 EA111',
    ncm: '84212300',
  },
  {
    codigos: ['PSL145', 'W719/30', 'PH10904', 'OX388D', 'WO-150'],
    nome: 'FILTRO DE OLEO DO MOTOR',
    marca: 'TECFIL',
    categoria: 'Filtros',
    tipo_veiculo: 'Carro',
    aplicacao: 'FIAT UNO / PALIO / STRADA / SIENA / MOBI / ARGO 1.0 1.3 1.4 FIRE',
    ncm: '84212300',
  },
  {
    codigos: ['ARL6091', 'C2295/2', 'LX1772', 'CA9766'],
    nome: 'FILTRO DE AR DO MOTOR',
    marca: 'TECFIL',
    categoria: 'Filtros',
    tipo_veiculo: 'Carro',
    aplicacao: 'VW GOL / SAVEIRO / VOYAGE G5 G6 1.0 1.6',
    ncm: '84213100',
  },
  {
    codigos: ['GI04/7', 'GI047', 'WK58', 'KL583', 'G10230'],
    nome: 'FILTRO DE COMBUSTIVEL FLEX',
    marca: 'TECFIL',
    categoria: 'Filtros',
    tipo_veiculo: 'Carro',
    aplicacao: 'UNIVERSAL FLEX VW / FIAT / GM / FORD / RENAULT',
    ncm: '84212300',
  },
  {
    codigos: ['N-1445', 'N1445', 'PD/1445', 'SYL1145', 'BB1445'],
    nome: 'JOGO DE PASTILHAS DE FREIO DIANTEIRA',
    marca: 'COBREQ',
    categoria: 'Freios',
    tipo_veiculo: 'Carro',
    aplicacao: 'GM ONIX / PRISMA / COBALT / SPIN 2013 A 2020',
    ncm: '87083019',
  },
  {
    codigos: ['N-372', 'N372', 'PD/51', 'HQJ2151', 'SYL1037'],
    nome: 'JOGO DE PASTILHAS DE FREIO DIANTEIRA',
    marca: 'COBREQ',
    categoria: 'Freios',
    tipo_veiculo: 'Carro',
    aplicacao: 'VW GOL / PARATI / SAVEIRO / VOYAGE G2 G3 G4 1.0 1.6 1.8',
    ncm: '87083019',
  },
  {
    codigos: ['N-517', 'N517', 'PD/82', 'SYL1082'],
    nome: 'JOGO DE PASTILHAS DE FREIO DIANTEIRA',
    marca: 'COBREQ',
    categoria: 'Freios',
    tipo_veiculo: 'Carro',
    aplicacao: 'FIAT PALIO / UNO / SIENA / STRADA 1.0 1.4',
    ncm: '87083019',
  },
  {
    codigos: ['SE 32760', 'SE32760', 'HG32760', 'GP32760', 'B47095'],
    nome: 'AMORTECEDOR DE SUSPENSAO DIANTEIRO',
    marca: 'NAKATA',
    categoria: 'Suspensão',
    tipo_veiculo: 'Carro',
    aplicacao: 'FIAT UNO / PALIO / SIENA / STRADA',
    ncm: '87088000',
  },
  {
    codigos: ['HG33051', 'GP33051', 'B47051', '334051'],
    nome: 'AMORTECEDOR DE SUSPENSAO DIANTEIRO',
    marca: 'NAKATA',
    categoria: 'Suspensão',
    tipo_veiculo: 'Carro',
    aplicacao: 'VW GOL / VOYAGE / SAVEIRO G5 G6 G7',
    ncm: '87088000',
  },
  {
    codigos: ['BKR6E', 'BKR6E-11', 'BKR5E', 'FR7DC', 'SP10'],
    nome: 'VELA DE IGNICAO RESISTIVA',
    marca: 'NGK',
    categoria: 'Motor',
    tipo_veiculo: 'Carro',
    aplicacao: 'FIAT / VW / GM / RENAULT MOTORES 1.0 1.4 1.6 8V FLEX',
    ncm: '85111000',
  },
  {
    codigos: ['6PK1200', '6PK 1200', '6PK1195', '5PK1195', 'KTB259'],
    nome: 'CORREIA POLY-V ALTERNADOR / DIRECAO',
    marca: 'GATES',
    categoria: 'Motor',
    tipo_veiculo: 'Carro',
    aplicacao: 'LINHA LEVE FLEX COM AR CONDICIONADO E DIRECAO',
    ncm: '40103100',
  },
];

// Regras de prefixo por fabricante para inferir dados quando o código exato não estiver na tabela fixa
const REGRAS_PREFIXO: Array<{
  regex: RegExp;
  marca: string;
  nomeBase: string;
  categoria: string;
  ncm: string;
  aplicacao: string;
  tipo_veiculo?: string;
}> = [
  { regex: /^PSL\d+/i, marca: 'TECFIL', nomeBase: 'FILTRO DE OLEO DO MOTOR', categoria: 'Filtros', ncm: '84212300', aplicacao: 'VW / FIAT / GM / FORD / RENAULT LINHA LEVE (CONFIRMAR MOTORIZAÇÃO)' },
  { regex: /^PEL\d+/i, marca: 'TECFIL', nomeBase: 'FILTRO DE OLEO REFIL (ECOLOGICO)', categoria: 'Filtros', ncm: '84212300', aplicacao: 'VW / GM / JEEP / FIAT / MERCEDES / BMW LINHA LEVE E UTILITARIOS' },
  { regex: /^ARL\d+/i, marca: 'TECFIL', nomeBase: 'FILTRO DE AR DO MOTOR', categoria: 'Filtros', ncm: '84213100', aplicacao: 'VW / FIAT / GM / FORD / HYUNDAI / TOYOTA LINHA LEVE' },
  { regex: /^ACP\d+/i, marca: 'TECFIL', nomeBase: 'FILTRO DE AR CONDICIONADO (CABINE)', categoria: 'Filtros', ncm: '84213990', aplicacao: 'VEICULOS DE PASSEIO E PICK-UPS COM AR CONDICIONADO' },
  { regex: /^GI\d+/i, marca: 'TECFIL', nomeBase: 'FILTRO DE COMBUSTIVEL', categoria: 'Filtros', ncm: '84212300', aplicacao: 'VW GOL / FIAT UNO PALIO / GM CORSA ONIX / FORD KA FIESTA FLEX' },
  { regex: /^PSC\d+/i, marca: 'TECFIL', nomeBase: 'FILTRO DE COMBUSTIVEL DIESEL', categoria: 'Filtros', ncm: '84212300', aplicacao: 'CAMINHOES / VANS / PICK-UPS DIESEL (S10 / HILUX / RANGER / DUCATO)', tipo_veiculo: 'Pesado' },
  { regex: /^WO-?\d+/i, marca: 'WEGA', nomeBase: 'FILTRO DE OLEO DO MOTOR', categoria: 'Filtros', ncm: '84212300', aplicacao: 'LINHA LEVE E UTILITARIOS (VW / FIAT / GM / FORD / RENAULT)' },
  { regex: /^FAP-?\d+/i, marca: 'WEGA', nomeBase: 'FILTRO DE AR DO MOTOR', categoria: 'Filtros', ncm: '84213100', aplicacao: 'LINHA LEVE FLEX / GASOLINA / DIESEL (CONFIRMAR MODELO)' },
  { regex: /^JFC-?\d+/i, marca: 'WEGA', nomeBase: 'FILTRO DE COMBUSTIVEL', categoria: 'Filtros', ncm: '84212300', aplicacao: 'TOYOTA / HONDA / HYUNDAI / NISSAN / MITSUBISHI' },
  { regex: /^OC\s?\d+/i, marca: 'MAHLE', nomeBase: 'FILTRO DE OLEO DO MOTOR', categoria: 'Filtros', ncm: '84212300', aplicacao: 'VW / FIAT / GM / FORD / RENAULT LINHA LEVE' },
  { regex: /^LX\s?\d+/i, marca: 'MAHLE', nomeBase: 'FILTRO DE AR DO MOTOR', categoria: 'Filtros', ncm: '84213100', aplicacao: 'VW / FIAT / GM / FORD / IMPORTADOS LINHA LEVE' },
  { regex: /^KL\s?\d+/i, marca: 'MAHLE', nomeBase: 'FILTRO DE COMBUSTIVEL', categoria: 'Filtros', ncm: '84212300', aplicacao: 'VEICULOS FLEX / GASOLINA / DIESEL' },
  { regex: /^PH\d+/i, marca: 'FRAM', nomeBase: 'FILTRO DE OLEO DO MOTOR', categoria: 'Filtros', ncm: '84212300', aplicacao: 'GM / VW / FIAT / FORD / RENAULT LINHA LEVE' },
  { regex: /^W\d{3,4}/i, marca: 'MANN-FILTER', nomeBase: 'FILTRO DE OLEO DO MOTOR', categoria: 'Filtros', ncm: '84212300', aplicacao: 'VW / AUDI / FIAT / GM / FORD / MERCEDES' },
  { regex: /^HU\d+/i, marca: 'MANN-FILTER', nomeBase: 'FILTRO DE OLEO REFIL', categoria: 'Filtros', ncm: '84212300', aplicacao: 'VW / AUDI / BMW / MERCEDES / JEEP / FIAT' },
  { regex: /^N-?\d{3,4}$/i, marca: 'COBREQ', nomeBase: 'JOGO DE PASTILHAS DE FREIO', categoria: 'Freios', ncm: '87083019', aplicacao: 'SISTEMA DE FREIO A DISCO LINHA LEVE (VW / FIAT / GM / FORD)' },
  { regex: /^PD\/?\d+/i, marca: 'FRAS-LE', nomeBase: 'JOGO DE PASTILHAS DE FREIO', categoria: 'Freios', ncm: '87083019', aplicacao: 'SISTEMA DE FREIO A DISCO LINHA LEVE E UTILITARIOS' },
  { regex: /^SYL\d+/i, marca: 'SYL', nomeBase: 'JOGO DE PASTILHAS DE FREIO', categoria: 'Freios', ncm: '87083019', aplicacao: 'LINHA LEVE NACIONAL E IMPORTADA (FREIO DIANTEIRO/TRASEIRO)' },
  { regex: /^BD\d+/i, marca: 'FREMAX', nomeBase: 'DISCO DE FREIO', categoria: 'Freios', ncm: '87083090', aplicacao: 'VW / FIAT / GM / FORD / RENAULT / TOYOTA / HONDA' },
  { regex: /^(HG|SE)\s?\d{4,5}/i, marca: 'NAKATA', nomeBase: 'AMORTECEDOR DE SUSPENSAO', categoria: 'Suspensão', ncm: '87088000', aplicacao: 'LINHA LEVE PASSEIO E UTILITARIOS (DIANTEIRO / TRASEIRO)' },
  { regex: /^(GP|MP|B47)\d+/i, marca: 'COFAP', nomeBase: 'AMORTECEDOR DE SUSPENSAO', categoria: 'Suspensão', ncm: '87088000', aplicacao: 'VW / FIAT / GM / FORD / RENAULT LINHA LEVE' },
  { regex: /^NBJ\d+/i, marca: 'NAKATA', nomeBase: 'PIVO / TERMINAL DE SUSPENSAO', categoria: 'Suspensão', ncm: '87088000', aplicacao: 'SUSPENSAO DIANTEIRA LINHA LEVE' },
  { regex: /^(BKR|BP|DCPR|CPR)\d+/i, marca: 'NGK', nomeBase: 'VELA DE IGNICAO', categoria: 'Motor', ncm: '85111000', aplicacao: 'MOTORES GASOLINA / FLEX 1.0 1.4 1.6 1.8 2.0' },
  { regex: /^[456]PK\d+/i, marca: 'GATES', nomeBase: 'CORREIA POLY-V ALTERNADOR', categoria: 'Motor', ncm: '40103100', aplicacao: 'LINHA LEVE COM ALTERNADOR / AR CONDICIONADO / DIRECAO' },
  { regex: /^KTB\d+/i, marca: 'DAYCO', nomeBase: 'KIT CORREIA DENTADA E TENSOR', categoria: 'Motor', ncm: '40103500', aplicacao: 'MOTORES 8V / 16V (VW / FIAT / GM / RENAULT)' },
  { regex: /^VKBA\d+/i, marca: 'SKF', nomeBase: 'KIT ROLAMENTO DE RODA', categoria: 'Suspensão', ncm: '84821090', aplicacao: 'CUBO / RODA DIANTEIRA OU TRASEIRA LINHA LEVE' },
  { regex: /^F026/i, marca: 'BOSCH', nomeBase: 'FILTRO AUTOMOTIVO BOSCH', categoria: 'Filtros', ncm: '84212300', aplicacao: 'LINHA LEVE E DIESEL BOSCH' },
  { regex: /^0986BB/i, marca: 'BOSCH', nomeBase: 'PASTILHA / COMPONENTE DE FREIO BOSCH', categoria: 'Freios', ncm: '87083019', aplicacao: 'SISTEMA DE FREIO LINHA LEVE BOSCH' },
];

function normalizarCodigo(cod: string): string {
  return cod.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export async function buscarDadosPorReferencia(codigoRaw: string): Promise<DadosReferenciaPeca> {
  const codigoLimpo = codigoRaw.trim().toUpperCase();
  const codigoNorm = normalizarCodigo(codigoLimpo);

  if (!codigoNorm || codigoNorm.length < 2) {
    return { encontrado: false, fonte: 'padrao_fabricante', codigoReferencia: codigoLimpo };
  }

  // 1. Consulta o catálogo local no Supabase para aproveitar peças já cadastradas/similares
  try {
    const { data: locais } = await (supabase as any)
      .from('produtos')
      .select('codigo, codigo_fabrica, nome, marca, categoria, tipo_veiculo, aplicacao, ncm')
      .or(`codigo.ilike.%${codigoLimpo}%,codigo_fabrica.ilike.%${codigoLimpo}%`)
      .limit(1);

    if (locais && locais.length > 0) {
      const p = locais[0];
      return {
        encontrado: true,
        fonte: 'catalogo_local',
        codigoReferencia: codigoLimpo,
        nome: p.nome || undefined,
        marca: p.marca || undefined,
        categoria: p.categoria || undefined,
        tipo_veiculo: p.tipo_veiculo || undefined,
        aplicacao: p.aplicacao || undefined,
        ncm: p.ncm || undefined,
        observacao: `Dados extraídos de referência existente no catálogo (${p.codigo_fabrica || p.codigo}).`,
      };
    }
  } catch {
    // Segue para a base de referências caso o banco esteja indisponível
  }

  // 2. Busca na base de referências cruzadas de autopeças
  for (const item of BASE_REFERENCIAS) {
    const match = item.codigos.some(c => normalizarCodigo(c) === codigoNorm);
    if (match) {
      return {
        encontrado: true,
        fonte: 'base_referencias',
        codigoReferencia: codigoLimpo,
        nome: `${item.nome} (${codigoLimpo})`,
        marca: item.marca,
        categoria: item.categoria,
        tipo_veiculo: item.tipo_veiculo,
        aplicacao: item.aplicacao,
        ncm: item.ncm,
        observacao: `Referência ${codigoLimpo} identificada na base técnica (${item.marca} · ${item.categoria}).`,
      };
    }
  }

  // 3. Inferência inteligente pelo prefixo/padrão do código do fabricante
  for (const regra of REGRAS_PREFIXO) {
    if (regra.regex.test(codigoLimpo) || regra.regex.test(codigoNorm)) {
      return {
        encontrado: true,
        fonte: 'padrao_fabricante',
        codigoReferencia: codigoLimpo,
        nome: `${regra.nomeBase} ${codigoLimpo}`,
        marca: regra.marca,
        categoria: regra.categoria,
        tipo_veiculo: regra.tipo_veiculo || 'Carro',
        aplicacao: regra.aplicacao,
        ncm: regra.ncm,
        observacao: `Padrão ${regra.marca} identificado pela referência ${codigoLimpo}.`,
      };
    }
  }

  return {
    encontrado: false,
    fonte: 'padrao_fabricante',
    codigoReferencia: codigoLimpo,
  };
}
