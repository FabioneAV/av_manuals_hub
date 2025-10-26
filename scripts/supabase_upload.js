import fs from "fs";
import crypto from "crypto";
import path from "path";
import mime from "mime-types";
import { createClient } from "@supabase/supabase-js";
import pkg from "pg";
const { Client } = pkg;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 🔐 Connessione diretta a Postgres per bypassare il limite dello schema “api”
const pgClient = new Client({
  connectionString: `${process.env.SUPABASE_URL.replace(
    "https://",
    "postgresql://postgres:"
  )}${process.env.SUPABASE_SERVICE_ROLE_KEY}@${process.env.SUPABASE_URL
    .replace("https://", "")
    .replace(".supabase.co", ".supabase.co:5432/postgres")}`,
  ssl: { rejectUnauthorized: false },
});

await pgClient.connect();

// 🧮 funzione per calcolare hash SHA256 del file (per deduplica)
function generateChecksum(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function uploadManuals(outputPath) {
  console.log(`☁️ Upload dei manuali verso Supabase...`);
  const manuals = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  const bucketName = "av_manuals";

  for (const manual of manuals) {
    try {
      const fileUrl = manual.url;
      const fileName = path.basename(fileUrl);
      const fileResponse = await fetch(fileUrl);

      if (!fileResponse.ok) {
        console.warn(`⚠️ Impossibile scaricare ${fileUrl}: ${fileResponse.statusText}`);
        continue;
      }

      const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());
      const checksum = generateChecksum(fileBuffer);
      const fileExt = path.extname(fileName) || ".pdf";
      const safeFileName = fileName.replace(/[^\w.-]/g, "_");
      const storagePath = `${manual.brand}/${safeFileName}`;
      const contentType = mime.lookup(fileExt) || "application/pdf";

      // 1️⃣ Upload su Storage
      const { data: existing } = await supabase.storage
        .from(bucketName)
        .list(manual.brand, { search: safeFileName });

      if (existing && existing.length > 0) {
        console.log(`↩️ File già presente su bucket: ${safeFileName}`);
      } else {
        const { error: uploadError } = await supabase.storage
          .from(bucketName)
          .upload(storagePath, fileBuffer, { contentType, upsert: false });

        if (uploadError) throw uploadError;
        console.log(`✅ Caricato su bucket: ${safeFileName}`);
      }

      // 2️⃣ Inserimento diretto in PostgreSQL (schema public)
      await pgClient.query(
        `INSERT INTO public.av_manuals 
         (brand, product, file_name, file_url, source_url, checksum)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (checksum) DO NOTHING`,
        [
          manual.brand,
          manual.product || null,
          manual.title || safeFileName,
          `${process.env.SUPABASE_URL}/storage/v1/object/public/${bucketName}/${storagePath}`,
          manual.url,
          checksum,
        ]
      );

      console.log(`🆕 Aggiunto al DB: ${safeFileName}`);
    } catch (err) {
      console.error(`❌ Errore durante upload manuale: ${err.message}`);
    }
  }

  await pgClient.end();
  console.log(`\n🎉 Upload completato con deduplica su Supabase (DB + Storage).`);
}
