import { IsDefined } from 'class-validator';

// El contenido de cada seccion de la landing tiene una forma distinta (HERO es
// un objeto, PROBLEMS/CAPABILITIES/FAQ/FLEET_SHOWCASE son arreglos, etc.) --
// se guarda tal cual, sin validar cada campo aqui, igual que `answers` en
// CommercialRequest.
//
// CORREGIDO (11 sept 2026): antes decia @IsObject(), que en class-validator
// EXCLUYE arreglos a proposito (isObject hace `!Array.isArray(value)`) --
// pese a que el comentario original decia lo contrario. Eso rompia en
// silencio el guardado de toda seccion que es un arreglo (PROBLEMS,
// CAPABILITIES, FAQ, FLEET_SHOWCASE) con "data must be an object". IsDefined
// solo exige que `data` no sea null/undefined, sin pelearse con la forma.
export class UpsertLandingSectionDto {
  @IsDefined()
  data: unknown;
}
