import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function crawlSite(config) {
  console.log(`📦 Avvio crawling per brand: ${config.brand} (browser mode)...`);

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  const results = [];

  try {
    console.log(`🌍 Apertura del Resource Center...`);
    await page.goto(config.url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await wait(4000);

    console.log(`🔍 Estrazione link dei prodotti...`);
    const productLinks = await page.$$eval("a", (els) =>
      els
        .map((a) => a.href)
        .filter((href) => href && href.includes("/products/"))
    );

    console.log(`🔎 Trovati ${productLinks.length} prodotti ${config.brand}`);

    let pdfCount = 0;
    for (let i = 0; i < productLinks.length; i++) {
      const link = productLinks[i];
      console.log(`📘 (${i + 1}/${productLinks.length}) Analisi: ${link}`);

      try {
        await page.goto(link, { waitUntil: "domcontentloaded", timeout: 60000 });
        await wait(2000);

        const pdfLinks = await page.$$eval("a", (els) =>
          els
            .map((a) => ({
              href: a.href,
              text: a.innerText.trim(),
            }))
            .filter((el) => el.href.toLowerCase().includes(".pdf"))
        );

        if (pdfLinks.length === 0) {
          console.log(`⚠️ Nessun PDF trovato per ${link}`);
          continue;
        }

        for (const pdf of pdfLinks) {
          results.push({
            brand: config.brand,
            product: pdf.text || "Unknown Product",
            title: path.basename(pdf.href).replace(/\.pdf.*/i, ""),
            url: pdf.href,
          });
          console.log(`📄 PDF trovato: ${pdf.text || pdf.href}`);
          pdfCount++;
        }
      } catch (err) {
        console.warn(`⚠️ Errore su ${link}: ${err.message}`);
      }
    }

    console.log(`\n📄 Totale PDF trovati: ${pdfCount}`);

    // salva output
    const outputFile = path.join(path.resolve(), `output_${config.brand}.json`);
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
