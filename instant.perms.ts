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

  // 3) Barcodes -> pertenecen a una organización (link: organization)
  "barcodes": {
    "allow": {
      "view": "auth.id in data.ref('organization.members.id')"
    }
  },

  // Archivos ($files) vinculados a un item -> seguimos la cadena item -> organization
  "$files": {
    "allow": {
      "view": "auth.id in data.ref('item.organization.members.id')"
    }
  }
} satisfies InstantRules;

export default rules;
