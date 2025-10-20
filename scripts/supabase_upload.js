import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function uploadManuals(file) {
  const data = JSON.parse(fs.readFileSync(file));
  for (const chunk of chunkArray(data, 100)) {
    const { error } = await supabase.from("external_manuals").upsert(chunk, { onConflict: "file_hash" });
    if (error) console.error("Errore:", error.message);
  }
  console.log(`📦 Caricati ${data.length} manuali da ${file}`);
}

function chunkArray(arr, size) {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size)
  );
}
