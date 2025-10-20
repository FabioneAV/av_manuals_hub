import axios from "axios";
import * as cheerio from "cheerio";
import { createHash } from "./utils.js";
import fs from "fs";

export async function crawlSite(config) {
  const visited = new Set();
  const results = [];

  async function crawl(url, depth = 0) {
    if (visited.has(url) || depth > config.maxDepth) return;
    visited.add(url);

    try {
      const res = await axios.get(url, { timeout: 10000 });
      const $ = cheerio.load(res.data);
      const links = $("a[href]").map((_, el) => $(el).attr("href")).get();

      for (const link of links) {
        const absUrl = new URL(link, url).href;
        if (absUrl.match(config.pdfPattern)) {
          results.push({
            brand: config.brand,
            url: absUrl,
            file_hash: createHash(config.brand, absUrl),
            fetched_at: new Date().toISOString(),
            source: config.followDomains[0]
          });
        } else if (
          config.followDomains.some(d => absUrl.includes(d))
        ) {
          await crawl(absUrl, depth + 1);
        }
      }
    } catch (err) {
      console.log(`Errore su ${url}: ${err.message}`);
    }
  }

  for (const start of config.startUrls) {
    await crawl(start);
  }

  console.log(`✅ ${results.length} PDF trovati per ${config.brand}`);
  fs.writeFileSync(`output_${config.brand}.json`, JSON.stringify(results, null, 2));
  return results;
}
