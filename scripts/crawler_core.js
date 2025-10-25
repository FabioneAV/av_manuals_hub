// scripts/crawler_core.js
import puppeteer from "puppeteer";
import axios from "axios";
import fs from "fs";

export async function crawlSite(config) {
  const { brand, url } = config;
  console.log(`📦 Avvio crawling per brand: ${brand} (browser mode)...`);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--window-size=1920,1080",
    ],
  });

  const page = await browser.newPage();
  const results = [];

  try {
    console.log("🌍 Apertura del Resource Center...");
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    console.log("🔍 Estrazione link dei prodotti...");
    await page.waitForFunction(
      () => document.querySelectorAll('a[href*="/resource-center-detail/?id="]').length > 0,
      { timeout: 20000 }
    );

    const productLinks = await page.$$eval('a[href*="/resource-center-detail/?id="]', (links) =>
      links.map((a) => ({
        title: a.textContent.trim() || a.getAttribute("title") || "Unknown Product",
        href: a.href,
      }))
    );

    console.log(`🔎 Trovati ${productLinks.length} prodotti ${brand}`);

    // Cicla ogni prodotto
    let count = 1;
    for (const product of productLinks) {
      console.log(`\n📘 (${count++}/${productLinks.length}) Analisi: ${product.title}`);

      try {
        await page.goto(product.href, { waitUntil: "domcontentloaded", timeout: 45000 });
        await new Promise((r) => setTimeout(r, 1500));

        // Cerca link PDF
        const pdfLinks = await page.$$eval('a[href$=".pdf"]', (anchors) =>
          anchors.map((a) => ({
            name: a.textContent.trim() || "Manual",
            href: a.href,
          }))
        );

        // Ottieni la dimensione del file (solo HEAD request, no download)
        for (const pdf of pdfLinks) {
          let size = 0;
          try {
            const res = await axios.head(pdf.href);
            size = res.headers["content-length"] ? parseInt(res.headers["content-length"]) : 0;
          } catch (_) {}

          console.log(`📄 PDF trovato: ${pdf.name}`);
          results.push({
            brand,
            product: product.title,
            manual_name: pdf.name,
            url: pdf.href,
            size,
            source: product.href,
          });
        }

        if (pdfLinks.length === 0) {
          console.warn(`⚠️ Nessun PDF trovato per ${product.title}`);
        }
      } catch (err) {
        console.warn(`⚠️ Errore su ${product.title}: ${err.message}`);
      }
    }

    console.log(`\n📄 Totale PDF trovati (prima della deduplica): ${results.length}`);

    // 🔁 Deduplicazione locale (URL + size)
    const outPath = `output_${brand}.json`;
    let previous = [];

    if (fs.existsSync(outPath)) {
      try {
        previous = JSON.parse(fs.readFileSync(outPath, "utf8"));
      } catch {
        console.warn("⚠️ File output precedente corrotto o non leggibile, verrà sovrascritto.");
      }
    }

    const newResults = results.filter(
      (r) => !previous.some((p) => p.url === r.url && p.size === r.size)
    );

    if (newResults.length > 0) {
      console.log(`🆕 Trovati ${newResults.length} nuovi manuali.`);
      const merged = [...previous, ...newResults];
      fs.writeFileSync(outPath, JSON.stringify(merged, null, 2));
      console.log(`💾 Aggiornato file con ${merged.length} manuali totali.`);
    } else {
      console.log("✅ Nessun nuovo manuale trovato, file invariato.");
    }

    // Mostra riepilogo leggibile
    const preview = newResults.slice(0, 10);
    if (preview.length > 0) {
      console.log("\n📋 Anteprima dei nuovi manuali trovati:");
      preview.forEach((r) => console.log(`  • ${r.manual_name} (${r.product})`));
      if (newResults.length > 10) console.log(`  ... e altri ${newResults.length - 10} manuali.`);
    }

  } catch (err) {
    console.error(`❌ Errore fatale nel crawler ${brand}:`, err.message);
  } finally {
    await browser.close();
  }

  return results;
}
