/**
 * Pre-Do anchor — `general-building-valuation.ts` 923줄 → 타입 분리 (2026-08-06)
 *
 * 계획서: `docs/02-design/features/general-building-part-major-acquisition.plan.md` §13
 *
 * ## 왜 타입만 떼는가
 *
 * 923줄 중 **≈487줄이 순수 타입 선언**(`GeneralBuildingInput` 하나가 255줄)이고 로직은 ~380줄이다.
 * 로직을 쪼개면 「환산 산식 → 카드 조립」이라는 하나의 흐름이 두 파일로 갈리는데, 그건 응집도를
 * 깨는 억지 조각화다. `lib/tax-engine/CLAUDE.md`가 이 경우를 명시한다 —
 * 「공개 타입이 3개 이상이고 엔진 외부(API·UI·테스트)에서 import되면 `types/`로 분리.
 *  Orchestrator에서는 `export type { X } from "./types/..."`로 재수출해 하위 호환 유지.」
 *
 * 실측 소비처: `GeneralBuildingInput` 18파일 · `GeneralBuildingOutput` 6 ·
 * `AssetCardForAggregate` 5 · `GeneralBuildingAcquisition` 5.
 *
 * ## 고정 계약
 *   T-1  `general-building-valuation.ts`가 ≤700줄이다
 *   T-2  6개 공개 타입을 **종전 경로에서** 계속 import할 수 있다 (재수출 — 이 파일이 컴파일되면 통과)
 *   T-3  타입 파일에는 **로직이 없다** (재성장 방지 — 함수·상수 선언 금지)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * T-2 — **종전 경로**에서 6개 타입을 import한다. 재수출이 끊기면 `npx tsc --noEmit`이 깨진다
 * (타입은 런타임에 지워지므로 컴파일이 곧 계약 검사다).
 */
import type {
  GeneralBuildingInput,
  GeneralBuildingAllocation,
  GeneralBuildingAcquisition,
  GeneralBuildingEstimatedDeduction,
  AssetCardForAggregate,
  GeneralBuildingOutput,
} from "@/lib/tax-engine/general-building-valuation";

const ENGINE = resolve(process.cwd(), "lib/tax-engine/general-building-valuation.ts");
const TYPES = resolve(process.cwd(), "lib/tax-engine/types/general-building.types.ts");

describe("T-1 — 파일 크기 정책", () => {
  it("엔진 파일이 ≤700줄 (트리거 800 · 착지 목표 700)", () => {
    expect(readFileSync(ENGINE, "utf8").split("\n").length).toBeLessThanOrEqual(700);
  });
});

describe("T-2 — 공개 타입 재수출 계약", () => {
  it("6개 타입이 종전 경로에서 쓰인다 (컴파일 통과가 곧 계약)", () => {
    // 타입을 실제로 **사용**해야 `import type`이 최적화로 사라지지 않는다.
    const probe: {
      input?: GeneralBuildingInput;
      allocation?: GeneralBuildingAllocation;
      acquisition?: GeneralBuildingAcquisition;
      deduction?: GeneralBuildingEstimatedDeduction;
      card?: AssetCardForAggregate;
      output?: GeneralBuildingOutput;
    } = {};
    expect(Object.keys(probe)).toHaveLength(0);
  });

  it("엔진 파일이 타입 파일을 **재수출**한다", () => {
    expect(readFileSync(ENGINE, "utf8")).toMatch(/export type \{[\s\S]*?\} from "\.\/types\/general-building\.types"/);
  });
});

describe("T-3 — 타입 파일에 로직을 두지 않는다", () => {
  const src = () => readFileSync(TYPES, "utf8");

  it("함수 선언이 없다", () => {
    expect(src()).not.toMatch(/^\s*(export\s+)?function\s/m);
  });

  it("런타임 값(const/let) 선언이 없다 — 재성장 방지", () => {
    expect(src()).not.toMatch(/^\s*(export\s+)?(const|let)\s/m);
  });

  it("import는 타입 전용이다", () => {
    for (const line of src().split("\n").filter((l) => l.startsWith("import"))) {
      expect(line, line).toMatch(/^import type /);
    }
  });
});
