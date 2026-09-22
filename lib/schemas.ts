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
  tutorId: z.string().uuid('Elige de la lista quién pagó.'),
  amount: z
    .number({ error: 'Escribe la cantidad pagada.' })
    .positive('La cantidad debe ser mayor que cero.')
    .max(100000, 'La cantidad es demasiado grande.')
    .multipleOf(0.01, 'Usa como máximo dos decimales.'),
});

export type RegistrationInput = z.infer<typeof registrationSchema>;
export type StationInput = z.infer<typeof stationSchema>;
