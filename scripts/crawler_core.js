import axios from "axios";

const BASE_URL = "https://sgp-cstore-pub.maxhub.com/maxhub_global_public/api";
const REGION = "eu";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Content-Type": "application/json",
  "Origin": "https://www.maxhub.com",
  "Referer": "https://www.maxhub.com/eu/resource-center/",
  "X-Requested-With": "XMLHttpRequest",
};

/**
 * Crawler Maxhub: ricava tutti i PDF dal Resource Center ufficiale
 */
export async function crawlSite() {
  console.log("📦 Avvio crawling per brand: Maxhub...");

  try {
    // 1️⃣ Recupera lista prodotti
    console.log("📡 Fase 1: recupero lista prodotti...");

    const listRes = await axios.post(
      `${BASE_URL}/v1/api/resource/list`,
      { region: REGION, page: 1, size: 200 },
      { headers: HEADERS }
    );

    const products = listRes.data?.data?.list || [];
    console.log(`🔎 Trovati ${products.length} prodotti Maxhub`);

    const manuals = [];

    // 2️⃣ Analizza ciascun prodotto
    for (const product of products) {
      const productId = product.id;
      console.log(`\n📘 Analisi prodotto: ${product.name} (${productId})`);

      try {
        // 2a️⃣ Recupera struttura dettagliata (menus)
        const detailRes = await axios.post(
          `${BASE_URL}/v1/api/resource/detail`,
          { id: productId },
          { headers: HEADERS }
        );

        const menus = detailRes.data?.data?.menus || [];

        // 2b️⃣ Estrai tutti i fileList_
        const fileListIds = [];
        const traverse = (nodes) => {
          for (const node of nodes) {
            if (node.id?.startsWith("fileList_")) fileListIds.push(node.id);
            if (node.children?.length) traverse(node.children);
          }
        };
        traverse(menus);

        if (!fileListIds.length) {
          console.log(`⚠️ Nessun fileList trovato per ${product.name}`);
          continue;
        }

        console.log(`📂 Trovati ${fileListIds.length} gruppi di file per ${product.name}`);

        // 3️⃣ Recupera PDF da ciascun fileList
        for (const fileListId of fileListIds) {
          const contentRes = await axios.post(
            `${BASE_URL}/v1/api/resource/content`,
            { id: fileListId },
            { headers: HEADERS }
          );

          const details = contentRes.data?.data?.details || [];

          for (const d of details) {
            if (!d.href || !d.href.endsWith(".pdf")) continue;

            manuals.push({
              brand: "Maxhub",
              product: product.name,
              title: d.name,
              url: d.href,
              size: d.size || null,
              date: d.time || null,
            });

            console.log(`📄 PDF trovato: ${d.name}`);
          }
        }
      } catch (err) {
        console.error(`❌ Errore su ${product.name}:`, err.message);
      }
    }

    console.log(`\n📄 Totale manuali trovati per Maxhub: ${manuals.length}`);
    console.log("🎉 Tutti i brand processati con successo!");
    return manuals;
  } catch (err) {
    console.error("❌ Errore fatale nel crawler Maxhub:", err.message);
    throw err;
  }
}

// 🧪 Test locale
if (process.argv[1].includes("crawler_core.js")) {
  crawlSite().then(() => console.log("✅ Crawling completato"));
}
