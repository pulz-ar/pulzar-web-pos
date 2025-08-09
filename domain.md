# Pulzar – Domain Driven Design (DDD)

## Propósito del dominio
Pulzar habilita operaciones de inventario y captura de eventos (ej.: lecturas de escáner) por organización, con trazabilidad desde identificadores/lecturas hasta ítems, archivos adjuntos e imágenes. El objetivo es capturar señales (eventos) y transformarlas en conocimiento accionable (identificadores, items, adjuntos), dentro de límites de organización, con seguridad y multi-tenancy.

## Contexto y Subdominios
- Núcleo (Core) – Inventory & Events: captura y procesamiento de eventos (scanner.read), normalización en entidades de negocio (Identifiers, Items), y gestión de archivos (Attachments/$files).
- Identificadores (Supporting): resolución y análisis de códigos (barcodes/identifiers) y su asociación a ítems.
- Productos (Supporting): catálogo/familias (Products) y su relación con Items.
- Organización (Generic): pertenencia, membresías y seguridad multi-tenant.

## Bounded Context: Platform/Inventory
- Límite: rutas bajo `/platform/inventory/*` en `pulzar-web` usando InstantDB con esquema definido en `instant.schema.ts` y permisos en `instant.perms.ts`.
- Capacidades:
  - Captura de eventos y análisis (barcode/url) → crea/relaciona `identifiers`, puede crear `items` vinculados.
  - Gestión de ítems: atributos básicos, stock y estado; adjuntos e imágenes.
  - Organización como dimensión de seguridad y partición de datos.

## Modelo (Entidades y Relaciones)
Según `pulzar-web/instant.schema.ts`:

- Organization
  - Atributos: `clerkOrgId`, `timezone`
  - Relaciones: `members ($users)`, `configuration`, `memberships`, y colecciones por entidad del dominio (`events`, `barcodes`, `products`, `items`, `identifiers`, `credentials`, `orders`, `objectives`, `tasks`, `projects`).

- $users
  - Atributos: `email`
  - Relaciones: `organizations` (membership), `organizationMemberships`.

- OrganizationConfiguration
  - Atributos: `clerkOrgId`, `globalAgentInstruction`, `requisitionAgentInstruction`, `tenderAgentInstruction`, `orderDisclaimer`, `timezone`.
  - Relación: `organization` (1–1).

- OrganizationMemberships
  - Atributos: `clerkOrgId`, `content`, `createdAt`, `updatedAt`
  - Relaciones: `organization` (1–n), `member ($users)` (1–n).

- Events
  - Atributos: `type`, `content:any`, `createdAt`, `canon?`
  - Relación: `organization` (1–n)
  - Uso: captura de lecturas (ej.: `scanner.read`), estado de procesamiento en `content.status`, resultado de análisis en `content.analysis`.

- Barcodes
  - Atributos: `code`, `scheme`, `createdAt`
  - Relación: `organization` (1–n)
  - Uso: registro normalizado de códigos escaneados, vínculo opcional a `item` (vía `itemsBarcodes`).

- Identifiers
  - Atributos: `type`, `value`, `scope?`, `symbology?`, `isPrimary?`, `createdAt`
  - Relaciones: `organization` (1–n), `item` (n–1)
  - Uso: representación agnóstica de identificadores (ej.: EAN/UPC/QR/URL) que pueden asociarse a un `item`.

- Items
  - Atributos: `name`, `description?`, `price`, `sku?`, `status`, `stock`, `createdAt`, `updatedAt`
  - Relaciones: `organization` (1–n), `product` (n–1), `identifiers` (1–n), `attachments` (1–n), `$files` (1–n), `barcodes` (1–n)
  - Uso: entidad operativa de inventario. Puede nacer desde un `identifier` o ser creada directamente.

- Products
  - Atributos: `name`, `brand?`, `description?`, `status`, `createdAt`, `updatedAt`
  - Relación: `items` (1–n), `organization` (1–n)
  - Uso: catálogo/familia para agrupar `items`.

