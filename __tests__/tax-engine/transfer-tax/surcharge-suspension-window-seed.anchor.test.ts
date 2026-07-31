/**
 * anchor: 중과 한시배제(§167의3①12의2·§167의10①12의2) 창이 **양도일 전 구간에서 연속**인지.
 *
 * 계획서: docs/02-design/features/transfer-surcharge-155-deeming-coverage.plan.md §9.1 (F-6 / D-1)
 *
 * 🔴 결함이었던 것: 한시배제를 담은 레코드는 historical의 2022-05-10·2024-01-10 두 건인데,
 *    메인 seed의 `surcharge:_default`(effective **2023-01-01**)가 `special_rules: null`이라
 *    `DISTINCT ON … ORDER BY effective_date DESC` 의미론상 **2023-01-01 ~ 2024-01-09를 덮었다**.
 *    그 구간 양도(경정청구 기간 내)에 중과가 붙었다 — 실측 +388,410,000 과다과세.
 *
 * ⚠️ fallback 전용 문제가 아니다. `npm run seed:tax-rates`가 메인·historical을 같은 테이블에
 *    시딩하고 `preload_tax_rates()`도 동일 의미론이라 **DB 경로도 같은 공백**을 갖는다.
 */
import { describe, it, expect } from "vitest";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW } from "@/lib/tax-engine/legal-codes";

function suspensionAt(date: string) {
  const m = loadFallbackTransferRates(new Date(date));
  const rec = m.get("transfer:surcharge:_default") as unknown as
    | { specialRules?: { surcharge_suspended?: boolean; suspended_until?: string } }
    | undefined;
  return rec?.specialRules;
}

const { start, end } = SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW;

describe("D-1 — 중과 한시배제 창의 연속성 (F-6)", () => {
  it("창 시작 전 양도에는 유예 규칙이 없다", () => {
    expect(suspensionAt("2022-05-09")?.surcharge_suspended).toBeUndefined();
  });

  // 🔴 2023-01-01 ~ 2024-01-09 가 F-6이 뚫려 있던 구간이다.
  it.each([
    start, // 2022-05-10
    "2022-12-31",
    "2023-01-01",
    "2023-06-01",
    "2023-12-31",
    "2024-01-09",
    "2024-01-10",
    "2025-01-01",
    end, // 2026-05-09
  ])("창 안(%s) 양도는 유예 규칙을 갖는다", (d) => {
    const s = suspensionAt(d);
    expect(s?.surcharge_suspended).toBe(true);
    // 종료일도 단일 출처와 일치해야 한다 — 레코드마다 다른 값이면 경계가 흔들린다.
    expect(s?.suspended_until).toBe(end);
  });

  it("창 종료 다음날은 규칙이 남아 있어도 `suspended_until` 초과라 유예되지 않는다", () => {
    // 레코드 자체는 2024-01-10분이 계속 채택된다(그 뒤 레코드가 없으므로).
    // 실제 유예 여부는 `isSurchargeSuspended`가 suspended_until 과 비교해 판정한다.
    expect(suspensionAt("2026-05-10")?.suspended_until).toBe(end);
  });
});
