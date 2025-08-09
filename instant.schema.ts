// Docs: https://www.instantdb.com/docs/modeling-data

import { i } from "@instantdb/core";

const _schema = i.schema({
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
    }),
    organizations: i.entity({
      clerkOrgId: i.string().optional().unique().indexed(),
      timezone: i.string().optional(),
    }),
    organizationConfigurations: i.entity({
      clerkOrgId: i.string().unique().indexed(),
      globalAgentInstruction: i.string().optional(),
      requisitionAgentInstruction: i.string().optional(),
      tenderAgentInstruction: i.string().optional(),
      orderDisclaimer: i.string().optional(),
      timezone: i.string().optional(),
    }),
    organizationMemberships: i.entity({
      clerkOrgId: i.string().unique().indexed(),
      content: i.any().optional(),
      createdAt: i.date().indexed(),
      updatedAt: i.date().optional(),
    }),
    barcodes: i.entity({
      code: i.string(),
      scheme: i.string(),
      createdAt: i.date(),
    }),
    credentials: i.entity({
      createdAt: i.date(),
      type: i.string(),
      updatedAt: i.date(),
    }),
    events: i.entity({
      canon: i.boolean().optional(),
      content: i.any(),
      createdAt: i.date(),
      type: i.string(),
    }),
    items: i.entity({
      createdAt: i.date(),
      description: i.string().optional(),
      name: i.string(),
      price: i.number(),
      sku: i.string().optional(),
      status: i.string(),
      stock: i.number(),
      updatedAt: i.date(),
    }),
    // Nueva entidad: Products (familias comerciales)
    products: i.entity({
      name: i.string().indexed(),
      brand: i.string().optional().indexed(),
      description: i.string().optional(),
      status: i.string(),
      createdAt: i.date(),
      updatedAt: i.date(),
    }),
    // Nueva entidad: Identifiers (códigos asociados a items)
    identifiers: i.entity({
      type: i.string().indexed(),
      value: i.string().indexed(),
      scope: i.string().optional().indexed(),
      symbology: i.string().optional(),
      isPrimary: i.boolean().optional(),
      createdAt: i.date(),
    }),
    objectives: i.entity({
      createdAt: i.date(),
      description: i.string().optional(),
      name: i.string(),
      updatedAt: i.date(),
    }),
    orders: i.entity({
      createdAt: i.date(),
      status: i.string(),
      total: i.number(),
      updatedAt: i.date(),
    }),
    orderLines: i.entity({
      createdAt: i.date(),
      updatedAt: i.date(),
      quantity: i.number(),
      price: i.number(),
      total: i.number(),
    }),
    projects: i.entity({
      createdAt: i.date(),
      description: i.string().optional(),
      linearProjectId: i.string(),
      name: i.string(),
      updatedAt: i.date(),
    }),
    tasks: i.entity({
      createdAt: i.date(),
      description: i.string().optional(),
      status: i.string(),
      title: i.string(),
      updatedAt: i.date(),
    }),
    attachments: i.entity({
      createdAt: i.date(),
      kind: i.string().optional(),
      title: i.string().optional(),
      isPrimary: i.boolean().optional(),
    }),
  },
  links: {
    // Organización <> Usuarios
    organizationMembers: {
      forward: { on: "organizations", has: "many", label: "members" },
      reverse: { on: "$users", has: "many", label: "organizations" },
    },
    // Organización <> Configuración
    organizationConfiguration: {
      forward: { on: "organizationConfigurations", has: "one", label: "organization" },
      reverse: { on: "organizations", has: "one", label: "configuration" },
    },
    // Organización <> Membresías
    membershipOrganization: {
      forward: { on: "organizationMemberships", has: "one", label: "organization" },
      reverse: { on: "organizations", has: "many", label: "memberships" },
    },
    membershipUser: {
      forward: { on: "organizationMemberships", has: "one", label: "member" },
      reverse: { on: "$users", has: "many", label: "organizationMemberships" },
    },
    // Entidades clave que deben pertenecer a una organización
    eventsOrganization: {
      forward: { on: "events", has: "one", label: "organization" },
      reverse: { on: "organizations", has: "many", label: "events" },
    },
    barcodesOrganization: {
      forward: { on: "barcodes", has: "one", label: "organization" },
      reverse: { on: "organizations", has: "many", label: "barcodes" },
    },
    // Organización <> Products
    productsOrganization: {
      forward: { on: "products", has: "one", label: "organization" },
      reverse: { on: "organizations", has: "many", label: "products" },
    },
    itemsOrganization: {
      forward: { on: "items", has: "one", label: "organization" },
      reverse: { on: "organizations", has: "many", label: "items" },
    },
    // Organización <> Identifiers
    identifiersOrganization: {
      forward: { on: "identifiers", has: "one", label: "organization" },
      reverse: { on: "organizations", has: "many", label: "identifiers" },
    },
    credentialsOrganization: {
      forward: { on: "credentials", has: "one", label: "organization" },
      reverse: { on: "organizations", has: "many", label: "credentials" },
    },
    ordersOrganization: {
      forward: { on: "orders", has: "one", label: "organization" },
      reverse: { on: "organizations", has: "many", label: "orders" },
    },
    // Orders <> OrderLines
    ordersOrderLines: {
      forward: { on: "orders", has: "many", label: "orderLines" },
      reverse: { on: "orderLines", has: "one", label: "order" },
    },
    // OrderLine <> Item
    orderLineItem: {
      forward: { on: "orderLines", has: "one", label: "item" },
      reverse: { on: "items", has: "many", label: "orderLines" },
    },
    objectivesOrganization: {
      forward: { on: "objectives", has: "one", label: "organization" },
      reverse: { on: "organizations", has: "many", label: "objectives" },
    },
    tasksOrganization: {
      forward: { on: "tasks", has: "one", label: "organization" },
      reverse: { on: "organizations", has: "many", label: "tasks" },
    },
    projectsOrganization: {
      forward: { on: "projects", has: "one", label: "organization" },
      reverse: { on: "organizations", has: "many", label: "projects" },
    },
    itemsBarcodes: {
      forward: {
        on: "items",
        has: "many",
        label: "barcodes",
      },
      reverse: {
        on: "barcodes",
        has: "one",
        label: "item",
      },
    },
    // Products <> Items
    productItems: {
      forward: { on: "products", has: "many", label: "items" },
      reverse: { on: "items", has: "one", label: "product" },
    },
    // Identifiers <> Item (nuevo modelo de identificadores)
    identifierItem: {
      forward: { on: "identifiers", has: "one", label: "item" },
      reverse: { on: "items", has: "many", label: "identifiers" },
    },
    // Item <> Attachments (genérico)
    itemsAttachments: {
      forward: { on: "items", has: "many", label: "attachments" },
      reverse: { on: "attachments", has: "one", label: "item" },
    },
    // Attachment <> $files (un adjunto puede tener múltiples archivos)
    attachmentFiles: {
      forward: { on: "attachments", has: "many", label: "$files" },
      reverse: { on: "$files", has: "one", label: "attachment" },
    },
    // Relación de imágenes por item: un item puede tener muchas imágenes ($files)
    itemImages: {
      forward: {
        on: "items",
        has: "many",
        label: "$files",
      },
      reverse: {
        on: "$files",
        has: "one",
        label: "item",
      },
    },
    projectsObjective: {
      forward: {
        on: "projects",
        has: "one",
        label: "objective",
      },
      reverse: {
        on: "objectives",
        has: "many",
        label: "projects",
      },
    },
    tasksObjective: {
      forward: {
        on: "tasks",
        has: "one",
        label: "objective",
      },
      reverse: {
        on: "objectives",
        has: "many",
        label: "tasks",
      },
    },
    tasksProject: {
      forward: {
        on: "tasks",
        has: "one",
        label: "project",
      },
      reverse: {
        on: "projects",
        has: "many",
        label: "tasks",
      },
    },
  },
  rooms: {},
});

// This helps Typescript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
