// scripts/crawler_core.js
import puppeteer from "puppeteer";
import axios from "axios";
import fs from "fs";

export async function crawlSite(config) {
  const { brand, url } = config;
  console.log(`📦 Avvio crawling per brand: ${brand} (browser mode)...`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  const results = [];

  try {
    console.log("🌍 Apertura del Resource Center...");
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    console.log("🔍 Estrazione link dei prodotti...");
    await page.waitForFunction(
      () => document.querySelectorAll('a[href*="/resource-center-detail/?id="]').length > 0,
      { timeout: 15000 }
    );

    const productLinks = await page.$$eval(
      'a[href*="/resource-center-detail/?id="]',
      (links) =>
        links.map((a) => ({
          title: a.textContent.trim() || a.getAttribute("title") || "Unknown Product",
          href: a.href,
        }))
    );

    console.log(`🔎 Trovati ${productLinks.length} prodotti ${brand}`);

    let counter = 0;
    for (const link of productLinks) {
      counter++;
      console.log(`\n📘 (${counter}/${productLinks.length}) Analisi: ${link.title}`);

      try {
        await page.goto(link.href, { waitUntil: "domcontentloaded", timeout: 60000 });
        await new Promise((r) => setTimeout(r, 1500));

        // Estrai i PDF
        const pdfLinks = await page.$$eval('a[href$=".pdf"]', (links) =>
          links.map((a) => ({
            name: a.textContent.trim() || a.getAttribute("title") || "Manual",
            url: a.href,
          }))
        );

        for (const pdf of pdfLinks) {
          console.log(`📄 PDF trovato: ${pdf.name}`);
          results.push({
            brand,
            product: link.title,
            name: pdf.name,
            url: pdf.url,
          });
        }

        if (pdfLinks.length === 0) {
          console.warn(`⚠️ Nessun PDF trovato su ${link.title}`);
        }

      } catch (err) {
        console.error(`⚠️ Errore su ${link.title}: ${err.message}`);
      }

      // attesa di sicurezza tra una pagina e l’altra
      await new Promise((r) => setTimeout(r, 1000));
    }

  } catch (err) {
    console.error(`❌ Errore fatale nel crawler ${brand}:`, err.message);
  } finally {
    await browser.close();
  }

  console.log(`\n📄 Totale PDF trovati: ${results.length}`);
  return results;
}