- Attachments
  - Atributos: `title?`, `kind?`, `isPrimary?`, `createdAt`
  - Relaciones: `item` (n–1), `$files` (1–n)
  - Uso: metadatos de adjuntos para `items`; sus archivos viven en `$files` con path de organización.

- $files
  - Atributos: `path`, `url`
  - Relaciones: `item` (n–1) y/o `attachment` (n–1)
  - Uso: almacenamiento lógico de archivos; la seguridad se basa en el prefijo `organization/<orgId>/...`.

- Orders
  - Atributos: `status`, `total`, `createdAt`, `updatedAt`
  - Relaciones: `organization` (1–n), `orderLines` (1–n)
  - Uso: raíz de agregado para punto de venta; acumula líneas y estados (ej.: open/paid/cancelled).

- OrderLines
  - Atributos: `quantity`, `price`, `total`, `createdAt`, `updatedAt`
  - Relaciones: `order` (n–1), `item` (n–1)
  - Uso: línea de pedido asociada a un `item`; `total = quantity * price`.

## Reglas de Seguridad (instant.perms.ts)
- Regla base: `$default.view = false`.
- Acceso por organización: `view` para `events`, `items`, `products`, `identifiers`, `barcodes` si `auth.id in data.ref('organization.members.id')`.
- `attachments` y `$files`: acceso vía cadena de pertenencia al `item.organization` y validación de path para `$files`.

## Casos de Uso Clave (Application Layer)

- Captura de evento (scanner.read)
  - Entrada: `raw` (string) + `eventId` de cliente
  - Servicios: `submitBarcodeService`, `runIdentifierAnalysis`, `barcodeAnalysis`
  - Salida: crea `events`, `identifiers` y potencialmente `items`; vincula a `organization` y resuelve adjuntos.

- Crear item desde identifier
  - Entrada: `identifierId`
  - Servicio: `ItemsService.createItemForIdentifier`
  - Salida: `item` con vínculo a `identifier` y `organization`.

- Adjuntar imágenes/archivos a item
  - Entrada: `itemId`, `files[base64]`
  - Servicio: `ItemsService.uploadItemAttachments`
  - Salida: `attachments` + `$files` en path `organization/<orgId>/item/<attachmentId>/...` y permisos consistentes.

## Agregados, Raíces y Consistencia
- Aggregate: `Item` como raíz cuando incluye `identifiers`, `attachments`, `$files` y `barcodes`.
- Aggregate: `Organization` como raíz de pertenencia para `events`, `items`, `identifiers`, `products`, etc.
- Invariantes:
  - Toda entidad operativa clave debe vincularse a una `organization`.
  - Los `$files` deben residir bajo un path con prefijo de `organization` válida del usuario.
  - `identifier` puede ser único por `(value, scope?)` según contexto (no forzado a nivel de schema actual).

## Límites y Decisiones
- Multi-tenant basado en Clerk (`orgId`) y replicado en InstantDB por `clerkOrgId`.
- `events.content` es flexible para soportar nuevas señales; análisis delega en servicios (`barcodeAnalysis`, `urlAnalysis`).
- `attachments` intermedio permite múltiples `$files` por adjunto y marcar `isPrimary` a nivel adjunto.

## Integraciones Relevantes
- Clerk: autenticación, `orgId`, memberships y `UserButton`/setActive.
- InstantDB: persistencia, permisos declarativos, storage `$files`.
- Inngest (presente en el mono-repo): orquestación de eventos (no central al flujo de inventario básico).

## Visión Evolutiva
- Normalizar `products` como catálogo con atributos extendidos (marca, categoría) y reglas de visibilidad por organización.
- Reglas de unicidad para `identifiers` según `scope` y `type`.
- Auditoría de transiciones de estado en `items` (ej.: pending → active) vía `events`.


