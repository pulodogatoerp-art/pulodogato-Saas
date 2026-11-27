import { describe, it, expect } from 'vitest';
import {
  EMPTY_VEHICLE_FILTER,
  hasActiveVehicleFilter,
  matchesVehicleFilter,
  type VehicleFilterState,
} from './vehicle-catalog';

const makeFilter = (overrides: Partial<VehicleFilterState>): VehicleFilterState => ({
  ...EMPTY_VEHICLE_FILTER,
  ...overrides,
});

describe('vehicle-catalog filter matching', () => {
  const hiluxPart = {
    nome: 'Filtro de Óleo Motor',
    marca: 'Tecfil',
    aplicacao: 'Toyota Hilux SW4 2.8 Diesel 2016-2023 4x4 Automático Com Ar',
  };

  const golPart = {
    nome: 'Kit Embreagem',
    marca: 'Sachs',
    aplicacao: 'Volkswagen Gol G5 G6 1.0 1.6 2009 a 2016 Manual Sem Ar',
  };

  it('matches everything when filter is empty', () => {
    expect(hasActiveVehicleFilter(EMPTY_VEHICLE_FILTER)).toBe(false);
    expect(matchesVehicleFilter(hiluxPart, EMPTY_VEHICLE_FILTER)).toBe(true);
    expect(matchesVehicleFilter(golPart, EMPTY_VEHICLE_FILTER)).toBe(true);
  });

  it('matches cascading montadora, veiculo, year range, motor, and modelo', () => {
    const f = makeFilter({
      montadora: 'Toyota',
      veiculo: 'Hilux',
      ano: '2019',
      motor: '2.8',
      modelo: 'SW4',
    });
    expect(matchesVehicleFilter(hiluxPart, f)).toBe(true);
    expect(matchesVehicleFilter(golPart, f)).toBe(false);
  });

  it('supports VW alias and year ranges with "a"', () => {
    const vwPart = { nome: 'Pastilha Freio', aplicacao: 'VW Gol G5 1.6 2010 a 2014' };
    expect(
      matchesVehicleFilter(
        vwPart,
        makeFilter({ montadora: 'Volkswagen', veiculo: 'Gol', ano: '2012', motor: '1.6', modelo: 'G5' }),
      ),
    ).toBe(true);
    expect(
      matchesVehicleFilter(vwPart, makeFilter({ montadora: 'Volkswagen', veiculo: 'Gol', ano: '2018' })),
    ).toBe(false);
  });

  it('matches checkbox filters: Automático/Manual, Com Ar/Sem Ar, 4x4/4x2', () => {
    expect(
      matchesVehicleFilter(hiluxPart, makeFilter({ cambio: 'automatico', ar: 'com_ar', tracao: '4x4' })),
    ).toBe(true);
    expect(
      matchesVehicleFilter(hiluxPart, makeFilter({ cambio: 'manual' })),
    ).toBe(false);
    expect(
      matchesVehicleFilter(golPart, makeFilter({ cambio: 'manual', ar: 'sem_ar' })),
    ).toBe(true);
    expect(
      matchesVehicleFilter(golPart, makeFilter({ ar: 'com_ar' })),
    ).toBe(false);
    expect(
      matchesVehicleFilter(hiluxPart, makeFilter({ tracao: '4x2' })),
    ).toBe(false);
  });
});
