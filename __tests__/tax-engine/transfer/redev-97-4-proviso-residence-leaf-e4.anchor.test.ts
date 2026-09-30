/**
 * anchor (E-4) — 재개발 경로 조특법 §97의4① 단서 판정이 **LTHD 표2와 같은 leaf**를 본다.
 *
 * 법령(KoreanLaw MCP 실독):
 *   · 조세특례제한법 §97의4① 「… 「소득세법」 제95조제1항에 따른 장기보유 특별공제액을 계산할 때
 *     같은 조 제2항에 따른 보유기간별 공제율에 해당 주택의 임대기간에 따라 다음의 표에 따른 추가공제율을
 *     더한 공제율을 적용한다. 다만, 같은 항 단서에 해당하는 경우에는 그러하지 아니하다.」
 *   · 소득세법 §95② 단서 — 「대통령령으로 정하는 1세대 1주택 … 의 경우에는 … 표 2 …」
 *   · 소득세법 시행령 §159의4 — 「… 1세대가 양도일 현재 국내에 1주택 … 을 보유하고 보유기간 중
 *     거주기간이 2년 이상인 것」
 *
 * ⇒ 단서 해당 여부 = 표2가 적용되는가. 재개발 경로의 표2는 `computeRedevelopmentLthd`가
 *   `resolveAptResidenceMonths`(원조합원 prior + new — 소령 §154⑧1호 통산) ·
 *   `resolveRedevEffectiveOneHouseSingle`(인가일 요건 미충족 선언이면 표1)로 정한다.
 *   종전 `table2ActiveForRedev`는 Step4 `residencePeriodMonths`와 원시 `isOneHouseSingle`을 읽어
 *   같은 계산 안에서 「표2 적용 + 추가공제율 가산」(과소과세) 또는 「표1 + 미가산」(과대과세)이 나왔다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import { case45RedevelopmentInfo } from "@/__tests__/tax-engine/transfer-tax/redevelopment/_helpers";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";
import { redevUsesTable2 } from "@/lib/tax-engine/redevelopment-lthd";

const rates = makeMockRates();
const D = (v: string) => new Date(v);

/** §97의4 적격 — 등록 2013-05-01 · 임대개시 2013-06-01 · 양도 2026-02-16 → 임대 12년 → 추가 10% */
const R974 = {
  type: "rental_97_4" as const,
  registrationDate: D("2013-05-01"),
  rentalStartDate: D("2013-06-01"),
  isTaxRegistered: true,
  rental974Category: "purchase_a" as const,
  officialPriceAtStart: 500_000_000,
  region: "capital" as const,
};

/** 사례 45 사실관계(원조합원·청산금 납부·실가) · 1세대1주택 · 양도 2026-02-16 15억 */
function run(redev: Partial<RedevelopmentInfo>, over: Partial<TransferTaxInput> = {}, with974 = true) {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "redevelopment_apt",
      transferPrice: 1_500_000_000,
      transferDate: D("2026-02-16"),
      acquisitionDate: D("2007-04-09"),
      acquisitionPrice: 450_000_000,
      expenses: 0,
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: 0,
      redevelopment: { ...case45RedevelopmentInfo(), ...redev },
      ...(with974 ? { reductions: [R974] as unknown as TransferTaxInput["reductions"] } : {}),
      ...over,
    }),
    rates,
  );
}
const noticed = (r: ReturnType<typeof run>) =>
  r.steps.some((s) => s.label === "장기보유특별공제 특례 — 미가산 (조특법 §97의4① 단서)");
const added = (r: ReturnType<typeof run>) =>
  r.steps.some((s) => s.label === "장기보유특별공제 특례 — 장기임대주택 추가공제율 (조특법 §97의4①)");

describe("E-4 ① 분리 입력(종전 66개월)이 표2를 만들고 Step4 거주는 0 — 표2 대상이므로 가산하지 않는다", () => {
  const w = run({ priorHouseResidenceMonths: 66, newHouseResidenceMonths: 0 });
  const b = run({ priorHouseResidenceMonths: 66, newHouseResidenceMonths: 0 }, {}, false);

  it("전제 — 기존건물분은 표2(거주분 > 0)", () => {
    const detail = b.redevelopmentDetail as unknown as Record<string, { lthdResidencePart?: number }>;
    expect(detail.postApprovalExistingHouse.lthdResidencePart ?? 0).toBeGreaterThan(0);
  });

  it("🔴 §97의4① 단서 — 공제액·결정세액이 특례 미선택과 같다", () => {
    expect(noticed(w)).toBe(true);
    expect(added(w)).toBe(false);
    expect(w.longTermHoldingDeduction).toBe(b.longTermHoldingDeduction);
    expect(w.determinedTax).toBe(b.determinedTax);
    // 종전 91,439,367 / 7,262,551 (표2 80% 위에 10% 가산)
    expect(w.longTermHoldingDeduction).toBe(76_619_367);
    expect(w.determinedTax).toBe(10_819_351);
  });
});

