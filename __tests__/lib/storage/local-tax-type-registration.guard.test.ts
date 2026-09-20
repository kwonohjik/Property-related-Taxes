/**
 * `LocalTaxType` 등록 커버리지 가드 (P4-2b-3)
 *
 * ## 왜 필요한가 — **TS가 잡아주는 곳이 사실상 한 곳뿐이다**
 *
 * union을 늘려도 컴파일이 막아 주는 것은 `Record<LocalTaxType, …>`로 선언된 지점뿐이고,
 * 나머지는 `Partial<Record<…>>`·`Record<string, …>`·`default` 있는 switch·별도 리터럴
 * 배열이라 전부 **침묵한다**. 그 침묵은 이미 두 가지 결함을 낳았다:
 *
 *   1. `HistoryDetailDrawer`의 라우트 맵이 **6/8**이라 주식 2세목은 「편집」 버튼이 아예
 *      렌더되지 않았고, 그 아래 `stock_valuation` 재개 분기는 도달 불가 dead code였다.
 *   2. `backup-validate.ts`가 세목 목록을 **따로** 들고 있어, 한쪽에만 세목을 더하면
 *      그 세목의 **백업 import가 조용히 거부**됐다.
 *
 * P4-2b-3에서 둘 다 정본 하나로 모았다. 이 파일은 **다시 갈라지는 것**을 막는다 —
 * 정적 소스 스캔(R-7·R-8)이 그 역할이다. 표본 기반 단언만으로는 「내가 안 건드린 파일이
 * 사본을 새로 만드는 것」을 못 잡는다는 것을 P4-2b-1의 인용 결함에서 이미 배웠다.
 */
import "fake-indexeddb/auto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { LOCAL_TAX_TYPES, type LocalTaxType } from "@/lib/storage/types";
import { TAX_TYPE_ROUTES } from "@/lib/storage/tax-type-routes";
import { TAX_LABEL, generateTitle } from "@/lib/storage/title-generator";
import { extractBusinessKey } from "@/lib/storage/business-key";
import { validateBackup } from "@/lib/storage/backup-validate";
import { BACKUP_FORMAT, BACKUP_VERSION } from "@/lib/storage/backup-export";
import { FILTER_OPTIONS } from "@/app/history/HistoryClient";

const REPO_ROOT = process.cwd();

