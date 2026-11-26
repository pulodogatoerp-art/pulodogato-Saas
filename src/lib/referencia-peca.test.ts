import { describe, it, expect, vi } from 'vitest';
import { buscarDadosPorReferencia } from '@/services/referenciaPecaService';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        or: () => ({
          limit: async () => ({ data: [], error: null }),
        }),
      }),
    }),
  },
}));

describe('Assistente de Busca por Referência de Peça', () => {
  it('identifica referência exata de catálogo cruzado (ex: PSL55)', async () => {
    const res = await buscarDadosPorReferencia('PSL55');
    expect(res.encontrado).toBe(true);
    expect(res.marca).toBe('TECFIL');
    expect(res.categoria).toBe('Filtros');
    expect(res.ncm).toBe('84212300');
    expect(res.aplicacao).toContain('ONIX');
  });

  it('infere fabricante, categoria e NCM pelo padrão de código (ex: N-999 Cobreq)', async () => {
    const res = await buscarDadosPorReferencia('N-999');
    expect(res.encontrado).toBe(true);
    expect(res.marca).toBe('COBREQ');
    expect(res.categoria).toBe('Freios');
    expect(res.ncm).toBe('87083019');
  });

  it('retorna encontrado=false para código muito curto', async () => {
    const res = await buscarDadosPorReferencia('A');
    expect(res.encontrado).toBe(false);
  });
});
