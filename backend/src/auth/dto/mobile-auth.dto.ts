import { IsEmail, IsIn, IsOptional, IsString, Length, MinLength } from 'class-validator';

// Datos de la instalacion que manda la app nativa en cada inicio de sesion.
export class MobileDeviceDto {
  // Identificador de instalacion que genera la app y guarda en almacenamiento seguro.
  @IsString()
  @Length(8, 200)
  deviceId: string;

  @IsIn(['ANDROID', 'IOS'])
  platform: 'ANDROID' | 'IOS';

  @IsOptional()
  @IsString()
  @Length(1, 40)
  appVersion?: string;
}

export class MobileGoogleLoginDto extends MobileDeviceDto {
  // idToken que entrega Google Sign-In nativo (Android / iOS).
  @IsString()
  @MinLength(1)
  idToken: string;
}

export class MobilePasswordLoginDto extends MobileDeviceDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  password: string;
}

export class MobileSelectProfileDto extends MobileDeviceDto {
  @IsString()
  select: string;

  @IsString()
  personId: string;
}

export class MobileRefreshDto {
  @IsString()
  @MinLength(1)
  refreshToken: string;
}

export class MobilePushTokenDto {
  @IsString()
  @Length(1, 4096)
  pushToken: string;
}