describe("LocalTaxType 등록 커버리지", () => {
  it("[R-1] 런타임 목록에 중복·빈 값이 없다 (union은 여기서 파생된다)", () => {
    expect(new Set(LOCAL_TAX_TYPES).size).toBe(LOCAL_TAX_TYPES.length);
    for (const t of LOCAL_TAX_TYPES) expect(t.length).toBeGreaterThan(0);
    // 신규 세목은 여기 등록돼야 한다 — 빠뜨리면 아래 전 단언이 그 세목을 아예 보지 않는다.
    expect(LOCAL_TAX_TYPES).toContain("one_house_exemption");
  });

  it("[R-2] `TAX_LABEL`이 전 세목을 덮고 라벨이 서로 다르다", () => {
    for (const t of LOCAL_TAX_TYPES) expect(TAX_LABEL[t]?.length ?? 0).toBeGreaterThan(0);
    const labels = LOCAL_TAX_TYPES.map((t) => TAX_LABEL[t]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("[R-3] `TAX_TYPE_ROUTES`가 전 세목을 덮고 경로가 서로 다르다", () => {
    for (const t of LOCAL_TAX_TYPES) expect(TAX_TYPE_ROUTES[t]).toMatch(/^\//);
    const routes = LOCAL_TAX_TYPES.map((t) => TAX_TYPE_ROUTES[t]);
    expect(new Set(routes).size).toBe(routes.length);
  });

  /**
   * 🔴 **드로어 6/8 결함의 직접 회귀 단언**이다.
   *    `route && …` 가드가 「편집」 버튼의 유일한 조건이므로, 경로가 있으면 버튼이 뜬다.
   */
  it("[R-4] 주식 2세목·판정 메뉴에 재개 경로가 있다 (편집 버튼 노출 조건)", () => {
    expect(TAX_TYPE_ROUTES.stock_transfer).toBe("/calc/stock-transfer-tax");
    expect(TAX_TYPE_ROUTES.stock_valuation).toBe("/tools/stock-valuation");
    expect(TAX_TYPE_ROUTES.one_house_exemption).toBe("/calc/one-house-exemption");
  });

  it("[R-5] 이력 필터가 전 세목을 노출한다 (빠지면 그 세목 이력을 걸러 볼 수 없다)", () => {
    const values = new Set(FILTER_OPTIONS.map((o) => o.value));
    expect(values.has("all")).toBe(true);
    for (const t of LOCAL_TAX_TYPES) expect(values.has(t)).toBe(true);
  });

  /**
   * 🔴 종전에 **조용히 거부**되던 지점이다. 세목마다 실제로 `validateBackup`을 통과시킨다 —
   *    배열을 눈으로 대조하는 대신 **거부 여부 자체**를 관측한다.
   */
  it("[R-6] 백업 import가 전 세목 record를 받아들인다", () => {
    for (const taxType of LOCAL_TAX_TYPES) {
      const result = validateBackup({
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        dbVersion: 1,
        exportedAt: "2026-09-21T00:00:00.000Z",
        userProfile: null,
        clients: [],
        calculations: [
          {
            id: "c1",
            userId: "u1",
            taxType,
            title: "t",
            inputData: {},
            resultData: {},
            taxLawVersion: "2026-01-01",
            linkedCalculationId: null,
            clientId: null,
            createdAt: "2026-09-21T00:00:00.000Z",
            updatedAt: "2026-09-21T00:00:00.000Z",
          },
        ],
      });
      expect(result.ok, `${taxType} 백업 import가 거부됐다`).toBe(true);
    }
  });

  /**
   * 정적 소스 스캔 — **사본이 다시 생기는 것**을 막는다.
   * 표본 단언(R-3·R-4)은 내가 고친 파일만 본다. 다른 파일이 자기 맵을 새로 선언하면
   * 그 단언들은 전부 초록인 채로 같은 결함이 되살아난다.
   */
  it("[R-7] 이력 화면이 라우트 맵 사본을 선언하지 않는다", () => {
    const offenders: string[] = [];
    for (const file of tsFilesUnder(["app/history", "components/history"])) {
      const src = readFileSync(join(REPO_ROOT, file), "utf8");
      // `import { TAX_TYPE_ROUTES }`는 허용 — `const TAX_TYPE_ROUTES =` 선언만 잡는다.
      if (/\b(const|let|var)\s+TAX_TYPE_ROUTES\s*(:|=)/.test(src)) offenders.push(file);
    }
    expect(offenders, "라우트 맵 정본은 lib/storage/tax-type-routes.ts 하나다").toEqual([]);
  });

  it("[R-8] 세목 문자열 목록 사본이 `lib/storage` 밖에 없다", () => {
    const offenders: string[] = [];
    for (const file of tsFilesUnder(["lib/storage"])) {
      if (file.endsWith("lib/storage/types.ts")) continue; // 정본
      const src = readFileSync(join(REPO_ROOT, file), "utf8");
      if (/\b(const|let|var)\s+LOCAL_TAX_TYPES\s*(:|=)/.test(src)) offenders.push(file);
    }
    expect(offenders, "세목 목록 정본은 lib/storage/types.ts 하나다").toEqual([]);
  });
});

describe("one_house_exemption 이력 식별", () => {
  const input = {
    assets: [{ addressRoad: "서울 강남구 테헤란로 1" }],
    transferDate: "2026-06-01",
  };

  it("[J-1] 제목이 판정 메뉴임을 드러내고 날짜를 「양도예정」으로 적는다", () => {
    const title = generateTitle("one_house_exemption", input, "2026-09-21T00:00:00.000Z");
    expect(title).toContain("1세대1주택 판정");
    expect(title).toContain("서울 강남구 테헤란로 1");
    // 확정 양도(「양도 2026.06.01」)와 섞이면 이력에서 구별되지 않는다.
    expect(title).toContain("양도예정 2026.06.01");
  });

  it("[J-2] businessKey가 주소+예정일로 만들어진다 — 주소가 없으면 만들지 않는다", () => {
    expect(extractBusinessKey("one_house_exemption", input)).toBe(
      "addr:서울 강남구 테헤란로 1|2026.06.01",
    );
    // 날짜만으로는 물건이 식별되지 않는다 — 양도세와 같은 규약(§1-1 실측).
    expect(extractBusinessKey("one_house_exemption", { transferDate: "2026-06-01" })).toBeNull();
  });

  it("[J-3] 예정일이 다르면 별개 record다 (판정이 달라진다)", () => {
    const a = extractBusinessKey("one_house_exemption", input);
    const b = extractBusinessKey("one_house_exemption", { ...input, transferDate: "2027-06-01" });
    expect(a).not.toBe(b);
  });
});

/** 지정한 디렉터리들 아래의 .ts/.tsx 파일 경로(repo 상대)를 모은다. */
function tsFilesUnder(dirs: string[]): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const name of readdirSync(join(REPO_ROOT, rel))) {
      const childRel = `${rel}/${name}`;
      if (statSync(join(REPO_ROOT, childRel)).isDirectory()) walk(childRel);
      else if (/\.tsx?$/.test(name)) out.push(childRel);
    }
  };
  for (const d of dirs) walk(d);
  return out;
}
