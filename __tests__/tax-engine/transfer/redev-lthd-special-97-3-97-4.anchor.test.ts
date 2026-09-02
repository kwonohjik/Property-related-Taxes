/**
 * 재개발 경로 × 조특법 §97의3①·§97의4① 장기보유특별공제 특례 — **세액 반영**.
 *
 * ## 왜 결합 규칙이 따로 필요하지 않은가
 *
 * 소령 §166⑤은 LTHD의 **보유기간을 정하는** 규정이다(1호 인가전 / 2호가목 청산금납부분 /
 * 2호나목 기존건물분 — 셋의 기간이 서로 다르다). 여기에 특례를 얹을 때:
 *
 * - **§97의3①** 「…임대기간 중 발생하는 양도소득에 대해서는 「소득세법」 제95조제1항에 따른
 *   장기보유 특별공제액을 계산할 때 같은 조 제2항에도 불구하고 **100분의 70의 공제율**을
 *   적용한다」 — 율이 **고정**이라 보유기간이 개입할 여지가 없다. §166⑤ 3분기는 **비임대분**
 *   에만 걸리고, 그건 각 분기가 이미 하는 일이다. 두 축은 곱해질 뿐 충돌하지 않는다.
 * - **§97의4①** 은 통상 율에 임대기간별 추가율을 **가산**한다.
 *   `Σ 차익ᵢ × 추가율 = 총차익 × 추가율` 이므로 분기별/전체가 같은 값이다.
 *
 * ⇒ 종전에 「결합 규칙을 정한 명문이 없어 반영하지 않는다」고 고지만 하던 것을 계산으로 돌렸다.
 *
 * ## 임대분 비율을 분기별로 다시 뽑지 않는 근거
 *
 * 조특령 §97의3② 후단(법제처 실독): 「이 경우 「도시 및 주거환경정비법」에 따른 재개발사업ㆍ
 * 재건축사업 … 의 시행으로 임대할 수 없는 경우에는 해당 주택의 관리처분계획 인가일 **전
 * 6개월부터 준공일 후 6개월까지의 기간 동안 계속하여 임대한 것으로 보되**, 임대기간 계산
 * 시에는 실제 임대기간만 포함한다」 — 임대가 인가 전부터 준공 후까지 **이어진 것으로 본다**.
 * 따라서 령 §97의3⑤의 비율이 세 구간에 걸쳐 산정되는 것이 자연스럽다.
 *
 * ## §98의2는 반대다 — 결합 자체가 없다
 *
 * §98의2①의 대상인 「미분양주택」은 사업주체등이 **공급**했으나 분양되지 않은 주택인데,
 * 조합원 물량은 관리처분계획에 따라 **배정**되는 것이라 미분양주택이 될 수 없다.
 * ⇒ 자산종류 게이트가 ⑤·⑧에서 차단한다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import { case44RedevelopmentInfo } from "@/__tests__/tax-engine/transfer-tax/redevelopment/_helpers";
import { isReductionAllowedForAssetKind } from "@/lib/tax-engine/transfer-reductions";
import { usesTable2 } from "@/lib/tax-engine/redevelopment-lthd";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const rates = makeMockRates();
const D = (v: string) => new Date(v);

/** 10년 이상 계속 임대 — §97의3①1호 충족 (2013-01-01 ~ 2026-02-16 = 13년) */
const RENTAL_97_3_ELIGIBLE = {
  type: "rental_97_3" as const,
  registrationDate: D("2013-01-01"),
  rentalStartDate: D("2013-01-01"),
  isTaxRegistered: true,
  isNationalHousingScale: true,
  officialPriceAtStart: 300_000_000,
  region: "capital" as const,
  isPrivateConstructionRental: true,
  rentalContinuesToTransfer: true,
};

function redev(over: Partial<TransferTaxInput> = {}) {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "redevelopment_apt",
      transferPrice: 525_000_000,
      transferDate: D("2026-02-16T00:00:00"),
      acquisitionDate: D("2005-04-09T00:00:00"),
      acquisitionPrice: 0,
      expenses: 0,
      useEstimatedAcquisition: true,
      isOneHousehold: false,
      residencePeriodMonths: 0,
      standardPriceAtAcquisition: 200_000_000,
      standardPriceAtTransfer: 400_000_000,
      redevelopment: case44RedevelopmentInfo(),
      ...over,
    }),
    rates,
  );
}

