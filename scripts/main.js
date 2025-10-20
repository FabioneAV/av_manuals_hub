import crypto from "crypto-js";

export function createHash(brand, url) {
  return crypto.SHA256(brand + url).toString();
}
