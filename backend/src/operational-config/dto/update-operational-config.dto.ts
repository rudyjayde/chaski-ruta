import { IsNumber, IsOptional, IsString } from 'class-validator';

// Todos opcionales: se actualiza solo lo que el Super Admin cambia en la pantalla.
export class UpdateOperationalConfigDto {
  @IsOptional() @IsNumber() minTripMinutesOutbound?: number;
  @IsOptional() @IsNumber() minTripMinutesReturn?: number;
  @IsOptional() @IsNumber() gpsRadiusMeters?: number;
  @IsOptional() @IsNumber() timeoutMinutes?: number;
  @IsOptional() @IsNumber() anomalySpeedThresholdKmh?: number;

  @IsOptional() @IsString() terminalOriginName?: string;
  @IsOptional() @IsString() terminalOriginAddress?: string;
  @IsOptional() @IsString() terminalDestinationName?: string;
  @IsOptional() @IsString() terminalDestinationAddress?: string;

  @IsOptional() @IsNumber() terminalOriginLat?: number;
  @IsOptional() @IsNumber() terminalOriginLng?: number;
  @IsOptional() @IsNumber() terminalDestinationLat?: number;
  @IsOptional() @IsNumber() terminalDestinationLng?: number;

  @IsOptional() @IsString() initialConfigNotes?: string;
}
