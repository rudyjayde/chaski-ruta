import { IsNumber, IsOptional, IsString, Min, Max, MaxLength } from 'class-validator';

// Todos opcionales: se actualiza solo lo que el Super Admin cambia en la pantalla.
export class UpdateOperationalConfigDto {
  @IsOptional() @IsNumber() @Min(10) @Max(600) minTripMinutesOutbound?: number;
  @IsOptional() @IsNumber() @Min(10) @Max(600) minTripMinutesReturn?: number;
  @IsOptional() @IsNumber() @Min(50) @Max(2000) gpsRadiusMeters?: number;
  @IsOptional() @IsNumber() @Min(1) @Max(240) timeoutMinutes?: number;
  @IsOptional() @IsNumber() @Min(30) @Max(200) anomalySpeedThresholdKmh?: number;

  @IsOptional() @IsString() @MaxLength(150) terminalOriginName?: string;
  @IsOptional() @IsString() @MaxLength(200) terminalOriginAddress?: string;
  @IsOptional() @IsString() @MaxLength(150) terminalDestinationName?: string;
  @IsOptional() @IsString() @MaxLength(200) terminalDestinationAddress?: string;

  @IsOptional() @IsString() @MaxLength(60) routeOriginName?: string;
  @IsOptional() @IsString() @MaxLength(60) routeDestinationName?: string;

  @IsOptional() @IsNumber() @Min(-19) @Max(0) terminalOriginLat?: number;
  @IsOptional() @IsNumber() @Min(-82) @Max(-68) terminalOriginLng?: number;
  @IsOptional() @IsNumber() @Min(-19) @Max(0) terminalDestinationLat?: number;
  @IsOptional() @IsNumber() @Min(-82) @Max(-68) terminalDestinationLng?: number;

  @IsOptional() @IsString() @MaxLength(2000) initialConfigNotes?: string;
}
