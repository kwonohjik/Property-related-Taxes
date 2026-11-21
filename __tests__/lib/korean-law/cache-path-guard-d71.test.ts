/**
 * 2026-11 리뷰 D-71 — 캐시 키에 「/」·「..」가 섞여도 `.legal-cache` 밖 파일을 읽거나 쓰지 않는다(공개 `/api/law/decision-text`가 id를 키에 넣었다).
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CACHE_DIR, readCache, writeCache } from "@/lib/korean-law/client-core";

const outside = path.join(os.tmpdir(), `d71-probe-${process.pid}`);
const keyTo = (abs: string) => path.relative(CACHE_DIR, abs);
afterEach(async () => {
  await fs.rm(`${outside}.json`, { force: true });
  await fs.rm(`${outside}-w.json`, { force: true });
});

describe("D-71 캐시 경로 가드", () => {
  it("캐시 밖을 가리키는 키로는 읽지 않는다", async () => {
    await fs.writeFile(`${outside}.json`, JSON.stringify({ planted: true }), "utf-8");
    expect(keyTo(outside).startsWith("..")).toBe(true);
    expect(await readCache(keyTo(outside), true)).toBeNull();
  });
  it("캐시 밖을 가리키는 키로는 쓰지 않는다", async () => {
    await writeCache(keyTo(`${outside}-w`), { x: 1 });
    await expect(fs.stat(`${outside}-w.json`)).rejects.toThrow();
  });
});