describe("재개발 × §97의3 — 임대분 70% 대체", () => {
  const base = redev();
  const with973 = redev({
    reductions: [RENTAL_97_3_ELIGIBLE] as unknown as TransferTaxInput["reductions"],
  });

  it("R973-1: 대조군 — 특례 미선택 시 §166⑤ 3분기 공제 그대로", () => {
    expect(base.longTermHoldingDeduction).toBe(86_533_774);
    expect(base.determinedTax).toBe(55_836_614);
  });

  it("R973-2: 🔴 특례가 공제액을 키운다 (종전에는 고지만 하고 세액 무변동)", () => {
    expect(with973.longTermHoldingDeduction).toBe(144_222_954);
    expect(with973.determinedTax).toBe(34_163_037);
    expect(base.determinedTax - with973.determinedTax).toBe(21_673_577);
  });

  it("R973-3: 근거 echo — 임대분 비율·대체율이 결과에 실린다", () => {
    const d = with973.rental97LthdDetail as { overrideRate?: number; rentalGainRatio?: number };
    expect(d?.overrideRate).toBe(0.7);
    expect(d?.rentalGainRatio).toBe(0.5);
  });

  it("R973-4: 산식 검산 — 임대분 70% + 비임대분 분기별 율", () => {
    // 비임대분 비율이 1이면(ratio=0) 대조군과 같아야 한다 — 두 축이 곱해질 뿐임을 고정한다
    const blended = with973.longTermHoldingDeduction / with973.transferGain;
    const baseRate = base.longTermHoldingDeduction / base.transferGain;
    expect(blended).toBeGreaterThan(baseRate);
    expect(blended).toBeLessThanOrEqual(0.7);
  });

  it("R973-5: 계산 근거 step이 남는다", () => {
    expect(
      with973.steps.some(
        (s) => s.label === "장기보유특별공제 특례 — 장기일반민간임대주택 (조특법 §97의3①)",
      ),
    ).toBe(true);
  });

  it("R973-6: 🔑 요건 미충족(임대 10년 미만)은 공제를 바꾸지 않는다 (구별력)", () => {
    const short = redev({
      reductions: [
        { ...RENTAL_97_3_ELIGIBLE, registrationDate: D("2019-03-01"), rentalStartDate: D("2019-03-01") },
      ] as unknown as TransferTaxInput["reductions"],
    });
    expect(short.longTermHoldingDeduction).toBe(base.longTermHoldingDeduction);
    expect(short.determinedTax).toBe(base.determinedTax);
  });
});

