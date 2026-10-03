import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { CompaniesModule } from './companies/companies.module';
import { PeopleModule } from './people/people.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { QueuesModule } from './queues/queues.module';
import { ManifestsModule } from './manifests/manifests.module';
import { TripsModule } from './trips/trips.module';
import { RelocationsModule } from './relocations/relocations.module';
import { AuditModule } from './audit/audit.module';
import { OperationalConfigModule } from './operational-config/operational-config.module';
import { UploadsModule } from './uploads/uploads.module';
import { AssistantModule } from './assistant/assistant.module';
import { GpsModule } from './gps/gps.module';
import { RoutesModule } from './routes/routes.module';
import { CommercialRequestsModule } from './commercial-requests/commercial-requests.module';
import { LandingContentModule } from './landing-content/landing-content.module';
import { ComplaintBookModule } from './complaint-book/complaint-book.module';
import { DigestModule } from './digest/digest.module';
import { SafetyModule } from './safety/safety.module';
import { RouteRiskModule } from './route-risk/route-risk.module';
import { GpsAlertsModule } from './gps-alerts/gps-alerts.module';
import { NoticesModule } from './notices/notices.module';
import { FleetReportsModule } from './fleet-reports/fleet-reports.module';
import { EngineLockModule } from './engine-lock/engine-lock.module';
import { RouteGeofenceModule } from './route-geofence/route-geofence.module';
import { PassengerProfilesModule } from './passenger-profiles/passenger-profiles.module';
import { HealthMonitorModule } from './health-monitor/health-monitor.module';
import { SupportTicketsModule } from './support-tickets/support-tickets.module';
import { ProblemsModule } from './problems/problems.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Limite de peticiones por IP (13 sept 2026, auditoria de seguridad):
    // sin esto, alguien podia probar contraseñas ilimitadas por segundo
    // contra /auth/login. Default generoso (no molesta el uso normal, ni el
    // polling cada 15-20s del frontend); /auth/login tiene su propio limite
    // mas estricto via @Throttle en auth.controller.ts.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    OrganizationsModule,
    CompaniesModule,
    PeopleModule,
    VehiclesModule,
    QueuesModule,
    ManifestsModule,
    TripsModule,
    RelocationsModule,
    AuditModule,
    OperationalConfigModule,
    UploadsModule,
    AssistantModule,
    GpsModule,
    RoutesModule,
    CommercialRequestsModule,
    LandingContentModule,
    ComplaintBookModule,
    DigestModule,
    SafetyModule,
    RouteRiskModule,
    GpsAlertsModule,
    NoticesModule,
    FleetReportsModule,
    EngineLockModule,
    RouteGeofenceModule,
    PassengerProfilesModule,
    HealthMonitorModule,
    SupportTicketsModule,
    ProblemsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
