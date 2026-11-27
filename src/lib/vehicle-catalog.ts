export type CambioFiltro = '' | 'automatico' | 'manual';
export type ArFiltro = '' | 'com_ar' | 'sem_ar';
export type TracaoFiltro = '' | '4x4' | '4x2';

export interface VehicleFilterState {
  montadora: string;
  veiculo: string;
  ano: string;
  motor: string;
  modelo: string;
  cambio: CambioFiltro;
  ar: ArFiltro;
  tracao: TracaoFiltro;
}

export const EMPTY_VEHICLE_FILTER: VehicleFilterState = {
  montadora: '',
  veiculo: '',
  ano: '',
  motor: '',
  modelo: '',
  cambio: '',
  ar: '',
  tracao: '',
};

export const MONTADORAS_VEICULOS: Record<string, string[]> = {
  Chevrolet: [
    'Onix', 'Onix Plus', 'Prisma', 'Celta', 'Corsa', 'Classic', 'Cruze',
    'Tracker', 'Spin', 'Montana', 'S10', 'Cobalt', 'Astra', 'Vectra',
    'Meriva', 'Zafira', 'Trailblazer', 'Equinox', 'Captiva', 'Blazer',
  ],
  Fiat: [
    'Uno', 'Palio', 'Siena', 'Grand Siena', 'Strada', 'Toro', 'Mobi',
    'Argo', 'Cronos', 'Pulse', 'Fastback', 'Fiorino', 'Ducato', 'Punto',
    'Linea', 'Idea', 'Doblo', 'Weekend', 'Bravo', 'Stilo', 'Titano',
  ],
  Ford: [
    'Ka', 'Ka Sedan', 'Fiesta', 'New Fiesta', 'EcoSport', 'Focus',
    'Ranger', 'Fusion', 'Territory', 'Maverick', 'Bronco Sport', 'Transit',
    'Courier', 'Edge', 'F-250', 'F-1000',
  ],
  Honda: [
    'Civic', 'City', 'Fit', 'HR-V', 'WR-V', 'CR-V', 'ZR-V', 'Accord',
  ],
  Hyundai: [
    'HB20', 'HB20S', 'HB20X', 'Creta', 'Tucson', 'ix35', 'Santa Fe',
    'Azera', 'Elantra', 'i30', 'HR',
  ],
  Jeep: [
    'Renegade', 'Compass', 'Commander', 'Wrangler', 'Grand Cherokee',
  ],
  Mitsubishi: [
    'L200 Triton', 'L200', 'Pajero', 'Pajero Sport', 'Outlander', 'ASX', 'Eclipse Cross',
  ],
  Nissan: [
    'Kicks', 'Versa', 'March', 'Sentra', 'Frontier', 'Tiida', 'Livina',
  ],
  Peugeot: [
    '208', '2008', '3008', '206', '207', '307', '308', 'Partner', 'Boxer',
  ],
  Renault: [
    'Kwid', 'Sandero', 'Logan', 'Duster', 'Oroch', 'Captur', 'Kardian',
    'Master', 'Kangoo', 'Clio', 'Megane', 'Fluence',
  ],
  Toyota: [
    'Corolla', 'Corolla Cross', 'Hilux', 'SW4', 'Yaris', 'Etios', 'RAV4',
  ],
  Volkswagen: [
    'Gol', 'Voyage', 'Saveiro', 'Polo', 'Virtus', 'Fox', 'CrossFox',
    'SpaceFox', 'Up!', 'T-Cross', 'Nivus', 'Taos', 'Amarok', 'Jetta',
    'Golf', 'Parati', 'Santana', 'Kombi', 'Tiguan', 'Delivery',
  ],
  Citroen: [
    'C3', 'C4 Cactus', 'C4 Lounge', 'Aircross', 'Berlingo', 'Jumpy', 'Jumper',
  ],
  Kia: [
    'Sportage', 'Cerato', 'Soul', 'Picanto', 'Sorento', 'Bongo',
  ],
  Iveco: [
    'Daily', 'Tector', 'Stralis', 'Hi-Way',
  ],
  'Mercedes-Benz': [
    'Sprinter', 'Accelo', 'Atego', 'Axor', 'Actros', 'Classe A', 'Classe C',
  ],
  Scania: [
    'R440', 'R450', 'R500', 'P310', 'G420', 'S500',
  ],
  Volvo: [
    'FH 460', 'FH 540', 'VM 270', 'XC60', 'XC40',
  ],
};

