import { z } from 'zod';

/** Reglas de validación compartidas por los formularios y la API. */

const coloniaId = z.string().uuid('Colonia inválida.');

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
  name: z
    .string()
    .trim()
    .min(3, 'Escribe el nombre de la estación.')
    .max(120, 'El nombre es demasiado largo.'),
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

export type RegistrationInput = z.infer<typeof registrationSchema>;
export type StationInput = z.infer<typeof stationSchema>;
