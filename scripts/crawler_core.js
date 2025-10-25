import axios from "axios";
import * as cheerio from "cheerio";

export async function crawlSite(config) {
  console.log(`🔍 Analisi sito per ${config.brand}...`);
  const results = [];

  try {
    // ✅ Caso speciale: MAXHUB
    if (config.brand.toLowerCase() === "maxhub") {
      console.log("📡 Fase 1: recupero lista prodotti...");

      const mainPage = await axios.get("https://www.maxhub.com/eu/resource-center/", {
        headers: {
          "User-Agent": "Mozilla/5.0 (AVManualsBot)"
        }
      });

      const $ = cheerio.load(mainPage.data);
      const productIds = [];

      // Cerca link a /resource-center-detail/?id=xxxxx
      $('a[href*="/resource-center-detail/?id="]').each((_, el) => {
        const href = $(el).attr("href");
        const match = href.match(/id=([a-z0-9\-]+)/i);
        if (match && match[1]) productIds.push(match[1]);
      });

      console.log(`🔎 Trovati ${productIds.length} prodotti Maxhub`);

      // Fase 2: per ogni ID, chiamata API
      for (const id of productIds) {
        try {
          const res = await axios.post(
            "https://www.maxhub.com/eu/v1/api/resource/content",
            new URLSearchParams({ id }),
            {
              headers: {
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "User-Agent": "Mozilla/5.0 (AVManualsBot)",
                Origin: "https://www.maxhub.com",
                Referer: `https://www.maxhub.com/eu/resource-center-detail/?id=${id}`,
              },
              timeout: 15000
            }
          );

          const files = res.data?.data || [];
          for (const f of files) {
            if (!f?.fileUrl?.endsWith(".pdf")) continue;
            results.push({
              brand: "Maxhub",
              product_name: f.title || "Manual",
              pdf_url: f.fileUrl.startsWith("http")
                ? f.fileUrl
                : `https://www.maxhub.com${f.fileUrl}`,
              source_url: `https://www.maxhub.com/eu/resource-center-detail/?id=${id}`,
              last_sync: new Date().toISOString(),
            });
          }
        } catch (err) {
          console.warn(`⚠️ Errore con ID ${id}: ${err.message}`);
        }
      }

      console.log(`📄 Trovati ${results.length} manuali totali per Maxhub`);
      return results;
    }

    // ✅ Metodo generico (per altri brand)
    const response = await axios.get(config.url, {
      headers: { "User-Agent": "Mozilla/5.0 (AVManualsBot)" },
      timeout: 20000,
    });

    const $ = cheerio.load(response.data);
    $("a[href$='.pdf']").each((_, el) => {
      const pdfUrl = $(el).attr("href");
      const title = $(el).text().trim() || "Manual";
      const absoluteUrl = pdfUrl.startsWith("http")
        ? pdfUrl
        : new URL(pdfUrl, config.url).href;

      results.push({
        brand: config.brand,
        product_name: title,
        pdf_url: absoluteUrl,
        source_url: config.url,
        last_sync: new Date().toISOString(),
      });
    });

    console.log(`📄 Trovati ${results.length} manuali per ${config.brand}`);
    return results;
  } catch (err) {
    console.error(`❌ Errore durante il crawling di ${config.brand}:`, err.message);
    return [];
  }
}
