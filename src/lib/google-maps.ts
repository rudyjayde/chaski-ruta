// Carga perezosa del script de Google Maps JavaScript API -- compartido entre
// el mini-mapa privado del conductor (DriverApp.tsx) y el mapa en vivo de
// flota del admin PRO (GPSLivePage.tsx). Se carga una sola vez por sesion de
// navegador aunque varias pantallas lo pidan.
export function loadGoogleMaps(): Promise<void> {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  if (!apiKey) return Promise.reject(new Error('sin-api-key'));

  const w = window as unknown as { google?: { maps: unknown } };
  if (w.google?.maps) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.getElementById('chaski-google-maps-script');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('load-error')));
      return;
    }
    const script = document.createElement('script');
    script.id = 'chaski-google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('load-error'));
    document.head.appendChild(script);
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getGoogleMaps(): any {
  return (window as any).google?.maps;
}
