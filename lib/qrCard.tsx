import 'server-only';
import { ImageResponse } from 'next/og';
import QRCode from 'qrcode';

/**
 * Tarjeta para imprimir que va en cada estación: el QR que escanean las familias
 * al pasar, con el nombre de la casa debajo para que nadie pegue la de otra.
 *
 * Se dibuja con `ImageResponse` (Satori + Resvg), que ya viene con Next: solo
 * entiende flexbox y un subconjunto de CSS, por eso todo va en estilos en línea
 * y cada contenedor con más de un hijo declara `display: flex`. Los emojis se
 * descargan de Twemoji al generar; si no hay internet, la tarjeta sale sin ellos.
 */

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 1600;

const ORANGE = '#ff7a1a';
const PURPLE = '#7c3aed';
const NIGHT = '#120a1f';

/** Emojis sueltos en las orillas: decoran sin tapar el QR. */
const DECOR: { emoji: string; top: number; left: number; size: number; rotate: number }[] = [
  { emoji: '🦇', top: 40, left: 60, size: 90, rotate: -15 },
  { emoji: '🕸️', top: 30, left: 1040, size: 120, rotate: 0 },
  { emoji: '🦇', top: 300, left: 900, size: 70, rotate: 12 },
  { emoji: '👻', top: 1430, left: 60, size: 110, rotate: -8 },
  { emoji: '🎃', top: 1420, left: 1010, size: 130, rotate: 8 },
  { emoji: '🍬', top: 1490, left: 330, size: 64, rotate: -20 },
  { emoji: '🍭', top: 1490, left: 800, size: 64, rotate: 15 },
];

export async function renderStationCard({
  title,
  year,
  colonia,
  label,
  url,
}: {
  title: string;
  year: string;
  colonia: string;
  /** Rótulo de la estación (`stationLabel`). */
  label: string;
  /** Lo que abre el QR. */
  url: string;
}): Promise<ArrayBuffer> {
  // Corrección M: aguanta manchas y dobleces del papel sin volverse muy denso.
  const qr = await QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 600,
    color: { dark: NIGHT, light: '#ffffff' },
  });

  const image = new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          position: 'relative',
          backgroundImage: `linear-gradient(180deg, ${NIGHT} 0%, #2a1145 55%, #3b1a0b 100%)`,
          color: '#ffffff',
          padding: '90px 80px 0',
        }}
      >
        {DECOR.map((d, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: d.top,
              left: d.left,
              fontSize: d.size,
              transform: `rotate(${d.rotate}deg)`,
              display: 'flex',
            }}
          >
            {d.emoji}
          </div>
        ))}

        <div style={{ display: 'flex', fontSize: 40, letterSpacing: 6, color: '#c4b5fd' }}>
          🎃 NOCHE DE HALLOWEEN 🎃
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 18,
            fontSize: 96,
            fontWeight: 700,
            color: ORANGE,
            textAlign: 'center',
            lineHeight: 1.05,
          }}
        >
          {title}
        </div>
        <div style={{ display: 'flex', fontSize: 120, color: ORANGE, lineHeight: 1 }}>{year}</div>
        <div
          style={{
            display: 'flex',
            marginTop: 18,
            padding: '10px 34px',
            borderRadius: 999,
            border: `3px solid ${PURPLE}`,
            fontSize: 46,
            color: '#ede9fe',
          }}
        >
          {colonia}
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 44,
            padding: 28,
            borderRadius: 36,
            background: '#ffffff',
            border: `10px solid ${ORANGE}`,
            boxShadow: `0 0 60px ${PURPLE}`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} width={600} height={600} alt="" />
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 36,
            maxWidth: 900,
            fontSize: label.length > 28 ? 52 : 66,
            fontWeight: 700,
            textAlign: 'center',
            justifyContent: 'center',
            lineHeight: 1.1,
          }}
        >
          {label}
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginTop: 36,
            gap: 8,
            fontSize: 32,
            color: '#e9d5ff',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex' }}>📱 Escanea este código con la cámara de tu celular</div>
          <div style={{ display: 'flex' }}>y tu visita a esta estación queda marcada.</div>
        </div>
      </div>
    ),
    { width: CARD_WIDTH, height: CARD_HEIGHT, emoji: 'twemoji' }
  );

  return image.arrayBuffer();
}