describe("재개발 × §97의4 — 추가율 가산", () => {
  /**
   * 적격 조합 — 등록 2013-05-01(소령 §167의3①2호 가목 단서의 2018-03-31 상한 내) ·
   * 임대개시 2013-06-01 · 양도 2026-02-16(조특법 §97의4 시행 2014-01-01 이후) →
   * 임대 12년 → §97의4① 표의 「10년 이상 = 100분의 10」.
   *
   * ⚠️ 이 조합은 **CB-01이 해소된 뒤에야 만들 수 있다**. 종전에는 시한 게이트가
   *   `registrationDate >= 2014-01-01`이라 2013년 등록이 부당 배제됐다(축이 틀렸다 —
   *   법률 제12173호 부칙 §2③은 「양도하는 분부터」이므로 **양도일** 축이다).
   */
  const R974 = {
    type: "rental_97_4" as const,
    registrationDate: D("2013-05-01"),
    rentalStartDate: D("2013-06-01"),
    isTaxRegistered: true,
    rental974Category: "purchase_a" as const,
    officialPriceAtStart: 500_000_000,
    region: "capital" as const,
  };

  const base = redev();
  const with974 = redev({ reductions: [R974] as unknown as TransferTaxInput["reductions"] });

  it("R974-1: 표2 대상이면 가산하지 않는다 (§97의4① 단서 · §95② 단서)", () => {
    // 표2 판정은 단일 소스 `usesTable2`를 쓴다 — 술어를 복제하지 않는다
    expect(usesTable2(true, 2)).toBe(true);
    expect(usesTable2(true, 1)).toBe(false);
    expect(usesTable2(false, 10)).toBe(false);
  });

  it("R974-2: 🔴 추가율이 분기별 공제율에 가산된다 (종전에는 고지만 하고 세액 무변동)", () => {
    expect(with974.longTermHoldingDeduction).toBe(115_378_365);
    expect(with974.determinedTax).toBe(44_875_669);
    expect(base.determinedTax - with974.determinedTax).toBe(10_960_945);
  });

  it("R974-3: 🔑 **분기별 가산 = 전체 가산** — Σ 차익ᵢ × 추가율 = 총차익 × 추가율", () => {
    const added = with974.longTermHoldingDeduction - base.longTermHoldingDeduction;
    const whole = Math.floor(with974.transferGain * 0.1);
    // 분기별 floor 때문에 최대 분기 수(3)만큼의 원 단위 오차만 허용된다
    expect(Math.abs(added - whole)).toBeLessThanOrEqual(3);
  });

  it("R974-4: 근거 echo — 추가율 10%·임대 12년이 결과에 실린다", () => {
    const d = with974.rental97LthdDetail as {
      additionalRate?: number;
      eligibleRentalYears?: number;
      rentalGainRatio?: number;
    };
    expect(d?.additionalRate).toBe(0.1);
    expect(d?.eligibleRentalYears).toBe(12);
    // §97의4는 임대기간 안분 규정이 없다 — 전체 차익의 공제율에 가산한다
    expect(d?.rentalGainRatio).toBe(1);
  });

  it("R974-5: 계산 근거 step이 남는다", () => {
    expect(
      with974.steps.some(
        (s) => s.label === "장기보유특별공제 특례 — 장기임대주택 추가공제율 (조특법 §97의4①)",
      ),
    ).toBe(true);
  });

  /**
   * 🔑 보유 3년 미만 분기는 가산하지 않는다 — 정상 경로(`transfer-tax-lthd.ts`의 `if (rate > 0)`)와
   *   **같은 규약**이다. §95②은 보유 3년 이상부터 공제하므로 기본 공제율이 0인 분기에 추가율만
   *   얹으면 공제가 없던 자리에 공제가 생긴다.
   *
   * 인가일을 양도일 가까이 옮겨 **청산금 분기(인가일~양도일)를 3년 미만**으로 만든 격자다.
   * case44 원본은 세 분기가 전부 율 > 0이라 이 가드가 한 번도 발동하지 않는다 —
   * 뮤테이션(가드 제거)이 잡히지 않아 드러났다.
   */
  describe("R974-7 보유 3년 미만 분기 — 가산 억제", () => {
    const shortSettlement = (reductions?: unknown[]) =>
      redev({
        redevelopment: { ...case44RedevelopmentInfo(), approvalDate: D("2024-06-01") },
        ...(reductions ? { reductions: reductions as unknown as TransferTaxInput["reductions"] } : {}),
      });
    const b = shortSettlement();
    const w = shortSettlement([R974]);

    it("전제 — 청산금 분기의 공제율이 0이다 (인가 2024-06-01 → 양도 2026-02-16)", () => {
      const detail = b.redevelopmentDetail as unknown as Record<string, { lthdRate: number; gain: number }>;
      expect(detail.preApproval.lthdRate).toBeGreaterThan(0);
      expect(detail.postApprovalExistingHouse.lthdRate).toBeGreaterThan(0);
      expect(detail.settlement.lthdRate).toBe(0);
      expect(detail.settlement.gain).toBe(63_341_217);
    });

    it("🔴 그 분기만큼 가산이 빠진다 — 전체 10% 가산과 다르다", () => {
      const added = w.longTermHoldingDeduction - b.longTermHoldingDeduction;
      expect(added).toBe(22_510_470);
      // 전체에 10%를 얹었다면 28,844,591이었을 것 — 차이는 청산금 분기 63,341,217 × 10%
      expect(Math.floor(w.transferGain * 0.1) - added).toBe(6_334_121);
    });
  });

  it("R974-6: 🔑 구별력 — 등록이 2018.3.31 이후면 소령 단서로 배제된다 (세액 불변)", () => {
    const late = redev({
      reductions: [
        { ...R974, registrationDate: D("2018-06-01") },
      ] as unknown as TransferTaxInput["reductions"],
    });
    expect(late.longTermHoldingDeduction).toBe(base.longTermHoldingDeduction);
    expect(late.determinedTax).toBe(base.determinedTax);
  });
});

