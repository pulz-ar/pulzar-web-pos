// Next.js + Inngest: exponer funciones de Inngest
import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";

// Agrega aquí funciones de Inngest cuando existan (p. ej., clerkUserCreated, etc.)
export const { GET, POST, PUT } = serve({ client: inngest, functions: [] });


