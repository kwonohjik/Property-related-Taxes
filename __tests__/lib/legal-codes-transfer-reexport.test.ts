/**
 * 게이트 — `legal-codes/transfer` **namespace 재수출 보존**
 *
 * ## 왜 필요한가
 *
 * `transfer.ts`가 800줄 정책으로 `transfer-nbl.ts`·`transfer-house.ts`로 쪼개지면서
 * 하위 호환을 `export *` 재수출에 의존하게 됐다. 이 재수출이 끊기면 두 곳이 조용히 깨진다:
 *
 * 1. **직접 import 호출부** — `import { NBL } from "./legal-codes/transfer"` 같은 코드가
 *    10개 파일에 있다. 이건 `tsc`가 잡는다.
 * 2. **법령 검증 모수** — `lib/legal-verification/coverage-collect.ts`가
 *    `import * as transfer`로 namespace의 모든 문자열 leaf를 순회해 인용을 모은다.
 *    재수출이 끊기면 그 조문들이 **모수에서 조용히 빠진다**.
 *
 * ## 🔴 기존 게이트로는 2번을 잡지 못한다 (실측 2026-08-05)
 *
 * 재수출 한 줄을 지우고 돌려본 결과:
 *
 * | 게이트 | 재수출 제거 후 | 잡히나 |
 * |---|---|---|
 * | `npm run verify:legal` | **338건 그대로** | ❌ (manifest 기반이라 namespace와 무관) |
 * | `legal-verification-coverage-complete` | 통과 | ❌ ("모수 **안**이 100%"만 본다 — 모수가 줄면 공허하게 참) |
 * | `legal-verification-unverifiable` | 통과 | ❌ (모수 밖 목록만 본다) |
 *
 * ⇒ **이 파일이 유일한 가드다.** 심볼 존재를 직접 단언한다.
 */
import { describe, it, expect } from "vitest";
import * as transfer from "@/lib/tax-engine/legal-codes/transfer";

/** `transfer-nbl.ts` 소관 — 비사업용 토지 (소득세법 §104의3·시행령 §168의6~14) */
const FROM_NBL = [
  "NBL",
  "NBL_REVENUE_THRESHOLDS",
  "getNblRevenueThreshold",
  "ESTIMATED_DEDUCTION_RATE",
  "estimatedDeductionRate",
] as const;

/** `transfer.ts` 본체 소관 — 양도소득세 (소득세법 §89~§104) */
const FROM_TRANSFER = [
  "TRANSFER",
  "EXEMPTION_PROVISO_CONST",
  "TEMP_TWO_HOUSE_PROVISO_REASONS",
  "ONE_HOUSE_RESIDENCE",
  "SURCHARGE_EXCLUSION_WINDOW",
  "SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW",
  "isWithinSurchargeSuspensionWindow",
] as const;

/** `transfer-house.ts` 소관 — 다주택·상속주택·임대·감면·재개발·LTHD */
const FROM_HOUSE = [
  "MULTI_HOUSE",
  "INHERITED_HOUSE",
  "MIXED_USE", // transfer-house.ts가 transfer-mixed-use.ts에서 재수출(2단 재수출)
  "TRANSFER_RENTAL_HOUSING",
  "TRANSFER_REDUCTION_ARTICLE",
  "REDEVELOPMENT",
  "LTHD_EXCLUSION_LABEL",
] as const;

describe("legal-codes/transfer — 분할 후 namespace가 보존된다", () => {
  it.each([
    ["transfer-nbl.ts", FROM_NBL],
    ["transfer.ts(본체)", FROM_TRANSFER],
    ["transfer-house.ts", FROM_HOUSE],
  ])("%s의 심볼이 transfer namespace로 노출된다", (_file, names) => {
    const ns = transfer as unknown as Record<string, unknown>;
    const missing = names.filter((n) => ns[n] === undefined);
    expect(missing, `재수출 끊김 — 누락: ${missing.join(", ")}`).toEqual([]);
  });

  it("법령 검증 모수가 실제로 채워진다 — 세 파일 모두에서 인용 문자열이 수집된다", () => {
    // coverage-collect가 하는 것과 같은 순회. 재수출이 끊기면 해당 조문이 0건이 된다.
    const ns = transfer as unknown as Record<string, unknown>;
    const strings: string[] = [];
    const seen = new WeakSet<object>();
    const walk = (v: unknown) => {
      if (typeof v === "string") return void strings.push(v);
      if (!v || typeof v !== "object" || seen.has(v)) return;
      seen.add(v);
      Object.values(v as Record<string, unknown>).forEach(walk);
    };
    Object.values(ns).forEach(walk);

    // 각 파일이 대표 조문을 실제로 실어 보내는지 — 하나라도 0이면 그 파일 재수출이 끊긴 것.
    // ⚠️ 인용 표기는 파일마다 다르다(실측): nbl은 "§168조의6", house는 "§167의3"(「조의」 없음).
    // 추측으로 쓰면 정상 상태에서도 실패한다 — 실제 리터럴을 확인하고 고정했다.
    expect(strings.some((s) => s.includes("§104조의3")), "transfer-nbl 인용 없음").toBe(true);
    expect(strings.some((s) => s.includes("소득세법 §92")), "transfer.ts 본체 인용 없음").toBe(true);
    expect(strings.some((s) => s.includes("§167의3")), "transfer-house 인용 없음").toBe(true);
  });
});
