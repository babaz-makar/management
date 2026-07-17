import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

export interface TokenStore {
  get(slackUserId: string): Promise<string | null>;
  set(slackUserId: string, refreshToken: string): Promise<void>;
  delete(slackUserId: string): Promise<void>;
}

export class JsonFileTokenStore implements TokenStore {
  constructor(private filePath: string) {}

  private read(): Record<string, string> {
    if (!existsSync(this.filePath)) return {};
    try {
      return JSON.parse(readFileSync(this.filePath, "utf-8"));
    } catch {
      return {};
    }
  }

  private write(data: Record<string, string>): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf-8");
  }

  async get(slackUserId: string): Promise<string | null> {
    return this.read()[slackUserId] ?? null;
  }

  async set(slackUserId: string, refreshToken: string): Promise<void> {
    const data = this.read();
    data[slackUserId] = refreshToken;
    this.write(data);
  }

  async delete(slackUserId: string): Promise<void> {
    const data = this.read();
    delete data[slackUserId];
    this.write(data);
  }
}
