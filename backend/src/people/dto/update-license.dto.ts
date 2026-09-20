import { IsDateString, IsIn, IsString } from 'class-validator';
import { IsLicense, LICENSE_CATEGORIES } from '../../common/validators';

// Registrar o corregir la licencia de un conductor que ya existe (los 15 de
// la siembra inicial no tienen ninguna).
export class UpdateLicenseDto {
  @IsString()
  @IsLicense()
  license: string;

  @IsIn(LICENSE_CATEGORIES, { message: `La categoría debe ser una de: ${LICENSE_CATEGORIES.join(', ')}` })
  licenseCategory: string;

  @IsDateString({}, { message: 'Indica la fecha de emisión de la licencia' })
  licenseIssuedAt: string;

  @IsDateString({}, { message: 'Indica la fecha de vencimiento de la licencia' })
  licenseExpiry: string;
}
