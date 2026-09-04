import type { VehicleType } from '../types';

type SeatStatus = 'available' | 'selected' | 'occupied' | 'disabled';
type CellType = 'passenger' | 'driver' | 'door' | 'aisle' | 'empty';

interface Cell {
  type: CellType;
  seatNumber?: number;
  status?: SeatStatus;
}

interface Props {
  vehicleType: VehicleType;
  occupiedSeats?: number[];
  selectedSeats?: number[];
  onSeatClick?: (seatNumber: number) => void;
  readonly?: boolean;
}

function buildSprinterLayout(occupied: Set<number>, selected: Set<number>): Cell[][] {
  const seat = (n: number): Cell => ({
    type: 'passenger', seatNumber: n,
    status: occupied.has(n) ? 'occupied' : selected.has(n) ? 'selected' : 'available',
  });
  return [
    [{ type: 'driver' }, { type: 'empty' }, { type: 'empty' }, seat(1)],
    [seat(2), seat(3), seat(4), { type: 'door' }],
    [seat(5), seat(6), { type: 'aisle' }, seat(7)],
    [seat(8), seat(9), { type: 'aisle' }, seat(10)],
    [seat(11), seat(12), { type: 'aisle' }, seat(13)],
    [seat(14), seat(15), { type: 'aisle' }, seat(16)],
    [seat(17), seat(18), seat(19), seat(20)],
  ];
}

function buildHiaceLayout(occupied: Set<number>, selected: Set<number>): Cell[][] {
  const seat = (n: number): Cell => ({
    type: 'passenger', seatNumber: n,
    status: occupied.has(n) ? 'occupied' : selected.has(n) ? 'selected' : 'available',
  });
  return [
    [{ type: 'driver' }, { type: 'empty' }, seat(1), seat(2)],
    [seat(3), seat(4), seat(5), { type: 'door' }],
    [seat(6), seat(7), seat(8), { type: 'empty' }],
    [seat(9), seat(10), seat(11), { type: 'empty' }],
    [seat(12), seat(13), seat(14), seat(15)],
  ];
}

const CELL_STYLE: Record<SeatStatus, string> = {
  available: 'bg-surface border-border hover:border-primary hover:bg-primary/5 cursor-pointer text-t1',
  selected: 'bg-primary border-primary text-white cursor-pointer',
  occupied: 'bg-t2/10 border-border text-t2 cursor-not-allowed',
  disabled: 'bg-bg border-border text-muted cursor-not-allowed opacity-50',
};

function SeatCell({ cell, onClick }: { cell: Cell; onClick?: () => void }) {
  if (cell.type === 'driver') {
    return (
      <div className="w-12 h-10 rounded border border-border bg-bg flex items-center justify-center">
        <span className="text-[10px] font-medium text-t2">CHOFER</span>
      </div>
    );
  }
  if (cell.type === 'door') {
    return (
      <div className="w-12 h-10 rounded border border-border bg-bg flex items-center justify-center">
        <span className="text-[10px] font-medium text-t2">PUERTA</span>
      </div>
    );
  }
  if (cell.type === 'aisle') {
    return (
      <div className="w-12 h-10 flex items-center justify-center">
        <div className="w-full h-0.5 bg-border" />
      </div>
    );
  }
  if (cell.type === 'empty') {
    return <div className="w-12 h-10" />;
  }
  // passenger
  const status = cell.status ?? 'available';
  return (
    <button
      className={`w-12 h-10 rounded border text-sm font-medium transition-colors ${CELL_STYLE[status]}`}
      onClick={status === 'available' || status === 'selected' ? onClick : undefined}
      disabled={status === 'occupied' || status === 'disabled'}
      aria-label={`Asiento ${String(cell.seatNumber).padStart(2, '0')} — ${status}`}
      title={`Asiento ${String(cell.seatNumber).padStart(2, '0')} — ${status}`}
    >
      {String(cell.seatNumber).padStart(2, '0')}
    </button>
  );
}

export default function SeatMap({ vehicleType, occupiedSeats = [], selectedSeats = [], onSeatClick, readonly = false }: Props) {
  const occupied = new Set(occupiedSeats);
  const selected = new Set(selectedSeats);

  const layout = (vehicleType === 'SPRINTER' ? buildSprinterLayout : buildHiaceLayout)(occupied, selected);
  const capacity = vehicleType === 'SPRINTER' ? 20 : 15;
  const available = capacity - occupied.size;

  return (
    <div>
      <div className="flex items-center gap-4 mb-4 text-sm">
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded border border-border bg-surface inline-block" />
          Libre ({available})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded border border-primary bg-primary inline-block" />
          Seleccionado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded border border-border bg-t2/10 inline-block" />
          Ocupado ({occupied.size})
        </span>
      </div>

      <div className="inline-block border border-border rounded-lg p-4 bg-bg">
        <div className="space-y-2">
          {layout.map((row, ri) => (
            <div key={ri} className="flex gap-2 items-center">
              {row.map((cell, ci) => (
                <SeatCell
                  key={ci}
                  cell={cell}
                  onClick={!readonly && cell.type === 'passenger' && cell.seatNumber
                    ? () => onSeatClick?.(cell.seatNumber!)
                    : undefined}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="mt-3 text-sm text-t2 text-center">
          {vehicleType === 'SPRINTER' ? 'Mercedes Benz Sprinter · 20 pasajeros' : `${vehicleType === 'HIACE' ? 'Toyota Hiace' : 'Renault Master'} · 15 pasajeros`}
        </div>
      </div>
    </div>
  );
}