export const MOTORES_PADRAO: string[] = [
  '1.0', '1.0 Turbo', '1.0 TSI', '1.2', '1.3', '1.3 Turbo', '1.4', '1.4 TSI',
  '1.5', '1.6', '1.6 16V', '1.8', '2.0', '2.0 Turbo', '2.0 TDI', '2.2',
  '2.3', '2.4', '2.5', '2.7', '2.8', '3.0', '3.2', '4.0', 'Flex', 'Diesel',
];

export const MODELOS_PADRAO: string[] = [
  'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8',
  'Base', 'LS', 'LT', 'LTZ', 'Premier', 'RS', 'Activ',
  'Attractive', 'Essence', 'Way', 'Trekking', 'Drive', 'Volcano', 'Ranch', 'Ultra',
  'SE', 'SEL', 'Titanium', 'XLS', 'XLT', 'Limited', 'Storm',
  'EX', 'EXL', 'LX', 'Touring', 'Comfort', 'Comfortline', 'Highline', 'Trendline',
  'Sense', 'Advance', 'Exclusive', 'SR', 'SRV', 'SRX', 'XEi', 'Altis', 'GLi',
  'Longitude', 'Sport', 'Trailhawk', 'Zen', 'Intense', 'Iconic',
];

export const ANOS_PADRAO: string[] = Array.from(
  { length: new Date().getFullYear() + 2 - 1990 },
  (_, idx) => String(new Date().getFullYear() + 1 - idx),
);

function normalizeText(value: string | null | undefined): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function hasActiveVehicleFilter(filter: VehicleFilterState): boolean {
  return Boolean(
    filter.montadora ||
      filter.veiculo ||
      filter.ano ||
      filter.motor ||
      filter.modelo ||
      filter.cambio ||
      filter.ar ||
      filter.tracao,
  );
}

function matchesYear(text: string, anoStr: string): boolean {
  const target = parseInt(anoStr, 10);
  if (!Number.isFinite(target)) return true;
  const shortTarget = String(target).slice(-2);

  // Explicit 4-digit year match
  if (new RegExp(`\\b${target}\\b`).test(text)) return true;

  // 4-digit year ranges like 2014-2020, 2014 a 2020, 2014/2020, 2014 até 2020
  const range4 = text.matchAll(/\b((?:19|20)\d{2})\s*(?:-|\/|a|ate)\s*((?:19|20)\d{2})\b/g);
  for (const m of range4) {
    const start = parseInt(m[1], 10);
    const end = parseInt(m[2], 10);
    if (target >= Math.min(start, end) && target <= Math.max(start, end)) return true;
  }

  // Open-ended ranges like 2018->, 2018 em diante, 2018+
  const open4 = text.matchAll(/\b((?:19|20)\d{2})\s*(?:\+|em diante|->)/g);
  for (const m of open4) {
    const start = parseInt(m[1], 10);
    if (target >= start) return true;
  }

  // 2-digit year ranges like 14/20, 14-20, 14 a 20
  const range2 = text.matchAll(/\b(\d{2})\s*(?:-|\/|a|ate)\s*(\d{2})\b/g);
  for (const m of range2) {
    const y1 = parseInt(m[1], 10);
    const y2 = parseInt(m[2], 10);
    const full1 = y1 >= 80 ? 1900 + y1 : 2000 + y1;
    const full2 = y2 >= 80 ? 1900 + y2 : 2000 + y2;
    if (target >= Math.min(full1, full2) && target <= Math.max(full1, full2)) return true;
  }

  // Common Brazil shorthand like "18/18" or "/18"
  if (new RegExp(`(?:^|\\s|/)${shortTarget}(?:\\s|/|$)`).test(text)) return true;

  return false;
}

