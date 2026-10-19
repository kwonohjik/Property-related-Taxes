/**
 * 1세대1주택 AI 참고 의견 — 해석례 카드를 로컬 폴더에서 읽는다(서버 전용).
 *
 * 카드는 교재 파생 칸이 들어 있는 비공개 자료라 저장소 밖에 둔다. 기본 폴더는 `~/tax-knowledge-private/cards/one-house`,
 * 다른 곳이면 `ONE_HOUSE_AI_CARDS_DIR`. 이 도구는 로컬 개발 서버 전용이다(`access-guard.ts`).
 */
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { OneHouseCard } from "./cards";

export const oneHouseCardsDir = () =>
  process.env.ONE_HOUSE_AI_CARDS_DIR || path.join(homedir(), "tax-knowledge-private", "cards", "one-house");

/** 카드 파일 `E###.json`만 읽는다(`_schema.md` 등 작업 파일 제외). 폴더가 없으면 빈 목록. */
export async function loadOneHouseCards(dir = oneHouseCardsDir()): Promise<OneHouseCard[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const files = names.filter((n) => /^E\d+\.json$/.test(n)).sort();
  return Promise.all(files.map(async (n) => JSON.parse(await readFile(path.join(dir, n), "utf8")) as OneHouseCard));
}
