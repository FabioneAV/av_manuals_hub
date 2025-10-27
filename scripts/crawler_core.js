import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
    await wait(5000);

    console.log(`🔍 Estrazione link dei prodotti...`);
    const products = await page.$$eval("a", (els) =>
      els
        .map((a) => ({
          href: a.href,
          title: a.innerText.trim(),
        }))
        .filter((a) => a.href.includes("resource-center-detail"))
    );

    console.log(`🔎 Trovati ${products.length} prodotti ${config.brand}`);

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      console.log(`📘 (${i + 1}/${products.length}) Analisi: ${product.title || product.href}`);

      try {
        await page.goto(product.href, { waitUntil: "domcontentloaded", timeout: 60000 });
        await wait(2000);

        // Estrae titolo del prodotto dalla pagina
        const productTitle = await page.$eval("h1", (el) => el.innerText.trim()).catch(async () => {
          return (await page.title()) || product.title || "Unknown Product";
        });

        const pdfLinks = await page.$$eval("a", (els) =>
          els
            .map((a) => ({
              href: a.href,
              text: a.innerText.trim(),
            }))
            .filter((el) => el.href.toLowerCase().endsWith(".pdf"))
        );

        if (pdfLinks.length === 0) {
          console.log(`⚠️ Nessun PDF trovato per ${productTitle}`);
          continue;
        }

        for (const pdf of pdfLinks) {
          results.push({
            brand: config.brand,
            product: productTitle,
            title: pdf.text || path.basename(pdf.href),
            url: pdf.href,
          });
          console.log(`📄 PDF trovato: ${pdf.text || pdf.href}`);
        }
      } catch (err) {
        console.warn(`⚠️ Errore su ${product.href}: ${err.message}`);
      }
    }

    console.log(`\n📄 Totale PDF trovati: ${results.length}`);
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
