import fs from "fs";
import crypto from "crypto";
import path from "path";
import mime from "mime-types";
import { createClient } from "@supabase/supabase-js";

// 🔐 Crea il client Supabase (standard)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 🔁 client REST admin per accesso diretto allo schema public
const adminUrl = `${process.env.SUPABASE_URL}/rest/v1/`;
const adminHeaders = {
  apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
  Prefer: "resolution=ignore-duplicates",
};

// 🧮 funzione per calcolare hash SHA256 (per deduplica)
function generateChecksum(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// ⏱️ helper: retry con backoff per fetch PDF
async function fetchWithRetry(url, retries = 3, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      console.warn(`⚠️ Tentativo ${i + 1} fallito per ${url}: ${res.statusText}`);
    } catch (err) {
      console.warn(`⚠️ Tentativo ${i + 1} errore di rete: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, delay));
  }
  throw new Error(`Impossibile scaricare ${url} dopo ${retries} tentativi`);
}

export async function uploadManuals(outputPath) {
  console.log(`☁️ Upload dei manuali verso Supabase...`);
  const manuals = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  const bucketName = "av_manuals";
  let uploadedCount = 0;
  let failedCount = 0;

  for (const manual of manuals) {
    try {
      const fileUrl = manual.url;
      const fileName = path.basename(fileUrl);
      const fileResponse = await fetchWithRetry(fileUrl);

      const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());
      const checksum = generateChecksum(fileBuffer);
      const fileExt = path.extname(fileName) || ".pdf";
      const safeFileName = fileName.replace(/[^\w.-]/g, "_");
      const storagePath = `${manual.brand}/${safeFileName}`;
      const contentType = mime.lookup(fileExt) || "application/pdf";

      // 🔍 1️⃣ Upload su Storage
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

      // 🧠 2️⃣ Inserimento metadati (via REST admin)
      const response = await fetch(`${adminUrl}av_manuals?schema=api`, {
        method: "POST",
        headers: {
          ...adminHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          {
            brand: manual.brand,
            product: manual.product || null,
            file_name: manual.title || safeFileName,
            file_url: `${process.env.SUPABASE_URL}/storage/v1/object/public/${bucketName}/${storagePath}`,
            source_url: manual.url,
            checksum,
          },
        ]),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Errore DB REST: ${response.status} - ${text}`);
      }

      uploadedCount++;
      console.log(`🆕 Inserito nel DB: ${safeFileName}`);
    } catch (err) {
      failedCount++;
      console.error(`❌ Errore durante upload manuale: ${err.message}`);
    }
  }

  console.log(`\n🎉 Upload completato!`);
  console.log(`📊 Totale caricati: ${uploadedCount} | Falliti: ${failedCount}`);
  console.log(`🔗 Inserimento su: ${adminUrl}av_manuals`);
}
