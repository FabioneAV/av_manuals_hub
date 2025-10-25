import puppeteer from "puppeteer";
import axios from "axios";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

// 🔐 Inizializzazione Supabase con schema esplicito
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { db: { schema: "public" } } // 👈 cambia in "api" se la tua tabella è lì
);

// Funzione di attesa compatibile con Puppeteer v23+
async function wait(page, ms) {
  await page.waitForFunction(
    (timeout) => new Promise((resolve) => setTimeout(resolve, timeout)),
    {}, // options
    ms
  );
}

export async function crawlSite(brandName) {
  console.log(`📦 Avvio crawling per brand: ${brandName} (browser mode)...`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  const allManuals = [];

  try {
    console.log("🌍 Apertura del Resource Center...");
    await page.goto("https://www.maxhub.com/eu/resource-center/", {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    console.log("🔍 Estrazione link dei prodotti...");
    const productLinks = await page.$$eval(".product-card a", (links) =>
      links.map((a) => ({
        title: a.textContent.trim(),
        href: a.href,
      }))
    );

    console.log(`🔎 Trovati ${productLinks.length} prodotti Maxhub\n`);

    // Cicla su ogni prodotto
    for (let i = 0; i < productLinks.length; i++) {
      const { title, href } = productLinks[i];
      console.log(`📘 (${i + 1}/${productLinks.length}) Analisi: ${title}`);

      try {
        await page.goto(href, { waitUntil: "networkidle2", timeout: 60000 });
        await wait(page, 2000); // 👈 sostituisce page.waitForTimeout

        const pageContent = await page.content();

        // Cerca tutti i link PDF nella pagina
        const pdfUrls = await page.$$eval('a[href$=".pdf"]', (links) =>
          links.map((a) => ({
            name: a.textContent.trim() || "Documento PDF",
            url: a.href,
          }))
        );

        for (const pdf of pdfUrls) {
          console.log(`📄 PDF trovato: ${pdf.name}`);
          allManuals.push({
            brand: brandName,
            product: title,
            url: pdf.url,
            name: pdf.name,
          });
        }

        await wait(page, 1500); // 👈 sostituisce page.waitForTimeout
      } catch (err) {
        console.log(`⚠️ Errore su ${title}: ${err.message}`);
        continue;
      }
    }

    console.log(`📄 Totale PDF trovati: ${allManuals.length}`);

    // Salvataggio locale del risultato
    const outputFile = `output_${brandName}.json`;
    fs.writeFileSync(outputFile, JSON.stringify(allManuals, null, 2));
    console.log(`💾 Salvati ${allManuals.length} risultati in ${outputFile}`);

    // Upload su Supabase
    console.log(`☁️ Upload di ${allManuals.length} manuali su Supabase...`);
    const { error } = await supabase.from("manuals").insert(allManuals);

    if (error) {
      console.error("❌ Errore durante l'upload su Supabase:", error.message);
    } else {
      console.log(`✅ Upload completato per ${brandName}`);
    }
  } catch (error) {
    console.error(`❌ Errore fatale nel crawler ${brandName}:`, error.message);
  } finally {
    await browser.close();
  }
}
