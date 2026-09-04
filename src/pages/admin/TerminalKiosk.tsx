import { useState, useEffect } from 'react';
import { QrCode, RefreshCw, Wifi, WifiOff, Clock } from 'lucide-react';

const VALIDATIONS = [
  { code: '004', plate: 'Z1A-123', driver: 'Carlos Ticona Mamani', time: '05:48', status: 'OK' },
  { code: '006', plate: 'Z2B-234', driver: 'Marco Ramos Apaza', time: '05:52', status: 'OK' },
  { code: '009', plate: 'Z3C-345', driver: 'Eulogio Cruz Ticona', time: '05:55', status: 'OK' },
  { code: '012', plate: 'Z4A-456', driver: 'Rafael Mamani Flores', time: '05:57', status: 'ADVERTENCIA' },
];

const QR_BASE = 'CHASKI-QR-TERMINAL-2026-';

export default function TerminalKiosk() {
  const [terminal, setTerminal] = useState<'JULI' | 'PUNO'>('JULI');
  const [countdown, setCountdown] = useState(30);
  const [qrSuffix, setQrSuffix] = useState(Math.random().toString(36).slice(2, 8).toUpperCase());
  const [qrStatus, setQrStatus] = useState<'VIGENTE' | 'RENOVANDO' | 'SIN_CONEXION'>('VIGENTE');

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          setQrStatus('RENOVANDO');
          setTimeout(() => {
            setQrSuffix(Math.random().toString(36).slice(2, 8).toUpperCase());
            setQrStatus('VIGENTE');
          }, 800);
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const qrData = `${QR_BASE}${terminal}-${qrSuffix}`;
  const qrColor = qrStatus === 'VIGENTE' ? 'text-ok' : qrStatus === 'RENOVANDO' ? 'text-warn' : 'text-danger';
  const qrBg = qrStatus === 'VIGENTE' ? 'bg-ok/5 border-ok/30' : qrStatus === 'RENOVANDO' ? 'bg-warn/5 border-warn/30' : 'bg-danger/5 border-danger/30';

  return (
    <div className="p-6 lg:p-8 max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-t1">Control terminal — Kiosco QR</h1>
          <p className="text-sm text-t2 mt-0.5">Jornada 29/08/2026 — Turno Mañana</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-ok flex items-center gap-1"><Wifi size={13} /> Conectado</span>
        </div>
      </div>

      {/* Terminal selector */}
      <div className="flex gap-3">
        {(['JULI', 'PUNO'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTerminal(t)}
            className={`px-5 py-2 rounded-lg text-sm font-medium border transition-colors ${
              terminal === t ? 'bg-primary text-white border-primary' : 'border-border text-t2 hover:bg-hover'
            }`}
          >
            Terminal {t}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* QR display */}
        <div className={`border rounded-lg p-6 text-center ${qrBg}`}>
          <div className="mb-3 flex items-center justify-center gap-2">
            <span className={`text-sm font-semibold uppercase ${qrColor}`}>
              {qrStatus === 'VIGENTE' ? 'QR Vigente' : qrStatus === 'RENOVANDO' ? 'Renovando…' : 'Sin conexión'}
            </span>
            {qrStatus === 'RENOVANDO' && <RefreshCw size={13} className="text-warn animate-spin" />}
          </div>

          {/* QR visual representation */}
          <div className="inline-block p-4 bg-white rounded-lg border border-border mb-4 relative">
            <div className="w-48 h-48 relative">
              {/* QR code simulation using a grid pattern */}
              <div className="absolute inset-0 grid grid-cols-10 gap-0.5 p-2">
                {Array.from({ length: 100 }, (_, i) => {
                  const seed = (i * 7 + qrSuffix.charCodeAt(i % qrSuffix.length)) % 3;
                  return (
                    <div key={i} className={`rounded-[1px] ${seed === 0 ? 'bg-t1' : 'bg-transparent'}`} />
                  );
                })}
              </div>
              {/* Corner squares */}
              <div className="absolute top-2 left-2 w-10 h-10 border-4 border-t1 rounded-sm" />
              <div className="absolute top-2 right-2 w-10 h-10 border-4 border-t1 rounded-sm" />
              <div className="absolute bottom-2 left-2 w-10 h-10 border-4 border-t1 rounded-sm" />
              {/* Inner squares */}
              <div className="absolute top-4 left-4 w-5 h-5 bg-t1 rounded-sm" />
              <div className="absolute top-4 right-4 w-5 h-5 bg-t1 rounded-sm" />
              <div className="absolute bottom-4 left-4 w-5 h-5 bg-t1 rounded-sm" />
            </div>
            {qrStatus !== 'VIGENTE' && (
              <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-lg">
                <RefreshCw size={24} className="text-warn animate-spin" />
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-2 text-sm text-t2 mb-2">
            <Clock size={14} />
            <span>Renueva en <strong className={`${countdown <= 5 ? 'text-danger' : 'text-t1'}`}>{countdown}s</strong></span>
          </div>

          <p className="text-[11px] font-mono text-muted break-all">{qrData}</p>
          <p className="text-sm text-muted mt-2">Escanear desde la app del conductor registrado</p>
        </div>

        {/* Info + validations */}
        <div className="space-y-4">
          <div className="border border-border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-t2 uppercase tracking-wide mb-3">Información del kiosco</h3>
            <div className="space-y-2 text-sm">
              {[
                ['Terminal', `Terminal ${terminal}`],
                ['Jornada', '29/08/2026 — Mañana'],
                ['Función', 'Registro de presencia'],
                ['Modo', 'Pendiente de conexión con el servicio de validación'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-t2">{k}</span>
                  <span className="text-t1 font-medium">{v}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 p-2 bg-primary/5 border border-primary/20 rounded text-sm text-primary">
              El QR acredita presencia en terminal. No asigna posición en cola ni prueba solo que el vehículo está presente.
            </div>
          </div>

          <div className="border border-border rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-bg border-b border-border">
              <h3 className="text-sm font-semibold text-t2">Últimas validaciones</h3>
            </div>
            <div className="divide-y divide-border">
              {VALIDATIONS.map((v, i) => (
                <div key={i} className="px-3 py-2.5 flex items-center gap-3 text-sm">
                  <QrCode size={13} className={v.status === 'OK' ? 'text-ok' : 'text-warn'} />
                  <span className="font-semibold text-t1 w-8">{v.code}</span>
                  <span className="font-mono text-t2">{v.plate}</span>
                  <span className="flex-1 text-t2 truncate">{v.driver}</span>
                  <span className="font-mono text-t2">{v.time}</span>
                  <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${v.status === 'OK' ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'}`}>
                    {v.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
