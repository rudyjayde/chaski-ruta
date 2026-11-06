// Catalogo de marcas/modelos de unidades (Jayde, 19 sept 2026): cada marca
// tiene UN solo modelo, y de ahi sale el tipo de vehiculo -- nada de escribir
// la marca a mano ni adivinar el tipo por el texto. Mismo catalogo que
// src/lib/vehicle-catalog.ts en el frontend; agregar una marca nueva = agregar
// una fila en los dos.
export const VEHICLE_CATALOG = [
  { brand: 'Mercedes Benz', model: 'Sprinter', type: 'SPRINTER' },
  { brand: 'Renault', model: 'Master', type: 'MASTER' },
  { brand: 'Toyota', model: 'Hiace', type: 'HIACE' },
] as const;

export type VehicleTypeCode = (typeof VEHICLE_CATALOG)[number]['type'];

// Pasajeros vendibles, sin contar al conductor (Jayde, 6 nov 2026): Hiace y Master
// llevan 16 asientos en total y Sprinter 21. Igual que el mapa de SeatMap.tsx.
export function passengerSeats(vehicleType: string): number {
  return vehicleType === 'SPRINTER' ? 20 : 15;
}

// Valor guardado en Vehicle.model: "Mercedes Benz Sprinter".
export const VEHICLE_MODELS: string[] = VEHICLE_CATALOG.map((v) => `${v.brand} ${v.model}`);

export const VEHICLE_TYPE_BY_MODEL: Record<string, VehicleTypeCode> = Object.fromEntries(
  VEHICLE_CATALOG.map((v) => [`${v.brand} ${v.model}`, v.type]),
);
