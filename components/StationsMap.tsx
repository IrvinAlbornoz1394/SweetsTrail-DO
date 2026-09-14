'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Station } from '@/lib/db';
import { COLONIA_ZOOM, type LatLng } from '@/lib/map';
import Modal from './Modal';
import { Toast, useToast } from './Toast';

/**
 * Cada estación luce un elemento de Halloween distinto. No se sortea en cada
 * render: se deriva del id de la estación, así el fantasma de una casa sigue
 * siendo el mismo al recargar, al filtrar o al borrar otra estación.
 */
const SPOOKY = ['👻', '🎃', '🦇', '🕷️', '🕸️', '💀', '☠️', '🧙', '🧟', '🧛', '🪦', '⚰️', '🏰', '🐈‍⬛', '🦉', '🍬'];

function spookyFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return SPOOKY[hash % SPOOKY.length];
}

/** Mismo criterio que el selector: divIcon para no depender de las imágenes de Leaflet. */
const iconCache = new Map<string, L.DivIcon>();

function iconFor(id: string): L.DivIcon {
  let icon = iconCache.get(id);
  if (!icon) {
    icon = L.divIcon({
      className: '',
      html: `<div class="pin">${spookyFor(id)}</div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 30],
    });
    iconCache.set(id, icon);
  }
  return icon;
}

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
  const [busy, setBusy] = useState(false);

  // Al borrar, el servidor manda la lista nueva; mientras tanto se ocultan las
  // que ya se quitaron para que el mapa no muestre un marcador fantasma.
  const [removed, setRemoved] = useState<string[]>([]);
  const visible = useMemo(
    () => stations.filter((s) => !removed.includes(s.id)),
    [stations, removed]
  );

  async function remove() {
    if (!pending) return;
    setBusy(true);

    try {
      const res = await fetch(
        `/api/stations?id=${encodeURIComponent(pending.id)}&coloniaId=${encodeURIComponent(coloniaId)}`,
        { method: 'DELETE' }
      );
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        showToast(data.error ?? 'No se pudo eliminar la estación.', true);
        return;
      }

      setRemoved((ids) => [...ids, pending.id]);
      showToast(`Se eliminó “${pending.name}”.`);
      setPending(null);
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
              <strong>{station.name}</strong>
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
        onClose={() => !busy && setPending(null)}
        onConfirm={remove}
      >
        <p>
          Se va a quitar <strong>{pending?.name}</strong> del mapa y de la lista de estaciones.
        </p>
        <p className="hint">Esta acción no se puede deshacer: habría que registrarla de nuevo.</p>
      </Modal>

      <Toast toast={toast} />
    </>
  );
}
