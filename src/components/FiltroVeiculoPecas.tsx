import React, { useMemo } from 'react';
import { X, Car, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ANOS_PADRAO,
  EMPTY_VEHICLE_FILTER,
  MODELOS_PADRAO,
  MOTORES_PADRAO,
  getMontadorasList,
  getVeiculosForMontadora,
  hasActiveVehicleFilter,
  type ArFiltro,
  type CambioFiltro,
  type TracaoFiltro,
  type VehicleFilterState,
} from '@/lib/vehicle-catalog';

interface FiltroVeiculoPecasProps {
  value: VehicleFilterState;
  onChange: (next: VehicleFilterState) => void;
  compact?: boolean;
  className?: string;
}

interface ToggleChipProps {
  label: string;
  checked: boolean;
  onClick: () => void;
}

function ToggleChip({ label, checked, onClick }: ToggleChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={checked}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all select-none',
        checked
          ? 'border-primary bg-primary/10 text-primary shadow-xs'
          : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground',
      )}
    >
      <span
        className={cn(
          'flex h-3.5 w-3.5 items-center justify-center rounded border transition-colors',
          checked ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 bg-background',
        )}
      >
        {checked && <Check size={10} strokeWidth={3} />}
      </span>
      {label}
    </button>
  );
}

export default function FiltroVeiculoPecas({
  value,
  onChange,
  compact = false,
  className,
}: FiltroVeiculoPecasProps) {
  const montadoras = useMemo(() => getMontadorasList(), []);
  const veiculos = useMemo(() => getVeiculosForMontadora(value.montadora), [value.montadora]);
  const isActive = hasActiveVehicleFilter(value);

  const handleMontadoraChange = (montadora: string) => {
    const nextVeiculos = getVeiculosForMontadora(montadora);
    const keepVeiculo = value.veiculo && nextVeiculos.includes(value.veiculo) ? value.veiculo : '';
    onChange({
      ...value,
      montadora,
      veiculo: keepVeiculo,
    });
  };

  const toggleCambio = (target: Exclude<CambioFiltro, ''>) => {
    onChange({ ...value, cambio: value.cambio === target ? '' : target });
  };

  const toggleAr = (target: Exclude<ArFiltro, ''>) => {
    onChange({ ...value, ar: value.ar === target ? '' : target });
  };

  const toggleTracao = (target: Exclude<TracaoFiltro, ''>) => {
    onChange({ ...value, tracao: value.tracao === target ? '' : target });
  };

  const selectClass =
    'w-full rounded-lg border bg-background px-2.5 py-2 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all cursor-pointer';

  const labelClass = 'block text-[11px] font-medium text-muted-foreground mb-1';

  return (
    <div
      className={cn(
        'rounded-xl border bg-muted/20 p-3 space-y-2.5',
        compact && 'p-2.5 space-y-2',
        className,
      )}
    >
      {/* Linha 1: Montadora > Veículo > Ano > Motor > Modelo */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        <div>
          <label className={labelClass}>Montadora</label>
          <select
            aria-label="Montadora"
            value={value.montadora}
            onChange={(e) => handleMontadoraChange(e.target.value)}
            className={selectClass}
          >
            <option value="">Selecione</option>
            {montadoras.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Veículo</label>
          <select
            aria-label="Veículo"
            value={value.veiculo}
            onChange={(e) => onChange({ ...value, veiculo: e.target.value })}
            className={selectClass}
          >
            <option value="">Selecione</option>
            {veiculos.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Ano</label>
          <select
            aria-label="Ano"
            value={value.ano}
            onChange={(e) => onChange({ ...value, ano: e.target.value })}
            className={selectClass}
          >
            <option value="">Selecione</option>
            {ANOS_PADRAO.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Motor</label>
          <select
            aria-label="Motor"
            value={value.motor}
            onChange={(e) => onChange({ ...value, motor: e.target.value })}
            className={selectClass}
          >
            <option value="">Selecione</option>
            {MOTORES_PADRAO.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className="col-span-2 sm:col-span-1">
          <label className={labelClass}>Modelo</label>
          <select
            aria-label="Modelo"
            value={value.modelo}
            onChange={(e) => onChange({ ...value, modelo: e.target.value })}
            className={selectClass}
          >
            <option value="">Selecione</option>
            {MODELOS_PADRAO.map((mod) => (
              <option key={mod} value={mod}>
                {mod}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Linha 2: Filtros de marcação (Câmbio, Ar-condicionado, Tração) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 border-t border-border/60">
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
          <Car size={13} className="text-primary" />
          Opcionais:
        </span>

        <div className="flex flex-wrap items-center gap-1.5">
          <ToggleChip
            label="Automático"
            checked={value.cambio === 'automatico'}
            onClick={() => toggleCambio('automatico')}
          />
          <ToggleChip
            label="Manual"
            checked={value.cambio === 'manual'}
            onClick={() => toggleCambio('manual')}
          />
        </div>

        <div className="hidden sm:block h-4 w-px bg-border" />

        <div className="flex flex-wrap items-center gap-1.5">
          <ToggleChip
            label="Com Ar"
            checked={value.ar === 'com_ar'}
            onClick={() => toggleAr('com_ar')}
          />
          <ToggleChip
            label="Sem Ar"
            checked={value.ar === 'sem_ar'}
            onClick={() => toggleAr('sem_ar')}
          />
        </div>

        <div className="hidden sm:block h-4 w-px bg-border" />

        <div className="flex flex-wrap items-center gap-1.5">
          <ToggleChip
            label="4x4"
            checked={value.tracao === '4x4'}
            onClick={() => toggleTracao('4x4')}
          />
          <ToggleChip
            label="4x2"
            checked={value.tracao === '4x2'}
            onClick={() => toggleTracao('4x2')}
          />
        </div>

        {isActive && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_VEHICLE_FILTER)}
            className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:text-destructive transition-colors"
          >
            <X size={12} /> Limpar veículo
          </button>
        )}
      </div>
    </div>
  );
}
