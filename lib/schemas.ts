import { z } from 'zod';

/** Reglas de validación compartidas por los formularios y la API. */

const coloniaId = z.string().uuid('Colonia inválida.');

/**
 * Guarda para los ids que llegan por la URL. Postgres revienta con un texto que
 * no es uuid, así que las pantallas que reciben `?id=` lo filtran antes de
 * consultar y responden 404 igual que con un id inexistente.
 */
export const isUuid = (value: string) => z.uuid().safeParse(value).success;

export const registrationSchema = z.object({
  coloniaId,
  tutorName: z
    .string()
    .trim()
    .min(3, 'Escribe el nombre del responsable o tutor.')
    .max(120, 'El nombre es demasiado largo.'),
  tutorPhone: z
    .string()
    .trim()
    .regex(/^\d{10}$/, 'El teléfono debe tener 10 dígitos.'),
  // Los campos vacíos se omiten (no se rechazan): misma regla que en el
  // formulario, para que un envío con filas en blanco siga siendo válido.
  children: z
    .array(z.string().trim().max(120))
    .transform((names) => names.filter((n) => n !== ''))
    .pipe(
      z
        .array(z.string().min(1).max(120))
        .min(1, 'Agrega al menos un niño con nombre.')
        .max(20, 'Máximo 20 niños por responsable.')
    ),
});

export const stationSchema = z.object({
  coloniaId,
  // `name` es quien responde por la casa. Antes era "nombre de la estación":
  // se conserva la columna para no tocar lo ya registrado.
  name: z
    .string()
    .trim()
    .min(3, 'Escribe el nombre del responsable.')
    .max(120, 'El nombre es demasiado largo.'),
  // Opcional: cuando viene, es el rótulo que se ve en el mapa. Vacío y ausente
  // son lo mismo y se guardan como null, para no distinguir '' de NULL en la base.
  businessName: z
    .string()
    .trim()
    .max(120, 'El nombre del negocio es demasiado largo.')
    .optional()
    .transform((v) => (v ? v : null)),
  // Contacto para quien organiza. Se pide siempre, pero no se publica.
  phone: z
    .string({ error: 'Escribe el teléfono de contacto.' })
    .trim()
    .regex(/^\d{10}$/, 'El teléfono debe tener 10 dígitos.'),
  lat: z.number({ error: 'Marca la ubicación en el mapa.' }).min(-90, 'Latitud fuera de rango.').max(90, 'Latitud fuera de rango.'),
  lng: z.number({ error: 'Marca la ubicación en el mapa.' }).min(-180, 'Longitud fuera de rango.').max(180, 'Longitud fuera de rango.'),
});

/**
 * Borrado de una estación: acotado a la colonia que la registró y protegido
 * con el código de organizador. El código se compara en el servidor contra
 * STATION_DELETE_CODE; aquí solo se valida que venga algo.
 */
export const stationDeleteSchema = z.object({
  coloniaId,
  id: z.string().uuid('Estación inválida.'),
  code: z
    .string({ error: 'Escribe el código para eliminar.' })
    .trim()
    .min(1, 'Escribe el código para eliminar.'),
});

/**
 * Desbloqueo del filtro avanzado del padrón: mismo código de organizador que
 * el borrado de estaciones, comparado también en el servidor.
 */
export const rosterUnlockSchema = z.object({
  coloniaId,
  code: z
    .string({ error: 'Escribe el código de organizador.' })
    .trim()
    .min(1, 'Escribe el código de organizador.'),
});

/**
 * Solo comprobar el código de organizador, sin abrir nada más: lo usa el
 * generador de rutas para pasar al segundo paso. Las estaciones ya son
 * públicas; lo que se protege es que el código no viva en el navegador.
 */
export const organizerCheckSchema = rosterUnlockSchema.pick({ code: true });

/** Descargar el ZIP con el QR de cada estación: colonia y código de organizador. */
export const stationQrSchema = rosterUnlockSchema;

/** Ligas de las familias para mandarlas por WhatsApp: mismo código de organizador. */
export const familyLinksSchema = rosterUnlockSchema;

const familyPhone = z
  .string({ error: 'Escribe el teléfono con que te registraste.' })
  .trim()
  .transform((v) => v.replace(/\s+/g, ''))
  .pipe(z.string().regex(/^\d{10}$/, 'El teléfono debe tener 10 dígitos.'));

/** Buscar en la lista pública de tutores por teléfono completo: no viaja ningún teléfono al navegador. */
export const tutorPhoneSearchSchema = z.object({ coloniaId, phone: familyPhone });

/** "Ver perfil" desde la lista de tutores: el tutor elegido y el teléfono que lo comprueba. */
export const familyLoginSchema = z.object({
  coloniaId,
  tutorId: z.string().uuid('Tutor inválido.'),
  phone: familyPhone,
});

/** Visita al escanear el QR de una estación: solo viaja el token del QR. */
export const visitSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{32}$/, 'Código QR inválido.'),
});

/**
 * Mover una estación desde el mapa: mismo código de organizador, y las mismas
 * reglas de coordenadas que al registrarla.
 */
export const stationMoveSchema = rosterUnlockSchema.extend({
  id: z.string().uuid('Estación inválida.'),
  lat: stationSchema.shape.lat,
  lng: stationSchema.shape.lng,
});

/** Quitar un niño del padrón: mismo código de organizador, validado en el servidor. */
export const childDeleteSchema = rosterUnlockSchema.extend({
  id: z.string().uuid('Registro inválido.'),
});

/**
 * Cooperación acordada por familia. Vive aquí, compartida, para que el valor
 * que trae puesto el formulario sea el mismo que el default de la columna
 * `payments.amount` en schema.sql.
 */
export const DEFAULT_PAYMENT_AMOUNT = 35;

/**
 * Registro de un pago: mismo código de organizador que el resto del padrón.
 * El monto llega como número (pesos), y se admiten centavos porque no toda
 * familia coopera la cantidad exacta.
 */
export const paymentSchema = rosterUnlockSchema.extend({
  tutorId: z.string().uuid('Elige al tutor que pagó.'),
  amount: z
    .number({ error: 'Escribe la cantidad pagada.' })
    .positive('La cantidad debe ser mayor que cero.')
    .max(100000, 'La cantidad es demasiado grande.')
    .multipleOf(0.01, 'Usa como máximo dos decimales.'),
});

/**
 * Registro de dulces entregados por un tutor: mismo código de organizador. La
 * cantidad es en piezas, entera.
 */
export const candyDonationSchema = rosterUnlockSchema.extend({
  tutorId: z.string().uuid('Elige de la lista quién entregó los dulces.'),
  quantity: z
    .number({ error: 'Escribe cuántos dulces entregó.' })
    .int('Escribe una cantidad entera de dulces.')
    .positive('La cantidad debe ser mayor que cero.')
    .max(100000, 'La cantidad es demasiado grande.'),
});

export type RegistrationInput = z.infer<typeof registrationSchema>;
export type StationInput = z.infer<typeof stationSchema>;
