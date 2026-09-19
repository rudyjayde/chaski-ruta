import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CreateComplaintDto } from './dto/create-complaint.dto';

@Injectable()
export class ComplaintBookService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  /**
   * Publico, sin autenticacion -- cualquier persona reclama sobre el
   * servicio de CHASKI AI, tenga o no cuenta. El numero correlativo
   * (RC-{año}-{secuencial}) es lo que se le entrega al reclamante como
   * constancia -- se calcula dentro de una transaccion para evitar dos
   * reclamos con el mismo numero.
   */
  async create(dto: CreateComplaintDto) {
    // Campo trampa anti-robots: si viene lleno, se descarta sin guardar y se
    // responde como si hubiera funcionado para que el robot no aprenda.
    if (dto.website?.trim()) return { number: 'RC-RECIBIDO', id: 'descartado' };

    const year = new Date().getFullYear();
    const prefix = `RC-${year}-`;
    const entry = await this.prisma.$transaction(async tx => {
      const count = await tx.complaintBookEntry.count({ where: { number: { startsWith: prefix } } });
      const number = `${prefix}${String(count + 1).padStart(4, '0')}`;
      return tx.complaintBookEntry.create({
        data: {
          number,
          type: dto.type,
          consumerName: dto.consumerName,
          consumerDocument: dto.consumerDocument,
          consumerDocumentType: dto.consumerDocumentType ?? 'DNI',
          consumerAddress: dto.consumerAddress,
          consumerEmail: dto.consumerEmail.toLowerCase(),
          consumerPhone: dto.consumerPhone,
          isMinor: dto.isMinor ?? false,
          guardianName: dto.guardianName,
          serviceDescription: dto.serviceDescription,
          claimedAmount: dto.claimedAmount,
          detail: dto.detail,
          consumerRequest: dto.consumerRequest,
        },
      });
    });

    // Best-effort -- el reclamo ya quedo guardado arriba, asi que un correo
    // fallido nunca lo pierde (ver MailService.sendComplaintConfirmation /
    // sendComplaintInternalNotification).
    void this.mail.sendComplaintConfirmation({
      to: entry.consumerEmail,
      consumerName: entry.consumerName,
      number: entry.number,
      type: entry.type,
    });
    void this.mail.sendComplaintInternalNotification({
      number: entry.number,
      type: entry.type,
      consumerName: entry.consumerName,
      consumerEmail: entry.consumerEmail,
      consumerPhone: entry.consumerPhone,
      serviceDescription: entry.serviceDescription,
    });

    return { number: entry.number, id: entry.id };
  }

  /** Solo Super Admin -- listado completo. */
  findAll() {
    return this.prisma.complaintBookEntry.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const entry = await this.prisma.complaintBookEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('Reclamo no encontrado');
    return entry;
  }

  /**
   * Solo Super Admin -- registra la respuesta del proveedor. La norma exige
   * responder dentro de un plazo (hoy 30 dias calendario) -- este sistema no
   * bloquea el registro fuera de plazo, solo lo guarda; el seguimiento del
   * plazo queda a criterio de quien administra el libro.
   */
  async respond(id: string, providerResponse: string) {
    await this.findOne(id);
    return this.prisma.complaintBookEntry.update({
      where: { id },
      data: { status: 'RESPONDIDO', providerResponse, respondedAt: new Date() },
    });
  }
}
