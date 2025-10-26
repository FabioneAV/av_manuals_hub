import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";

// Utility di attesa
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function crawlMaxhubManuals(brand, baseUrl) {
  console.log(`📦 Avvio crawling per brand: ${brand} (browser mode)...`);

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();

  const results = [];
  const visited = new Set();

  try {
    console.log(`🌍 Apertura del Resource Center...`);
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await wait(2500);

    // Scrolla per caricare tutti i prodotti
    await autoScroll(page);
    await wait(1500);

    console.log(`🔍 Estrazione link dei prodotti...`);
    const productLinks = await page.$$eval("a", (links) =>
      links
        .map((a) => a.href)
        .filter(
          (href) =>
            href &&
            href.includes("maxhub.com") &&
            (href.includes("/products/") || href.includes("details"))
        )
    );

    console.log(`🔎 Trovati ${productLinks.length} prodotti ${brand}`);

    let counter = 1;
    for (const productUrl of productLinks) {
      if (visited.has(productUrl)) continue;
      visited.add(productUrl);

      console.log(`\n📘 (${counter}/${productLinks.length}) Analisi: ${productUrl}`);
      counter++;

      try {
        await page.goto(productUrl, { waitUntil: "domcontentloaded" });
        await wait(2000);

        // 🧩 Estraggo nome prodotto da più possibili elementi
        const productName =
          (await page.$eval("h1", (el) => el.innerText.trim()).catch(() => null)) ||
          (await page.$eval(".product-title", (el) => el.innerText.trim()).catch(() => null)) ||
          (await page.$eval("meta[property='og:title']", (el) => el.content).catch(() => null)) ||
          (await page.title()) ||
          "Unknown Product";

        const pdfLinks = await page.$$eval("a", (links) =>
          links
            .map((a) => a.href)
            .filter(
              (href) =>
                href &&
                (href.endsWith(".pdf") ||
                  href.includes(".pdf?") ||
                  href.includes("download") ||
                  href.includes("manual"))
            )
        );

        if (pdfLinks.length === 0) {
          console.warn(`⚠️ Nessun PDF trovato per ${productName}`);
          continue;
        }

        pdfLinks.forEach((url) => {
          results.push({
            brand,
            product: productName,
            title: path.basename(url).replace(".pdf", ""),
            url,
          });
          console.log(`📄 PDF trovato: ${decodeURIComponent(path.basename(url))}`);
        });
      } catch (err) {
        console.error(`❌ Errore durante analisi ${productUrl}: ${err.message}`);
      }
    }

    await browser.close();

    console.log(`\n📄 Totale PDF trovati: ${results.length}`);
    const outputFile = `output_${brand}.json`;
    fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
    console.log(`💾 Salvati ${results.length} risultati in ${outputFile}`);

    return results;
  } catch (err) {
    console.error(`❌ Errore generale nel crawler: ${err.message}`);
    await browser.close();
    return [];
  }
}

// 🔁 Scroll automatico per caricare contenuti dinamici
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 400;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight - window.innerHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 200);
    });
  });
}
