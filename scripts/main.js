// scripts/main.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { crawlSite } from "./crawler_core.js";
import { uploadManuals } from "./supabase_upload.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configDir = path.join(__dirname, "../configs");

// 🧩 1️⃣ Legge tutte le configurazioni nella cartella configs/
async function main() {
  console.log("🔍 Inizio sincronizzazione AV manuals...");
  const files = fs.readdirSync(configDir).filter(f => f.endsWith(".json"));
  if (files.length === 0) {
    console.error("❌ Nessun file di configurazione trovato in configs/");
    process.exit(1);
  }

  // 🧩 2️⃣ Cicla su ogni brand
  for (const file of files) {
    const configPath = path.join(configDir, file);
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    console.log(`\n📦 Avvio crawling per brand: ${config.brand}...`);

    try {
      // 🧠 esegue il crawler
      const results = await crawlSite(config);

      if (!results || results.length === 0) {
        console.warn(`⚠️ Nessun manuale trovato per ${config.brand}`);
        continue;
      }

      // 📄 Salva output locale
      const outputFile = path.join(__dirname, `../output_${config.brand}.json`);
      fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
      console.log(`💾 Salvati ${results.length} risultati in ${outputFile}`);

      // ☁️ Carica su Supabase
      await uploadManuals(outputFile);
      console.log(`✅ Upload completato per ${config.brand}`);
    } catch (err) {
      console.error(`❌ Errore con ${config.brand}:`, err.message);
    }
  }

  console.log("\n🎉 Tutti i brand processati con successo!");
}

// Avvia
main().catch(err => {
  console.error("❌ Errore fatale:", err);
  process.exit(1);
});
