import { IsDateString, IsString, MinLength } from 'class-validator';
import { IsLicense } from '../../common/validators';

// Registrar o corregir la licencia de un conductor que ya existe (los 15 de
// la siembra inicial no tienen ninguna).
export class UpdateLicenseDto {
  @IsString()
  @IsLicense()
  license: string;

  @IsString()
  @MinLength(1, { message: 'Indica la categoría de la licencia' })
  licenseCategory: string;

  @IsDateString({}, { message: 'Indica la fecha de vencimiento de la licencia' })
  licenseExpiry: string;
}
