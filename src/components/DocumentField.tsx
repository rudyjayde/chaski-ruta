import { PASSENGER_DOCUMENT_TYPES, documentError, documentPlaceholder, isValidDocument, sanitizeDocument, type DocumentType } from '../lib/validators';

// Tipo de documento + numero, con el formato de cada tipo (DNI 8 numeros, carne de
// extranjeria, pasaporte, RUC). Se usa en pasajeros del manifiesto y en el Libro
// de Reclamaciones.
export default function DocumentField({
  types = PASSENGER_DOCUMENT_TYPES,
  docType,
  value,
  onDocType,
  onValue,
  size = 'md',
  id,
}: {
  types?: { value: DocumentType; label: string }[];
  docType: DocumentType;
  value: string;
  onDocType: (type: DocumentType) => void;
  onValue: (value: string) => void;
  size?: 'sm' | 'md';
  id?: string;
}) {
  const height = size === 'sm' ? 'h-8 px-2 rounded' : 'h-9 px-3 rounded-lg';
  const invalid = value.length > 0 && !isValidDocument(docType, value);
  return (
    <div>
      <div className="flex gap-2">
        <select
          aria-label="Tipo de documento"
          value={docType}
          onChange={e => { const next = e.target.value as DocumentType; onDocType(next); onValue(sanitizeDocument(next, value)); }}
          className={`${height} border border-border text-sm bg-surface flex-shrink-0`}
        >
          {types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <input
          id={id}
          aria-label="Número de documento"
          value={value}
          onChange={e => onValue(sanitizeDocument(docType, e.target.value))}
          inputMode={docType === 'DNI' || docType === 'RUC' ? 'numeric' : 'text'}
          autoComplete="off"
          placeholder={documentPlaceholder(docType)}
          className={`${height} border text-sm w-full min-w-0 ${invalid ? 'border-danger' : 'border-border'}`}
        />
      </div>
      {invalid && <p className="text-[11px] text-danger mt-0.5">{documentError(docType)}</p>}
    </div>
  );
}
