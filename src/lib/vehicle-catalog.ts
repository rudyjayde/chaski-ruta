// Catalogo de marcas/modelos de unidades (Jayde, 19 sept 2026): cada marca
// tiene UN solo modelo, y de ahi sale el tipo de vehiculo. Mismo catalogo que
// backend/src/vehicles/vehicle-catalog.ts -- agregar una marca nueva = agregar
// una fila en los dos.
export type VehicleTypeCode = 'SPRINTER' | 'HIACE' | 'MASTER' | 'OTRO';

export interface VehicleBrand {
  brand: string;
  model: string;
  type: VehicleTypeCode;
}

export const VEHICLE_BRANDS: VehicleBrand[] = [
  { brand: 'Mercedes Benz', model: 'Sprinter', type: 'SPRINTER' },
  { brand: 'Renault', model: 'Master', type: 'MASTER' },
  { brand: 'Toyota', model: 'Hiace', type: 'HIACE' },
];

// Pasajeros vendibles, sin contar al conductor: igual que el mapa de SeatMap.tsx y
// que passengerSeats() en backend/src/vehicles/vehicle-catalog.ts.
export const passengerSeats = (vehicleType: string) => (vehicleType === 'SPRINTER' ? 20 : 15);

export const findVehicleBrand = (brand: string) => VEHICLE_BRANDS.find(b => b.brand === brand);
