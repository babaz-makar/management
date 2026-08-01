import { JsonFileTokenStore, type TokenStore } from "@management/shift-management";
import { NeonTokenStore } from "./token-store-neon";
import { resolve } from "path";

let store: TokenStore | null = null;

export function getTokenStore(): TokenStore {
  if (store) return store;

  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    store = new NeonTokenStore(databaseUrl);
  } else {
    const path = process.env.TOKEN_STORE_PATH
      ?? resolve(process.cwd(), "data", "tokens.json");
    store = new JsonFileTokenStore(path);
  }

  return store;
}
