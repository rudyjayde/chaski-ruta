import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  emailVerified: boolean;
}

// Confirma la identidad real del correo de Google de la persona (Sign in with Google).
// No crea cuentas por si sola: solo entrega el perfil verificado a AuthService,
// que decide si esa persona ya existe (invitada por un admin) o la rechaza.
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    super({
      clientID: config.get<string>('GOOGLE_CLIENT_ID'),
      clientSecret: config.get<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: config.get<string>('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const email = profile.emails?.[0]?.value;
    const emailVerified = profile.emails?.[0]?.verified !== false;

    if (!email) {
      return done(new Error('Google no devolvio un correo verificable'), undefined);
    }

    const googleProfile: GoogleProfile = {
      googleId: profile.id,
      email: email.toLowerCase(),
      name: profile.displayName,
      emailVerified,
    };
    done(null, googleProfile);
  }
}
