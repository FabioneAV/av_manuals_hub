import axios from "axios";

const BASE_URL = "https://www.maxhub.com/api";
const REGION = "eu";

export async function crawlMaxhub() {
  console.log("📦 Avvio crawling per brand: Maxhub...");

  // 1️⃣ Recupera lista prodotti
  console.log("📡 Fase 1: recupero lista prodotti...");
  const listRes = await axios.post(`${BASE_URL}/v1/api/resource/list`, {
    region: REGION,
    page: 1,
    size: 200
  });
  const products = listRes.data?.data?.list || [];
  console.log(`🔎 Trovati ${products.length} prodotti Maxhub`);

  const manuals = [];

  // 2️⃣ Per ogni prodotto
  for (const product of products) {
    const productId = product.id;
    console.log(`\n📘 Analisi prodotto: ${product.name} (${productId})`);

    try {
      // 2a️⃣ Ottieni struttura delle sezioni (menus)
      const detailRes = await axios.get(
        `${BASE_URL}/v1/api/resource/detail?id=${productId}`
      );
      const menus = detailRes.data?.data?.menus || [];

      // 2b️⃣ Trova tutti gli ID che iniziano con "fileList_"
      const fileListIds = [];
      const traverse = (nodes) => {
        for (const n of nodes) {
          if (n.id?.startsWith("fileList_")) fileListIds.push(n.id);
          if (n.children?.length) traverse(n.children);
        }
      };
      traverse(menus);

      if (!fileListIds.length) {
        console.log(`⚠️ Nessun fileList trovato per ${product.name}`);
        continue;
      }

      console.log(`📂 Trovati ${fileListIds.length} gruppi di file per ${product.name}`);

      // 3️⃣ Per ogni fileList_XYZ, ottieni i PDF
      for (const fileListId of fileListIds) {
        const contentRes = await axios.get(
          `${BASE_URL}/v1/api/resource/content?id=${fileListId}`
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
  return manuals;
}

// Per test locale
if (process.argv[1].includes("crawler_core.js")) {
  crawlMaxhub().then(() => console.log("✅ Crawling completato"));
}
