import { IsIn, IsOptional, IsString } from 'class-validator';

// Reporte manual del conductor/socio -- a diferencia del resto de
// GpsAlertType (siempre detectados por el cron), esto lo crea directamente
// una persona desde su panel ("Reportar falla GPS" / "Reportar emergencia").
export class ReportGpsAlertDto {
  @IsIn(['BOTON_PANICO', 'FALLA_REPORTADA'])
  type: 'BOTON_PANICO' | 'FALLA_REPORTADA';

  @IsOptional()
  @IsString()
  note?: string;
}
