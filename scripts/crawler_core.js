// scripts/crawler_core.js
import puppeteer from "puppeteer";
import axios from "axios";
import fs from "fs";
import path from "path";

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

    let count = 1;
    for (const product of productLinks) {
      console.log(`\n📘 (${count++}/${productLinks.length}) Analisi: ${product.title}`);

      try {
        await page.goto(product.href, { waitUntil: "domcontentloaded", timeout: 45000 });
        await new Promise((r) => setTimeout(r, 1200));

        // 📄 Estrae i link ai PDF
        const pdfLinks = await page.$$eval('a[href$=".pdf"]', (anchors) =>
          anchors.map((a) => {
            const file = a.href.split("/").pop().split("?")[0];
            const decoded = decodeURIComponent(file)
              .replace(/_/g, " ")
              .replace(/\.pdf.*/i, "")
              .trim();
            return {
              name: decoded,
              href: a.href,
            };
          })
        );

        for (const pdf of pdfLinks) {
          let size = 0;
          try {
            const res = await axios.head(pdf.href);
            size = res.headers["content-length"]
              ? parseInt(res.headers["content-length"])
              : 0;
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

    // 🧠 Deduplicazione intelligente (basata su nome file + size)
    const outPath = path.join(process.cwd(), `output_${brand}.json`);
    let previous = [];

    if (fs.existsSync(outPath)) {
      try {
        previous = JSON.parse(fs.readFileSync(outPath, "utf8"));
        console.log(`📚 Trovati ${previous.length} manuali precedenti.`);
      } catch {
        console.warn("⚠️ File output precedente corrotto o non leggibile, verrà sovrascritto.");
      }
    }

    const key = (url, size) => {
      const name = decodeURIComponent(url.split("/").pop().split("?")[0]);
      return `${name}_${size}`;
    };
    const previousKeys = new Set(previous.map(p => key(p.url, p.size)));
    const newResults = results.filter(r => !previousKeys.has(key(r.url, r.size)));

    if (newResults.length > 0) {
      console.log(`🆕 Trovati ${newResults.length} nuovi manuali.`);
      const merged = [...previous, ...newResults];
      fs.writeFileSync(outPath, JSON.stringify(merged, null, 2));
      console.log(`💾 Aggiornato file con ${merged.length} manuali totali.`);
    } else {
      console.log("✅ Nessun nuovo manuale trovato, file invariato.");
    }

    // 🔎 Riepilogo
    const preview = newResults.slice(0, 10);
    if (preview.length > 0) {
      console.log("\n📋 Anteprima dei nuovi manuali trovati:");
      preview.forEach((r) => console.log(`  • ${r.manual_name} (${r.product})`));
      if (newResults.length > 10)
        console.log(`  ... e altri ${newResults.length - 10} manuali.`);
    }

  } catch (err) {
    console.error(`❌ Errore fatale nel crawler ${brand}:`, err.message);
  } finally {
    await browser.close();
  }

  return results;
}
