import puppeteer from "puppeteer";

/**
 * Crawl del sito Maxhub (EU) con browser headless
 * Recupera i PDF dei manuali dal Resource Center ufficiale
 */
export async function crawlSite() {
  console.log("📦 Avvio crawling per brand: Maxhub (browser mode)...");

  const manuals = [];
  const baseUrl = "https://www.maxhub.com/eu/resource-center/";

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  // Impostiamo un user-agent realistico
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
  );

  await page.setViewport({ width: 1366, height: 768 });

  console.log("🌍 Apertura del Resource Center...");
  await page.goto(baseUrl, { waitUntil: "networkidle2", timeout: 60000 });

  // Scorri per caricare tutti i prodotti (lazy load)
  await autoScroll(page);

  console.log("🔍 Estrazione link dei prodotti...");
  const productLinks = await page.$$eval(
    "a[href*='/resource-center-detail/?id=']",
    (links) =>
      links.map((a) => ({
        name: a.textContent.trim(),
        href: a.href,
      }))
  );

  console.log(`🔎 Trovati ${productLinks.length} prodotti Maxhub`);

  // Intercetta richieste XHR per /resource/content
  page.on("response", async (res) => {
    const url = res.url();
    if (url.includes("/resource/content")) {
      try {
        const data = await res.json();
        const details = data?.data?.details || [];
        for (const d of details) {
          if (d.href?.endsWith(".pdf")) {
            manuals.push({
              title: d.name,
              url: d.href,
              size: d.size || null,
              date: d.time || null,
            });
            console.log(`📄 PDF trovato: ${d.name}`);
          }
        }
      } catch (err) {
        // ignora
      }
    }
  });

  // Visita ogni prodotto (con un piccolo delay per evitare rate limiting)
  for (const [i, prod] of productLinks.entries()) {
    console.log(`\n📘 (${i + 1}/${productLinks.length}) Analisi: ${prod.name}`);
    try {
      await page.goto(prod.href, { waitUntil: "networkidle2", timeout: 60000 });
      await page.waitForTimeout(2500);
    } catch (err) {
      console.error(`⚠️ Errore su ${prod.name}: ${err.message}`);
    }
  }

  await browser.close();

  console.log(`\n📄 Totale PDF trovati: ${manuals.length}`);
  console.log("🎉 Tutti i brand processati con successo!");
  return manuals;
}

/**
 * Esegue lo scroll automatico della pagina
 */
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 300;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= document.body.scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 400);
    });
  });
}

// 🧪 Test locale
if (process.argv[1].includes("crawler_core.js")) {
  crawlSite().then(() => console.log("✅ Crawling completato"));
}
