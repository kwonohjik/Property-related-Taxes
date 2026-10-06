/**
 * 1세대1주택 해석례 평가셋 — 국세청 해석·조세심판원 결정·판례의 사실관계를 판정 메뉴로 재현한다.
 *
 * - `bucket: "match"` 케이스만 회귀 단언한다(엔진이 바뀌어 결론이 달라지면 실패).
 * - 그 밖의 버킷(불일치·표현 불가·보류)은 `it.todo`로 남겨 목록이 보이게 한다 —
 *   엔진을 고치거나 입력 경로가 생기면 `match`로 옮긴다.
 * - `RULINGS_OBSERVE=<파일경로>`를 주면 전 케이스의 관측값을 JSON으로 쓰고 단언하지 않는다
 *   (분류 작업용).
 */
import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  observeCase,
  matchesExpected,
  type RulingCase,
  type RulingObservation,
} from "./harness";

const CASE_DIR = path.join(__dirname, "cases");
/** `RULINGS_FILES=E022.json,E046.json` — 지정한 케이스 파일만 읽는다(병렬 작업용). */
const onlyFiles = process.env.RULINGS_FILES?.split(",").map((s) => s.trim()).filter(Boolean);
const cases: RulingCase[] = fs
  .readdirSync(CASE_DIR)
  .filter((f) => f.endsWith(".json") && (!onlyFiles || onlyFiles.includes(f)))
  .sort()
  .flatMap((f) => {
    const parsed = JSON.parse(fs.readFileSync(path.join(CASE_DIR, f), "utf8"));
    return Array.isArray(parsed) ? parsed : [parsed];
  });

const observePath = process.env.RULINGS_OBSERVE;
const observed: Record<
  string,
  RulingObservation & { bucket: string; expected?: unknown; observedWith?: string }
> = {};

describe("1세대1주택 해석례 평가셋", () => {
  it("케이스 id가 중복되지 않는다", () => {
    const ids = cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const c of cases) {
    const title = `[${c.id}] ${c.docNo} (${c.basis}) — ${c.summary}`;
    if (observePath) {
      const which = c.form ? "form" : c.referenceForm ? "referenceForm" : null;
      if (!which) continue;
      it(title, async () => {
        observed[c.id] = {
          ...(await observeCase(c, which)),
          bucket: c.bucket,
          expected: c.expected,
          ...(which === "referenceForm" ? { observedWith: "referenceForm" } : {}),
        };
      });
      continue;
    }
    if (c.bucket !== "match") {
      it.todo(`${title} — ${c.bucket}: ${c.note ?? ""}`);
      continue;
    }
    it(title, async () => {
      expect(c.expected, "match 케이스에는 expected가 있어야 한다").toBeDefined();
      expect(c.form, "match 케이스에는 form이 있어야 한다").toBeDefined();
      const o = await observeCase(c);
      expect(matchesExpected(o, c.expected!), JSON.stringify(o)).toBe(true);
    });
  }

  afterAll(() => {
    if (observePath) fs.writeFileSync(observePath, JSON.stringify(observed, null, 2));
  });
});
