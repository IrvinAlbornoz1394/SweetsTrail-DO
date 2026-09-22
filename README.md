# SweetsTrail

Plataforma para organizar la **Ruta de los Dulces** por colonia: registro de niños
participantes y de estaciones (casas que reparten dulces).

Cada colonia gestiona su propio evento. El flujo es en dos pasos: primero eliges tu
colonia, y de ahí en adelante todo lo que registras queda ligado a ella.

## Stack

| Pieza | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| Base de datos | Postgres — Supabase en la nube, PGlite en local |
| Validación | Zod (mismo esquema en cliente y servidor) |
| Mapa | Leaflet + OpenStreetMap (sin API key) |
| Geocodificación | Nominatim, solo para centrar el mapa en la colonia (sin API key) |
| Hosting | Vercel |

## Correr en local

```bash
npm install
npm run dev
```

Abre <http://localhost:3000>. **No necesitas configurar nada más.**

Sin las variables de Supabase, la app arranca contra **PGlite**: un Postgres real
compilado a WASM que corre dentro del proceso de Node, sin Docker ni instalaciones.
En el primer arranque crea el esquema y siembra las 682 colonias de Mérida.
Los datos quedan en `.data/pglite/` (ignorado por git); para empezar de cero:

```bash
rm -rf .data
```

PGlite corre **el mismo `schema.sql`** que producción, incluida la función `plpgsql`,
así que lo que funciona en local funciona en Supabase.

### Nota si trabajas en WSL

Este proyecto vive en `/mnt/c/...`, que es el disco de Windows montado en WSL.
Ahí **inotify no funciona**, así que el hot reload de Next no detecta los cambios:
hay que reiniciar `npm run dev` tras editar. La compilación también es varias veces
más lenta (~30 s por ruta la primera vez; ya en caliente responde en ~0.3 s).

Si te estorba, mueve el repo al filesystem de Linux (`~/proyectos/SweetsTrail-DO`)
y el hot reload y los tiempos vuelven a la normalidad.

## Conectar Supabase