describe("§98의2 × 조합원 경로 — 자산종류 게이트", () => {
  it("G982-1: 🔴 재개발APT·입주권에서 §98의2가 차단된다 (미분양주택 정의상 성립 불가)", () => {
    expect(isReductionAllowedForAssetKind("unsold_98_2", "redevelopment_apt")).toBe(false);
    expect(isReductionAllowedForAssetKind("unsold_98_2", "right_to_move_in")).toBe(false);
  });

  it("G982-2: 대조군 — 주택·분양권에서는 그대로 허용된다", () => {
    expect(isReductionAllowedForAssetKind("unsold_98_2", "housing")).toBe(true);
    expect(isReductionAllowedForAssetKind("unsold_98_2", "presale_right")).toBe(true);
  });

  it("G982-3: 🔑 형제 조문은 막지 않는다 — §99는 조특령 §99①1호 단서가 재개발 변형을 명문화한다", () => {
    expect(isReductionAllowedForAssetKind("new_99", "redevelopment_apt")).toBe(true);
    expect(isReductionAllowedForAssetKind("new_99_3", "redevelopment_apt")).toBe(true);
    expect(isReductionAllowedForAssetKind("rental_97_3", "redevelopment_apt")).toBe(true);
  });
});

/**
 * ⑧·⑤ 계층 — 게이트가 **두 층에 모두** 닿는가.
 *
 * 🔴 D9-06과 같은 함정이 여기서도 있었다: 패널은 `isReductionCategoryAllowedForAssetKind`
 *   (**카테고리** 단위)만 보고 있어서, 조문 단위 게이트를 ⑧에만 넣으면 사용자는 선택은
 *   되는데 계산 실행 시점에야 차단당한다. 패널을 조문 단위 술어로 바꿔 두 층을 맞췄다.
 */
describe("§98의2 게이트 — ⑧ validate", () => {
  it("G982-4: 🔴 재개발APT 자산에서 §98의2 선택이 차단된다", async () => {
    const { validateStep2Reductions } = await import("@/lib/calc/transfer-tax-validate-reductions");
    const { getReductionDefault } = await import(
      "@/components/calc/transfer/UnifiedReductionPanel-defaults"
    );
    const { makeDefaultAsset } = await import("@/lib/stores/calc-wizard-store");
    const form = {
      assets: [
        {
          ...makeDefaultAsset(1),
          assetKind: "redevelopment_apt" as const,
          acquisitionDate: "2005-04-09",
          reductions: [getReductionDefault("unsold_98_2")],
        },
      ],
      transferDate: "2026-02-16",
    } as never;
    const issue = validateStep2Reductions(2, form);
    expect(issue).not.toBeNull();
  });

  it("G982-5: 대조군 — 주택 자산에서는 차단 사유가 자산종류가 아니다", async () => {
    const { validateStep2Reductions } = await import("@/lib/calc/transfer-tax-validate-reductions");
    const { getReductionDefault } = await import(
      "@/components/calc/transfer/UnifiedReductionPanel-defaults"
    );
    const { makeDefaultAsset } = await import("@/lib/stores/calc-wizard-store");
    const form = {
      assets: [
        {
          ...makeDefaultAsset(1),
          assetKind: "housing" as const,
          acquisitionDate: "2009-06-01",
          reductions: [getReductionDefault("unsold_98_2")],
        },
      ],
      transferDate: "2026-02-16",
    } as never;
    const issue = validateStep2Reductions(2, form);
    // 자산종류 게이트로는 막지 않는다 (다른 필수입력 사유는 있을 수 있다)
    expect(issue?.message ?? "").not.toContain("주택 양도에만");
  });
});
