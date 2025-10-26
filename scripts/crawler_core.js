// scripts/crawler_core.js
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import { decode } from "html-entities";

export async function crawlSite(config) {
  const { brand, url, selectors } = config;
  console.log(`📦 Avvio crawling per brand: ${brand} (browser mode)...`);

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  console.log("🌍 Apertura del Resource Center...");
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

  console.log("🔍 Estrazione link dei prodotti...");
  const productLinks = await page.$$eval(selectors.productLinks, els =>
    els.map(el => ({
      name: el.innerText.trim(),
      href: el.href,
    }))
  );

  console.log(`🔎 Trovati ${productLinks.length} prodotti ${brand}`);
  const results = [];

  for (let i = 0; i < productLinks.length; i++) {
    const { name, href } = productLinks[i];
    console.log(`\n📘 (${i + 1}/${productLinks.length}) Analisi: ${name || "Unknown Product"}`);

    try {
      const productPage = await browser.newPage();
      await productPage.goto(href, { waitUntil: "networkidle2", timeout: 60000 });

      // Aspetta un po’ (sostituto di waitForTimeout)
      await new Promise(r => setTimeout(r, 1000));

      const pdfLinks = await productPage.$$eval(selectors.pdfLinks, els =>
        els
          .filter(el => el.href && el.href.toLowerCase().endsWith(".pdf"))
          .map(el => ({
            name: decodeURIComponent(el.innerText.trim() || el.href.split("/").pop()),
            url: el.href,
          }))
      );

      if (pdfLinks.length === 0) {
        console.warn(`⚠️ Nessun PDF trovato per ${name || "Unknown Product"}`);
      } else {
        pdfLinks.forEach(link => {
          console.log(`📄 PDF trovato: ${link.name}`);
          results.push({
            brand,
            product: name || "Unknown Product",
            ...link,
          });
        });
      }

      await productPage.close();
    } catch (err) {
      console.warn(`⚠️ Errore su ${name || "Unknown Product"}: ${err.message}`);
    }
  }

  await browser.close();

  console.log(`\n📄 Totale PDF trovati (prima della deduplica): ${results.length}`);
  return results;

  // ✅ LOG FINALE (verifica quanti PDF ci sono nel file salvato)
  try {
    const outPath = path.join(process.cwd(), `output_${brand}.json`);
    if (fs.existsSync(outPath)) {
      const content = JSON.parse(fs.readFileSync(outPath, "utf8"));
      console.log(`📊 Verifica finale: il file ${path.basename(outPath)} contiene ${content.length} manuali.`);
    } else {
      console.log(`⚠️ Verifica finale: file ${path.basename(outPath)} non trovato.`);
    }
  } catch (err) {
    console.warn(`⚠️ Errore durante la verifica finale: ${err.message}`);
  }
}
