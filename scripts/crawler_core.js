// scripts/crawler_core.js
import axios from "axios";
import * as cheerio from "cheerio";

export async function crawlSite(config) {
  console.log(`🔍 Analisi sito per ${config.brand}...`);
  const results = [];

  try {
    const response = await axios.get(config.url, {
      headers: { "User-Agent": "Mozilla/5.0 (AVManualsBot)" },
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);

    // Cerca tutti i link a file PDF
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
