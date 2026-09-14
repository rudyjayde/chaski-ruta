import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
  ],
})
export class AppModule {}
