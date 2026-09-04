import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
  ],
})
export class AppModule {}
