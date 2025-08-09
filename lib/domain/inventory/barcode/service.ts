"use server"

import { init, lookup } from "@instantdb/admin"
import schema from "@inventory/instant.schema"
import { streamText } from "ai"
import Exa from "exa-js"
import { z } from "zod"

// Reexport de la versión previa por compat si alguna import externa persiste
export { runBarcodeAnalysis } from "@/lib/domain/inventory/services/barcodeAnalysis"


