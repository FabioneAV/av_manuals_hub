import fs from "fs";
import crypto from "crypto";
import path from "path";
import mime from "mime-types";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false },
    db: { schema: "public" }, // ✅ usa lo schema corretto
  }
);

// 🧮 Calcola hash SHA256 per deduplica
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

      // 1️⃣ Upload nel bucket se non esiste già
      const { data: existing } = await supabase
        .storage
        .from(bucketName)
        .list(manual.brand, { search: safeFileName });

      if (existing && existing.length > 0) {
        console.log(`↩️ File già presente su bucket: ${safeFileName}`);
      } else {
        const { error: uploadError } = await supabase
          .storage
          .from(bucketName)
          .upload(storagePath, fileBuffer, { contentType, upsert: false });

        if (uploadError) throw uploadError;
        console.log(`✅ Caricato su bucket: ${safeFileName}`);
      }

      // 2️⃣ Inserisci nel DB via API REST (schema “public”)
      const { error: insertError } = await supabase
        .from("av_manuals")
        .insert([
          {
            brand: manual.brand,
            product: manual.product || null,
            file_name: manual.title || safeFileName,
            file_url: `${process.env.SUPABASE_URL}/storage/v1/object/public/${bucketName}/${storagePath}`,
            source_url: manual.url,
            checksum,
          },
        ]);

      if (insertError) {
        if (insertError.message.includes("duplicate key")) {
          console.log(`↩️ Manuale già esistente in DB: ${safeFileName}`);
        } else {
          throw insertError;
        }
      } else {
        console.log(`🆕 Aggiunto al DB: ${safeFileName}`);
      }
    } catch (err) {
      console.error(`❌ Errore durante upload manuale: ${err.message}`);
    }
  }

  console.log(`\n🎉 Upload completato con deduplica su Supabase (DB + Storage).`);
}
