import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function crawlSite(config) {
  const brand = config.brand;
  const baseUrl = config.url;
  console.log(`📦 Avvio crawling per brand: ${brand} (browser mode)...`);

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();

  const results = [];

  try {
    console.log(`🌍 Apertura del Resource Center...`);
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await wait(2000);

    console.log(`🔍 Estrazione link dei prodotti...`);
    const links = await page.$$eval("a", (elements) =>
      elements
        .map((el) => ({
          href: el.href,
          text: el.innerText.trim(),
        }))
        .filter((el) => el.href && el.href.toLowerCase().includes(".pdf"))
    );

    console.log(`🔎 Trovati ${links.length} prodotti ${brand}`);

    let counter = 1;
    for (const link of links) {
      const fileUrl = link.href;
      const fileName = decodeURIComponent(path.basename(fileUrl))
        .replace(/\?.*$/, "")
        .trim();
      const productName = link.text || "Unknown Product";

      console.log(`📘 (${counter}/${links.length}) Analisi: ${productName}`);
      console.log(`📄 PDF trovato: ${fileName}`);

      results.push({
        brand,
        product: productName,
        title: fileName.replace(/\.pdf$/i, ""),
        url: fileUrl,
      });

      counter++;
    }

    console.log(`\n📄 Totale PDF trovati: ${results.length}`);

    // 📁 Salvataggio in file JSON
    const outputFile = path.join(
      path.resolve(),
      `output_${brand}.json`
    );
    fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));

    console.log(`💾 Salvati ${results.length} risultati in ${outputFile}`);

    await browser.close();
    return results;
  } catch (err) {
    console.error(`❌ Errore generale nel crawler: ${err.message}`);
    await browser.close();
    return [];
  }
}