1. Crea el proyecto en [supabase.com](https://supabase.com).
2. En **SQL Editor**, ejecuta en este orden:
   1. `supabase/schema.sql` — tablas y la función de registro
   2. `supabase/seed_colonias.sql` — catálogo de colonias
   3. `supabase/security.sql` — RLS
3. Copia `.env.example` a `.env.local` y llena las dos variables desde
   **Project Settings → API**:

   ```
   SUPABASE_URL="https://xxxx.supabase.co"
   SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOi..."
   ```

Al reiniciar el dev server, la app detecta las variables y cambia sola a Supabase.
No hay que tocar código: `lib/db.ts` elige el backend en tiempo de ejecución.

> Las llaves **no** llevan `NEXT_PUBLIC_`: la `service_role` es de servidor y jamás
> debe llegar al navegador. Las tablas tienen RLS activo sin políticas públicas, así
> que la única vía de escritura son los Route Handlers.

## Desplegar en Vercel

1. Importa el repo en Vercel (detecta Next.js solo).
2. En **Settings → Environment Variables**, agrega `SUPABASE_URL` y
   `SUPABASE_SERVICE_ROLE_KEY`.
3. Agrega también `STATION_DELETE_CODE`: el código de organizador. Lo pide la
   app para eliminar una estación desde el mapa y para abrir el filtro
   avanzado del padrón (tutor y teléfono). Si falta, ambos responden 503
   («El borrado no está configurado en este servidor») y nadie puede quitar
   estaciones en producción. Al agregarla hay que **volver a desplegar**: las
   variables se leen en el arranque del servidor.
4. Deploy.

En producción las dos primeras son obligatorias: PGlite escribe en disco y el
filesystem de Vercel es de solo lectura.

## Estructura

```
app/
  page.tsx                          Paso 1 — selector de colonia
  colonia/[slug]/page.tsx           Paso 2 — elegir qué registrar
  colonia/[slug]/ninos/page.tsx     Formulario de niños
  colonia/[slug]/estaciones/page.tsx Formulario de estaciones
  api/registrations/route.ts        POST — tutor + niños (atómico)
  api/stations/route.ts             GET/POST/DELETE — estaciones por colonia
  api/roster/route.ts               POST/DELETE — padrón con contacto (con código)
  api/payments/route.ts             POST — registra la cooperación de un tutor (con código)
components/                         Formularios, mapa, modal, toast
lib/
  db.ts                             Capa de datos (Supabase | PGlite)
  schemas.ts                        Validación Zod compartida
supabase/                           SQL: esquema, catálogo, seguridad
data/colonias-merida.json           Catálogo de colonias (referencia)
prototype/                          Prototipo estático original (HTML/CSS/JS)
```

## Modelo de datos

```
colonias ──┬── tutors ──┬── children
           │            └── payments
           └── stations
```

Las estaciones **no guardan dirección**: la ubicación se marca en el mapa, que
es más preciso para trazar la ruta.

Eliminar una estación desde el mapa **no borra la fila**: marca
`stations.is_deleted = true` (arranca en `false`). La estación desaparece del
mapa, de la lista y del conteo, pero el registro se conserva, así que un
borrado por error se revierte con un `update`:

```sql
update public.stations set is_deleted = false where id = '<uuid>';
```

Para ver lo que se ha quitado:

```sql
select id, name, created_at from public.stations where is_deleted;
```

### Cooperación

`payments` guarda **una fila por pago recibido**, no una bandera en `tutors`:
así queda cuánto y cuándo se pagó, y una familia que coopera en dos partes
tiene sus dos filas. El monto trae de default los $35 acordados
(`DEFAULT_PAYMENT_AMOUNT` en `lib/schemas.ts` repite el mismo número para el
formulario), pero se puede capturar otra cantidad.

Se registra desde **Niños registrados → Habilitar filtro avanzado → Registrar
pago**: ahí se elige al tutor en un buscador y se confirma. Es acción de
colonia, no de renglón, porque la cooperación la debe la familia y no cada niño.

Un pago capturado por error sí se borra de verdad — no hay borrado suave
porque nada cuelga de esta tabla:

```sql
delete from public.payments where id = '<uuid>';
```

Lo cooperado por tutor:

```sql
select t.name, sum(p.amount) as total, max(p.created_at) as ultimo
  from public.payments p
  join public.tutors t on t.id = p.tutor_id
 group by t.id, t.name
 order by t.name;
```

Los niños del padrón siguen la misma regla: `children.is_deleted` los saca de
la lista y del conteo sin borrar la fila, y el tutor conserva sus demás niños.
Quitar y recuperar funciona igual, cambiando la tabla:

```sql
update public.children set is_deleted = false where id = '<uuid>';
``` `colonias.lat/lng` guarda el centro
aproximado para abrir el mapa ya sobre la colonia; se llena la primera vez que
alguien la usa (`lib/geocode.ts`) y de ahí en adelante sale de la base.

### Cambios de esquema

`schema.sql` usa `create table if not exists`, que no altera tablas
existentes. Por eso los cambios posteriores viven en la sección
**Migraciones** al final del archivo, con sentencias idempotentes
(`add column if not exists`, `drop column if exists`). Corre
`npm run db:migrate` antes de desplegar código que dependa de ellas.

## Catálogo de colonias

682 asentamientos de Mérida, Yucatán, derivados del **Catálogo Nacional de Códigos
Postales** de Correos de México (SEPOMEX). Incluye nombre, tipo (colonia,
fraccionamiento, pueblo…) y código postal.

Para regenerarlo o extenderlo a otros municipios hay que volver a procesar el
catálogo desde <https://www.correosdemexico.gob.mx/datosabiertos/cp/cpdescarga.txt>.

> **Sobre la licencia:** Correos de México ofrece el catálogo gratis para uso
> particular, pero sus términos prohíben comercializarlo y redistribuirlo a
> terceros. Para un evento vecinal sin fines de lucro no hay problema, pero si el
> proyecto llega a monetizarse conviene revisarlo. La alternativa libre es
> OpenStreetMap (ODbL), aunque solo tiene ~196 colonias de Mérida y con nombres
> inconsistentes, contra las 682 normalizadas de SEPOMEX.

## Pendientes

- Vista de la ruta con todas las estaciones de la colonia en un mapa
- Panel para ver y editar los registros de cada colonia
- Control de acceso: hoy cualquiera con el enlace registra en cualquier colonia
