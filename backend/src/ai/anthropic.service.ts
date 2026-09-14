import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

// Wrapper generico de la API de Claude (Messages API) para cualquier funcion
// de "IA aplicada al negocio" (ia-aplicada.md) que no sea el asistente
// conversacional (ese ya tiene su propio cliente en assistant.service.ts,
// con tool calling). Usa el mismo SDK @anthropic-ai/sdk que ya es dependencia
// del backend (ver assistant.service.ts) -- no una implementacion aparte por
// fetch.
export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp';

// Mismo modelo que assistant.service.ts -- si esto empieza a fallar con
// "model not found", revisar console.anthropic.com/docs y/o definir
// ANTHROPIC_MODEL en .env para sobreescribirlo sin tocar codigo.
const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

@Injectable()
export class AnthropicService {
  private readonly logger = new Logger(AnthropicService.name);
  private client: Anthropic | null = null;

  constructor(private config: ConfigService) {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    }
  }

  private requireClient(): Anthropic {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'ANTHROPIC_API_KEY no esta configurada -- esta funcion de IA no esta disponible todavia.',
      );
    }
    return this.client;
  }

  private model(): string {
    return this.config.get<string>('ANTHROPIC_MODEL') || DEFAULT_MODEL;
  }

  private textFrom(response: Anthropic.Message): string {
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (!text) {
      throw new ServiceUnavailableException('La IA no devolvio una respuesta legible.');
    }
    return text;
  }

  /**
   * Manda una imagen + instruccion a Claude y devuelve el texto de la
   * respuesta tal cual (sin parsear JSON -- eso lo hace quien llama, porque
   * el formato esperado depende de cada caso de uso). No decide ni guarda
   * nada por su cuenta -- solo lee la imagen y devuelve texto.
   */
  async visionExtract(params: {
    imageBase64: string;
    mediaType: ImageMediaType;
    prompt: string;
    maxTokens?: number;
  }): Promise<string> {
    const client = this.requireClient();
    try {
      const response = await client.messages.create({
        model: this.model(),
        max_tokens: params.maxTokens ?? 2048,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: params.mediaType, data: params.imageBase64 } },
              { type: 'text', text: params.prompt },
            ],
          },
        ],
      });
      return this.textFrom(response);
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      this.logger.error(`Anthropic (vision) fallo: ${err instanceof Error ? err.message : String(err)}`);
      throw new ServiceUnavailableException('No se pudo leer la imagen con IA en este momento. Intenta de nuevo.');
    }
  }

  /**
   * Texto puro, sin imagen -- usado por ejemplo para redactar el resumen
   * diario (ia-aplicada.md §2.3) a partir de cifras YA calculadas por
   * Prisma. Claude nunca calcula ni inventa un numero aca: solo redacta en
   * prosa datos que quien llama ya calculo de forma determinista.
   */
  async textComplete(prompt: string, maxTokens = 1024): Promise<string> {
    const client = this.requireClient();
    try {
      const response = await client.messages.create({
        model: this.model(),
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      });
      return this.textFrom(response);
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      this.logger.error(`Anthropic (texto) fallo: ${err instanceof Error ? err.message : String(err)}`);
      throw new ServiceUnavailableException('No se pudo completar esta funcion de IA en este momento. Intenta de nuevo.');
    }
  }
}
