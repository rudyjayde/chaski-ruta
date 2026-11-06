import { TriangleAlert } from 'lucide-react';

// Cartel visible mientras la asociacion tenga el Modo presentacion encendido,
// para que nadie confunda una inscripcion sin verificar con una real.
export default function PresentationModeNotice({ org, className = 'rounded-lg' }: { org: { presentationMode?: boolean } | null; className?: string }) {
  if (!org?.presentationMode) return null;
  return (
    <div className={`flex items-start gap-2.5 border border-warn/40 bg-warn/10 px-3.5 py-2.5 text-sm text-t1 ${className}`} role="status">
      <TriangleAlert size={16} className="text-warn flex-shrink-0 mt-0.5" />
      <p>
        <strong>Modo presentación: ubicación no verificada.</strong> Se puede inscribir en cualquier terminal sin importar dónde se encuentre la unidad.
      </p>
    </div>
  );
}
