'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Station } from '@/lib/db';
import { COLONIA_ZOOM, type LatLng } from '@/lib/map';
import { stationLabel } from '@/lib/station';
import { iconFor } from './spookyIcon';
import Modal from './Modal';
import { Toast, useToast } from './Toast';

/** Encuadra el mapa sobre todas las estaciones registradas. */
function FitToStations({ stations }: { stations: Station[] }) {
  const map = useMap();

  useEffect(() => {
    if (stations.length === 0) return;

    if (stations.length === 1) {
      map.setView([stations[0].lat, stations[0].lng], 16);
      return;
    }

    map.fitBounds(
      L.latLngBounds(stations.map((s) => [s.lat, s.lng] as [number, number])),
      { padding: [50, 50], maxZoom: 17 }
    );
  }, [stations, map]);

  return null;
}

export default function StationsMap({
  stations,
  center,
  coloniaId,
}: {
  stations: Station[];
  center: LatLng;
  coloniaId: string;
}) {
  const router = useRouter();
  const { toast, showToast } = useToast();
  const [pending, setPending] = useState<Station | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  // Al borrar, el servidor manda la lista nueva; mientras tanto se ocultan las
  // que ya se quitaron para que el mapa no muestre un marcador fantasma.
  // (El borrado es suave: la estación sigue en la base marcada como eliminada.)
  const [removed, setRemoved] = useState<string[]>([]);
  const visible = useMemo(
    () => stations.filter((s) => !removed.includes(s.id)),
    [stations, removed]
  );

  function closeModal() {
    if (busy) return;
    setPending(null);
    setCode('');
  }

  async function remove() {
    if (!pending) return;

    if (code.trim() === '') {
      showToast('Escribe el código para eliminar.', true);
      return;
    }

    setBusy(true);

    try {
      // El código viaja en el cuerpo, no en la URL: así no queda en los logs
      // del servidor ni en el historial. Quien valida es la API.
      const res = await fetch('/api/stations', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: pending.id, coloniaId, code: code.trim() }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // Con código incorrecto el diálogo sigue abierto para reintentar.
        showToast(data.error ?? 'No se pudo eliminar la estación.', true);
        setCode('');
        return;
      }

      setRemoved((ids) => [...ids, pending.id]);
      showToast(`Se eliminó “${stationLabel(pending)}”.`);
      setPending(null);
      setCode('');
      router.refresh();
    } catch {
      showToast('Sin conexión. Revisa tu internet e inténtalo de nuevo.', true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={COLONIA_ZOOM}
        className="map map--tall"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <FitToStations stations={visible} />

        {visible.map((station) => (
          <Marker key={station.id} position={[station.lat, station.lng]} icon={iconFor(station.id)}>
            <Popup>
              <strong>{stationLabel(station)}</strong>
              <br />
              {station.lat.toFixed(5)}, {station.lng.toFixed(5)}
              <button
                type="button"
                className="popup__remove"
                onClick={() => setPending(station)}
              >
                🗑️ Eliminar estación
              </button>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <Modal
        open={pending !== null}
        title="Eliminar estación"
        confirmText="Sí, eliminar"
        busyText="Eliminando…"
        danger
        busy={busy}
        onClose={closeModal}
        onConfirm={remove}
      >
        <p>
          Se va a quitar <strong>{pending && stationLabel(pending)}</strong> del mapa y de la
          lista de estaciones.
        </p>
        <p className="hint">
          Deja de aparecer para todos, pero el registro se conserva por si hay que recuperarla.
        </p>

        <div className="field">
          <label htmlFor="deleteCode">Código de organizador</label>
          <input
            id="deleteCode"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder="••••"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !busy) remove();
            }}
            disabled={busy}
          />
          <p className="hint">Solo quien organiza la ruta puede eliminar estaciones.</p>
        </div>
      </Modal>

      <Toast toast={toast} />
    </>
  );
}
