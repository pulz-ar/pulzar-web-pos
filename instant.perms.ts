// Docs: https://www.instantdb.com/docs/permissions

import type { InstantRules } from "@instantdb/core";

// Regla general: por defecto, no se puede ver nada si no se especifica
// y luego habilitamos "view" por organización. Esto asegura que
// solo se vea lo perteneciente a la organización del usuario.
const rules = {
  "$default": {
    "allow": {
      "view": "false"
    }
  },

  // Organizaciones: ver solo si el usuario es miembro
  "organizations": {
    "allow": {
      "view": "auth.id in data.ref('members.id')"
    }
  },

  // 1) Events -> pertenecen a una organización (link: organization)
  "events": {
    "allow": {
      "view": "auth.id in data.ref('organization.members.id')"
    }
  },

  // 2) Items -> pertenecen a una organización (link: organization)
  "items": {
    "allow": {
      "view": "auth.id in data.ref('organization.members.id')"
    }
  },

  // Products -> pertenecen a una organización (link: organization)
  "products": {
    "allow": {
      "view": "auth.id in data.ref('organization.members.id')"
    }
  },

  // Identifiers -> pertenecen a una organización (link: organization)
  "identifiers": {
    "allow": {
      "view": "auth.id in data.ref('organization.members.id')"
    }
  },

  // 3) Barcodes -> pertenecen a una organización (link: organization)
  "barcodes": {
    "allow": {
      "view": "auth.id in data.ref('organization.members.id')"
    }
  },

  // Attachments -> pertenecen a una organización via item
  "attachments": {
    "allow": {
      "view": "auth.id in data.ref('item.organization.members.id')",
      "update": "auth.id in data.ref('item.organization.members.id')",
      "delete": "auth.id in data.ref('item.organization.members.id')"
    }
  },

  // Archivos ($files) vinculados a un item -> seguimos la cadena item -> organization
  "$files": {
    "allow": {
      "view": "isLoggedIn && hasOrgPathAccess",
      "create": "isLoggedIn && hasOrgPathAccess",
      "update": "isLoggedIn && hasOrgPathAccessNew",
      "delete": "isLoggedIn && hasOrgPathAccess"
    },
    "bind": [
      "isLoggedIn", "auth.id != null",
      // Lista de orgIds (por ejemplo, Clerk org id) a las que pertenece el usuario actual
      "orgIds", "auth.ref('$user.organizations.clerkOrgId')",
      // Acceso si el path del archivo empieza con una organización del usuario
      "hasOrgPathAccess", "orgIds.exists(orgId, data.path.startsWith('organization/' + orgId + '/'))",
      // Para updates, validar contra el nuevo path
      "hasOrgPathAccessNew", "orgIds.exists(orgId, newData.path.startsWith('organization/' + orgId + '/'))"
    ]
  }
} satisfies InstantRules;

export default rules;