describe("E-4 ② Step4 거주 36개월 · 분리 입력(신축 12개월)이 표1을 만든다 — 가산한다", () => {
  const w = run({ priorHouseResidenceMonths: 0, newHouseResidenceMonths: 12 }, { residencePeriodMonths: 36 });
  const b = run({ priorHouseResidenceMonths: 0, newHouseResidenceMonths: 12 }, { residencePeriodMonths: 36 }, false);

  it("전제 — 기존건물분은 표1(거주분 0)", () => {
    const detail = b.redevelopmentDetail as unknown as Record<string, { lthdResidencePart?: number }>;
    expect(detail.postApprovalExistingHouse.lthdResidencePart ?? 0).toBe(0);
  });

  it("🔴 추가공제율이 가산되어 공제액이 커진다", () => {
    expect(added(w)).toBe(true);
    expect(noticed(w)).toBe(false);
    expect(w.longTermHoldingDeduction).toBeGreaterThan(b.longTermHoldingDeduction);
    expect(w.determinedTax).toBeLessThan(b.determinedTax);
    // 종전 42,409,894 / 20,711,536 (Step4 36개월로 「표2 대상」 오판 → 미가산)
    expect(w.longTermHoldingDeduction).toBe(57_229_894);
    expect(w.determinedTax).toBe(15_524_536);
  });
});

describe("E-4 ③ 인가일 요건 미충족 선언(표1 강등) + Step4 거주 36개월 — 가산한다", () => {
  const redev = { priorHouseResidenceMonths: undefined, newHouseResidenceMonths: undefined, exemptionEligibleAtApproval: false };
  const w = run(redev, { residencePeriodMonths: 36 });
  const b = run(redev, { residencePeriodMonths: 36 }, false);

  it("🔴 표1로 계산되므로 §97의4① 단서가 아니다 — 가산", () => {
    expect(added(w)).toBe(true);
    expect(w.longTermHoldingDeduction).toBeGreaterThan(b.longTermHoldingDeduction);
    expect(w.determinedTax).toBeLessThan(b.determinedTax);
    // 종전 42,409,894 / 20,711,536
    expect(w.longTermHoldingDeduction).toBe(57_229_894);
    expect(w.determinedTax).toBe(15_524_536);
  });
});

describe("E-4 긍정 짝 — 두 입력이 같은 답을 내면 종전과 같다", () => {
  it("분리 66 + Step4 66 → 미가산", () => {
    const w = run({ priorHouseResidenceMonths: 66, newHouseResidenceMonths: 0 }, { residencePeriodMonths: 66 });
    const b = run({ priorHouseResidenceMonths: 66, newHouseResidenceMonths: 0 }, { residencePeriodMonths: 66 }, false);
    expect(noticed(w)).toBe(true);
    expect(w.determinedTax).toBe(b.determinedTax);
  });

  it("분리 입력 없음 + Step4 0 → 가산", () => {
    const redev = { priorHouseResidenceMonths: undefined, newHouseResidenceMonths: undefined };
    const w = run(redev);
    const b = run(redev, {}, false);
    expect(added(w)).toBe(true);
    expect(w.determinedTax).toBeLessThan(b.determinedTax);
  });
});

describe("E-4 leaf `redevUsesTable2` — LTHD 분기별 leaf와 같은 인자", () => {
  const apt = { subject: "apt" as const };
  const right = { subject: "right" as const };

  it("입주권 원조합원 — 종전 거주만(신축 거주는 더하지 않는다)", () => {
    expect(redevUsesTable2({ redevelopment: { ...right, priorHouseResidenceMonths: 24 }, isOneHouseSingle: true })).toBe(true);
    expect(redevUsesTable2({ redevelopment: { ...right, priorHouseResidenceMonths: 0, newHouseResidenceMonths: 36 }, isOneHouseSingle: true, residencePeriodMonths: 36 })).toBe(false);
    expect(redevUsesTable2({ redevelopment: right, isOneHouseSingle: true, residencePeriodMonths: 24 })).toBe(true);
  });

  it("입주권 승계조합원 — LTHD 부존재 → 표2 아님", () => {
    expect(redevUsesTable2({ redevelopment: { ...right, priorHouseResidenceMonths: 36 }, isOneHouseSingle: true, isSuccessorRightToMoveIn: true })).toBe(false);
  });

  it("입주권 · 인가일 요건 미충족 선언 → 표1", () => {
    expect(redevUsesTable2({ redevelopment: { ...right, exemptionEligibleAtApproval: false }, isOneHouseSingle: true, residencePeriodMonths: 36 })).toBe(false);
  });

  it("완공APT 승계조합원 — 신축 거주만 · 원시 1세대1주택", () => {
    const s = { ...apt, isSuccessorMember: true };
    expect(redevUsesTable2({ redevelopment: { ...s, priorHouseResidenceMonths: 60, newHouseResidenceMonths: 12 }, isOneHouseSingle: true })).toBe(false);
    expect(redevUsesTable2({ redevelopment: { ...s, newHouseResidenceMonths: 24 }, isOneHouseSingle: true })).toBe(true);
    expect(redevUsesTable2({ redevelopment: { ...s, newHouseResidenceMonths: 24 }, isOneHouseSingle: false })).toBe(false);
  });

  it("완공APT 원조합원 — prior + new 통산", () => {
    expect(redevUsesTable2({ redevelopment: { ...apt, priorHouseResidenceMonths: 12, newHouseResidenceMonths: 12 }, isOneHouseSingle: true })).toBe(true);
    expect(redevUsesTable2({ redevelopment: { ...apt, priorHouseResidenceMonths: 12, newHouseResidenceMonths: 11 }, isOneHouseSingle: true, residencePeriodMonths: 60 })).toBe(false);
  });
});
