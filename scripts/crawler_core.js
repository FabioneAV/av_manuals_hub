import axios from "axios";
import * as cheerio from "cheerio";

export async function crawlSite(config) {
  console.log(`🔍 Analisi sito per ${config.brand}...`);
  const results = [];

  try {
    // ✅ Caso speciale: MAXHUB ha un'API dedicata
    if (config.brand.toLowerCase() === "maxhub") {
      console.log("📡 Uso dell'API ufficiale Maxhub...");

      // Chiamata POST all'API di Maxhub
      const response = await axios.post(
        "https://www.maxhub.com/eu/v1/api/resource/content",
        new URLSearchParams({
          menu_id: "fileList_4b4f696f-3038-45d5-a112-00c0fc73bbcc",
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "User-Agent": "Mozilla/5.0 (AVManualsBot)",
            Origin: "https://www.maxhub.com",
            Referer: "https://www.maxhub.com/eu/resource-center/",
          },
        }
      );

      if (response.data && Array.isArray(response.data.data)) {
        for (const item of response.data.data) {
          if (!item?.fileUrl?.endsWith(".pdf")) continue;
          results.push({
            brand: "Maxhub",
            product_name: item.title || "Manual",
            pdf_url: item.fileUrl.startsWith("http")
              ? item.fileUrl
              : `https://www.maxhub.com${item.fileUrl}`,
            source_url: "https://www.maxhub.com/eu/resource-center/",
            last_sync: new Date().toISOString(),
          });
        }
      }

      console.log(`📄 Trovati ${results.length} manuali via API Maxhub`);
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