const CAMBIO_AUTOMATICO_TERMS = ['automatico', 'automatica', 'aut.', 'cvt', 'dsg', 'tiptronic', 'powershift', 'at6', 'at8'];
const CAMBIO_MANUAL_TERMS = ['manual', 'mecanico', 'mecanica', 'mt5', 'mt6'];
const COM_AR_TERMS = ['com ar', 'c/ ar', 'c/ar', 'ar condicionado', 'ar-condicionado', 'c/ ac', 'a/c'];
const SEM_AR_TERMS = ['sem ar', 's/ ar', 's/ar', 's/ ac'];
const TRACAO_4X4_TERMS = ['4x4', '4 x 4', '4wd', 'awd', 'integral'];
const TRACAO_4X2_TERMS = ['4x2', '4 x 2', '2wd'];

function matchesAnyTerm(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

export interface ProdutoSearchable {
  nome?: string | null;
  aplicacao?: string | null;
  marca?: string | null;
  categoria?: string | null;
  tipo_veiculo?: string | null;
}

export function matchesVehicleFilter(produto: ProdutoSearchable, filter: VehicleFilterState): boolean {
  if (!hasActiveVehicleFilter(filter)) return true;

  const corpus = normalizeText(
    [produto.nome, produto.aplicacao, produto.marca, produto.categoria, produto.tipo_veiculo]
      .filter(Boolean)
      .join(' '),
  );

  if (filter.montadora) {
    const mont = normalizeText(filter.montadora);
    const aliases = mont === 'volkswagen' ? ['volkswagen', 'vw'] : mont === 'chevrolet' ? ['chevrolet', 'gm'] : [mont];
    if (!aliases.some((a) => corpus.includes(a))) return false;
  }

  if (filter.veiculo) {
    const veic = normalizeText(filter.veiculo);
    if (!corpus.includes(veic)) return false;
  }

  if (filter.ano && !matchesYear(corpus, filter.ano)) {
    return false;
  }

  if (filter.motor) {
    const mot = normalizeText(filter.motor);
    if (!corpus.includes(mot)) return false;
  }

  if (filter.modelo) {
    const mod = normalizeText(filter.modelo);
    if (!corpus.includes(mod)) return false;
  }

  if (filter.cambio === 'automatico' && !matchesAnyTerm(corpus, CAMBIO_AUTOMATICO_TERMS)) {
    return false;
  }
  if (filter.cambio === 'manual' && !matchesAnyTerm(corpus, CAMBIO_MANUAL_TERMS)) {
    return false;
  }

  if (filter.ar === 'com_ar' && !matchesAnyTerm(corpus, COM_AR_TERMS)) {
    return false;
  }
  if (filter.ar === 'sem_ar' && !matchesAnyTerm(corpus, SEM_AR_TERMS)) {
    return false;
  }

  if (filter.tracao === '4x4' && !matchesAnyTerm(corpus, TRACAO_4X4_TERMS)) {
    return false;
  }
  if (filter.tracao === '4x2' && !matchesAnyTerm(corpus, TRACAO_4X2_TERMS)) {
    return false;
  }

  return true;
}

export function buildVehicleSearchTokens(filter: VehicleFilterState): string[] {
  const tokens: string[] = [];
  if (filter.veiculo) tokens.push(filter.veiculo);
  else if (filter.montadora) tokens.push(filter.montadora);
  if (filter.motor) tokens.push(filter.motor.split(' ')[0]);
  if (filter.modelo) tokens.push(filter.modelo);
  if (filter.tracao) tokens.push(filter.tracao);
  if (filter.cambio === 'automatico') tokens.push('automatico');
  if (filter.cambio === 'manual') tokens.push('manual');
  return tokens;
}

export function getMontadorasList(): string[] {
  return Object.keys(MONTADORAS_VEICULOS).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function getVeiculosForMontadora(montadora: string): string[] {
  if (montadora && MONTADORAS_VEICULOS[montadora]) {
    return [...MONTADORAS_VEICULOS[montadora]].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }
  const all = new Set<string>();
  for (const list of Object.values(MONTADORAS_VEICULOS)) {
    for (const v of list) all.add(v);
  }
  return Array.from(all).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
