// scripts/supabase_upload.js
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("❌ Mancano le variabili SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export async function uploadManuals(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const manuals = JSON.parse(content);

  if (!manuals || manuals.length === 0) {
    console.log("⚠️ Nessun manuale da caricare.");
    return;
  }

  console.log(`☁️ Upload di ${manuals.length} manuali su Supabase...`);

  const { data, error } = await supabase
    .from("external_manuals")
    .upsert(manuals, { onConflict: ["pdf_url"] });

  if (error) {
    console.error("❌ Errore durante l'upload su Supabase:", error.message);
  } else {
    console.log(`✅ Caricati ${data?.length || manuals.length} record.`);
  }
}
