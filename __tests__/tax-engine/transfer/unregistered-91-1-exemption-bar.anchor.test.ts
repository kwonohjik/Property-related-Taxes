/**
 * anchor: 미등기양도자산 → 비과세 규정 부적용 (「소득세법」 제91조 제1항).
 *
 * 조문 원문 (KoreanLaw MST 280405, 시행 2026-07-01 · 2026-08-11 직독):
 *   §91① 「제104조제3항에서 규정하는 미등기양도자산에 대하여는 이 법 또는 이 법 외의 법률 중
 *         양도소득에 대한 소득세의 **비과세**에 관한 규정을 적용하지 아니한다.」
 *
 * ⚠️ ①항이 배제하는 것은 **비과세뿐**이다. 표제가 「비과세 또는 감면의 배제 등」이라 오독하기
 *    쉬우나 감면 배제는 ②항(매매계약서 거래가액 허위기재) 사유이고, 미등기를 사유로 한 감면
 *    배제는 §91에 없다 — 여기서 감면까지 끄면 법 근거 없는 불리 적용이 된다.
 *
 * 배경: 겸용주택 경로에는 이 배제가 있으나(`transfer-tax-mixed-use.ts:135-139`), 단건 경로의
 *   `checkExemption`(`transfer-tax-exemption.ts:572`)에는 `isUnregistered` 게이트가 없다.
 *   계획서: docs/02-design/features/transfer-unregistered-asset-kind-coverage.plan.md §7 Q5
 *
 * 🔑 mutation probe 구조 — 「세액이 0이 아니다」만 보면 다른 이유(요건 미충족)로도 통과한다.
 *    U-5a(대조군)가 **같은 입력에서 비과세가 실제로 성립함**을 먼저 증명하고, U-5b가 미등기
 *    플래그 하나만 뒤집어 과세로 전환되는지 본다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

// 1세대1주택 · 보유 5년 · 거주 60개월 · 양도가 5억(12억 이하) — 전액 비과세가 성립하는 입력.
const EXEMPT_CASE = { isOneHousehold: true, householdHousingCount: 1 } as const;

describe("§91① 미등기양도자산 비과세 배제 (단건 경로)", () => {
  it("U-5a(대조군): 미등기 OFF → 1세대1주택 비과세 성립 · 세액 0", () => {
    const r = calculateTransferTax(
      baseTransferInput({ ...EXEMPT_CASE, isUnregistered: false }),
      makeMockRates(),
    );
    // 이 단언이 깨지면 아래 U-5b는 「비과세가 애초에 없었다」는 이유로 통과할 수 있다 —
    // probe의 전제이므로 먼저 고정한다.
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });

  it("U-5b: 미등기 ON → 비과세 배제 · 과세된다 (§91①)", () => {
    const r = calculateTransferTax(
      baseTransferInput({ ...EXEMPT_CASE, isUnregistered: true }),
      makeMockRates(),
    );
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBeGreaterThan(0);
  });

  it("U-5c: 미등기 ON + 비과세 성립 → 70% 단일세율이 실제로 적용된다 (§104①10호)", () => {
    const r = calculateTransferTax(
      baseTransferInput({ ...EXEMPT_CASE, isUnregistered: true }),
      makeMockRates(),
    );
    // 비과세가 배제된 뒤에야 세율 판정에 도달한다 — 배제가 없으면 이 단언도 무의미하다.
    expect(r.appliedRate).toBe(0.7);
  });
});
