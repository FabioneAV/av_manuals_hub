import fs from "fs";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import mime from "mime-types";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 🧮 Calcola hash SHA256 (serve per deduplicare i file)
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
      const safeFileName = decodeURIComponent(fileName).replace(/[^\w.-]/g, "_");
      const brandFolder = manual.brand?.replace(/[^\w.-]/g, "_") || "unknown_brand";

      const storagePath = `${brandFolder}/${safeFileName}`;
      const contentType = mime.lookup(fileExt) || "application/pdf";

      // 🧠 1️⃣ Verifica se già esiste nel bucket (deduplica su file)
      const { data: existingFiles, error: listError } = await supabase
        .storage
        .from(bucketName)
        .list(brandFolder, { search: safeFileName });

      if (listError) throw listError;

      if (existingFiles && existingFiles.length > 0) {
        console.log(`↩️ File già presente su bucket: ${safeFileName}`);
      } else {
        const { error: uploadError } = await supabase
          .storage
          .from(bucketName)
          .upload(storagePath, fileBuffer, {
            contentType,
            upsert: false,
          });

        if (uploadError) throw uploadError;
        console.log(`✅ Caricato su bucket: ${safeFileName}`);
      }

      // 🔗 URL finale (non pubblico ma accessibile via API se serve)
      const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/${bucketName}/${storagePath}`;

      // 🧠 2️⃣ Deduplica su database — prima controlla se checksum esiste
      const { data: existingRow, error: selectError } = await supabase
        .from("av_manuals")
        .select("id")
        .eq("checksum", checksum)
        .maybeSingle();

      if (selectError) throw selectError;

      if (existingRow) {
        console.log(`↩️ Manuale già presente in DB: ${safeFileName}`);
      } else {
        const { error: insertError } = await supabase
          .from("av_manuals")
          .insert({
            brand: manual.brand,
            product: manual.product || null,
            file_name: manual.title || safeFileName,
            file_url: publicUrl,
            source_url: manual.url,
            checksum,
            created_at: new Date().toISOString()
          });

        if (insertError) throw insertError;
        console.log(`🆕 Aggiunto al DB: ${safeFileName}`);
      }

    } catch (err) {
      console.error(`❌ Errore durante upload manuale: ${err.message}`);
    }
  }

  console.log(`\n🎉 Upload completato con deduplica su Supabase (file + DB).`);
}
