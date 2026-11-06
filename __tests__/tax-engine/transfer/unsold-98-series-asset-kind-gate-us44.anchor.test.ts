// US-44 anchor — §98·§98의2·§98의3·§98의5·§98의6·§98의7 자산 종류 게이트 (사용자 결정 2026-11-06 Q-4 「모두 막는다」)
//
// 대상은 「사업주체(등)와 최초로 매매계약을 체결하고 취득」한 미분양주택의 양도다.
//   - 재개발APT·조합원입주권: 조합원 몫은 관리처분계획에 따라 배정·승계된 것이라 미분양주택이 아니다.
//   - 분양권: 「미분양주택을 … 양도」가 아니라 소득세법 §94①2호가목 권리의 양도다.
// 종전에는 §98의2만 조합원 경로에서 막히고 나머지는 네 자산 모두 열려 있어, 엔진이 감면·세율 특칙을
// 그대로 적용했다(리뷰 실측 R1 130,941,000 · R2 234,641,000 과소 과세).
//
// 함께 고친 것: §98의7 「취득일 < 최초 매매계약일」 모순 입력이 적격으로 통과하던 문제(US-44 E4).
// 근거: docs/reviews/unsold-98-series-review-2026-11.md US-44 · §3 Q-4.
import { describe, it, expect } from "vitest";
import {
  isReductionAllowedForAssetKind,
  assetKindGateReason,
  type ReductionAssetKind,
} from "@/lib/tax-engine/transfer-reductions";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { case44RedevelopmentInfo } from "@/__tests__/tax-engine/transfer-tax/redevelopment/_helpers";

const rates = makeMockRates();
const GATED = ["unsold_98", "unsold_98_2", "unsold_98_3", "unsold_98_5", "unsold_98_6", "unsold_98_7"] as const;
const BLOCKED_KINDS: ReductionAssetKind[] = ["redevelopment_apt", "right_to_move_in", "presale_right"];

const UNSOLD_985 = {
  type: "unsold_98_5" as const,
  contractDate985: new Date("2010-06-15"),
  priceReductionRatePct985: 15,
  isNonCapitalUnsoldAtCutoff985: true,
  isFirstContract985: true,
  isNotOccupiedAtContract985: true,
  isNotRecontract985: true,
  standardPriceAtAcquisition985: 200_000_000,
  standardPriceAt5Years985: 300_000_000,
  standardPriceAtTransfer985: 400_000_000,
};

const UNSOLD_987 = {
  type: "unsold_98_7" as const,
  contractDate987: new Date("2012-10-15"),
  acquisitionPrice987: 550_000_000,
  isUnsoldAtCutoff987: true,
  isFirstContract987: true,
  isNotOccupiedAtContract987: true,
  isNotRecontract987: true,
  standardPriceAtAcquisition987: 200_000_000,
  standardPriceAt5Years987: 300_000_000,
  standardPriceAtTransfer987: 400_000_000,
};

type Reductions = TransferTaxInput["reductions"];

describe("US-44 게이트 행렬 — ⑤⑧ 공용 술어", () => {
  it("G-1: 🔴 6조문 × 재개발APT·조합원입주권·분양권은 차단, 주택은 허용", () => {
    for (const id of GATED) {
      expect(isReductionAllowedForAssetKind(id, "housing")).toBe(true);
      for (const kind of BLOCKED_KINDS) expect(isReductionAllowedForAssetKind(id, kind)).toBe(false);
    }
  });

  it("G-2: 범위 밖 조문(§98의4·§98의8·§99의2·§99)은 카테고리 게이트 그대로 — 결정 범위를 넘지 않는다", () => {
    for (const id of ["unsold_98_4", "unsold_98_8", "unsold_99_2", "new_99"]) {
      expect(isReductionAllowedForAssetKind(id, "presale_right")).toBe(true);
      expect(isReductionAllowedForAssetKind(id, "redevelopment_apt")).toBe(true);
    }
  });

  it("G-4: 토지·건물 등 비주택은 조문 사유가 아니라 카테고리 사유(「주택 양도에만」)를 쓴다", () => {
    for (const kind of ["land", "building", "general_building", "commercial_building"]) {
      expect(isReductionAllowedForAssetKind("unsold_98_3", kind as ReductionAssetKind)).toBe(false);
      expect(assetKindGateReason("unsold_98_3", kind)).toBeUndefined();
    }
  });

  it("G-5: 조문마다 대상 문언이 다르다 — §98 「최초로 분양받은」 · §98의2 「선착순」 · §98의7 「그 계약에 따라 취득」", () => {
    expect(assetKindGateReason("unsold_98", "presale_right")).toContain("주택건설사업자로부터 최초로 분양받은");
    expect(assetKindGateReason("unsold_98_2", "presale_right")).toContain("선착순 공급분");
    expect(assetKindGateReason("unsold_98_7", "presale_right")).toContain("그 계약에 따라 취득");
  });

  it("G-3: 사유 문구 — 조문 라벨 · 자산별 이유 · 재건축 원조합원 별도 확인 안내", () => {
    const presale = assetKindGateReason("unsold_98_5", "presale_right");
    expect(presale).toContain("§98의5");
    expect(presale).toContain("소득세법 §94①2호가목");
    expect(presale).toContain("별도 확인이 필요합니다");
    const redev = assetKindGateReason("unsold_98_7", "redevelopment_apt");
    expect(redev).toContain("관리처분계획");
    expect(assetKindGateReason("unsold_98_7", "housing")).toBeUndefined();
    expect(assetKindGateReason("new_99", "presale_right")).toBeUndefined();
  });
});

describe("US-44 엔진 진입 방어 — ⑤⑧을 거치지 않은 입력", () => {
  function presale985(reductions: Reductions) {
    return calculateTransferTax(
      baseTransferInput({
        propertyType: "presale_right",
        transferPrice: 800_000_000,
        acquisitionPrice: 500_000_000,
        acquisitionDate: new Date("2011-06-15"),
        transferDate: new Date("2016-01-01"),
        householdHousingCount: 2,
        reductions,
      }),
      rates,
    );
  }

  it("E-1: 🔴 분양권 + §98의5 — 감면을 걷어 내고 미선택과 세액이 같다 + 고지", () => {
    const withRed = presale985([UNSOLD_985] as Reductions);
    const none = presale985([]);
    expect(withRed.unsold985Detail).toBeUndefined();
    expect(withRed.reductionAmount).toBe(0);
    expect(withRed.totalTax).toBe(none.totalTax);
    expect(withRed.warnings?.some((w) => w.includes("§98의5") && w.includes("이 계산에 반영하지 않았습니다"))).toBe(true);
  });

  it("E-2: 대조군 — 같은 사실의 주택은 §98의5 80% 감면이 그대로 적용된다 (P3-8)", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        transferPrice: 800_000_000,
        acquisitionPrice: 500_000_000,
        acquisitionDate: new Date("2011-06-15"),
        transferDate: new Date("2016-01-01"),
        householdHousingCount: 2,
        reductions: [UNSOLD_985] as Reductions,
      }),
      rates,
    );
    expect(r.reductionAmount).toBe(67_192_000);
    expect(r.totalTax).toBe(18_477_800);
    expect((r.warnings ?? []).some((w) => w.includes("이 계산에 반영하지 않았습니다"))).toBe(false);
  });

  it("E-3: 🔴 재개발APT + §98의7 — 감면을 걷어 내고 미선택과 세액이 같다 + 고지", () => {
    const redev = (reductions: Reductions) =>
      calculateTransferTax(
        baseTransferInput({
          propertyType: "redevelopment_apt",
          transferPrice: 525_000_000,
          transferDate: new Date("2026-02-16T00:00:00"),
          acquisitionDate: new Date("2005-04-09T00:00:00"),
          acquisitionPrice: 0,
          expenses: 0,
          useEstimatedAcquisition: true,
          isOneHousehold: false,
          residencePeriodMonths: 0,
          householdHousingCount: 2,
          redevelopment: case44RedevelopmentInfo(),
          reductions,
        }),
        rates,
      );
    const withRed = redev([UNSOLD_987] as Reductions);
    const none = redev([]);
    expect(withRed.unsold987Detail).toBeUndefined();
    expect(withRed.totalTax).toBe(none.totalTax);
    expect(withRed.warnings?.some((w) => w.includes("§98의7") && w.includes("관리처분계획"))).toBe(true);
  });
});

/**
 * 3주택 조정지역 재개발APT — 걷어 내지 않으면 §98의7 5년 후 차감이 붙어 세액이 103,912,574로 떨어진다
 * (뮤테이션 실측: strip을 끄면 191,953,545 → 103,912,574). 취득일은 계약 뒤(2013.1.15)로 둬 §98의7 날짜 가드에 먼저 걸리지 않게 한다.
 * ⚠ 이 경로에서는 수정 전에도 §98의7 선택이 중과(30%p)를 끄지 않았다 — 감면주택 중과 배제(STEP 0.45) 소거 자체는 이 anchor로
 *   입증되지 않는다(구조상 strip이 STEP 0.45보다 먼저다 — `transfer-tax.ts` 진입부).
 */
describe("US-44 엔진 방어 — 3주택 조정지역 재개발APT", () => {
  const redev3 = (reductions: Reductions) =>
    calculateTransferTax(
      baseTransferInput({
        propertyType: "redevelopment_apt",
        transferPrice: 525_000_000,
        transferDate: new Date("2026-06-01T00:00:00"),
        acquisitionDate: new Date("2013-01-15T00:00:00"),
        acquisitionPrice: 0,
        expenses: 0,
        useEstimatedAcquisition: true,
        residencePeriodMonths: 0,
        householdHousingCount: 3,
        isRegulatedArea: true,
        isOneHousehold: false,
        redevelopment: case44RedevelopmentInfo(),
        reductions,
      }),
      rates,
    );

  it("E-4: 🔴 재개발APT 3주택 조정지역 + §98의7 — 중과·세액이 감면 미선택과 같다", () => {
    const none = redev3([]);
    const withRed = redev3([UNSOLD_987] as Reductions);
    expect(none.surchargeType).toBe("multi_house_3plus");
    expect(withRed.surchargeType).toBe(none.surchargeType);
    expect(withRed.surchargeRate).toBe(none.surchargeRate);
    expect(withRed.totalTax).toBe(none.totalTax);
  });

  it("E-5: 같은 감면을 두 번 담아도 고지는 한 줄이다", () => {
    const r = redev3([UNSOLD_987, UNSOLD_987] as Reductions);
    expect((r.warnings ?? []).filter((w) => w.includes("§98의7") && w.includes("이 계산에 반영하지 않았습니다"))).toHaveLength(1);
  });
});

describe("US-44 E4 — §98의7 취득일이 최초 매매계약일보다 앞서면 부적격", () => {
  const housing987 = (acquisitionDate: Date, reductions: Reductions) =>
    calculateTransferTax(
      baseTransferInput({
        transferPrice: 800_000_000,
        acquisitionPrice: 500_000_000,
        acquisitionDate,
        transferDate: new Date("2022-08-01"),
        householdHousingCount: 2,
        reductions,
      }),
      rates,
    );

  it("D-1: 🔴 2005 취득 · 2012.10.15 계약 → ACQUIRED_BEFORE_CONTRACT, 미선택과 세액이 같다", () => {
    const r = housing987(new Date("2005-04-09"), [UNSOLD_987] as Reductions);
    expect(r.unsold987Detail?.isEligible).toBe(false);
    expect(r.unsold987Detail?.ineligibleReasons.map((x) => x.code)).toContain("ACQUIRED_BEFORE_CONTRACT");
    expect(r.totalTax).toBe(housing987(new Date("2005-04-09"), []).totalTax);
  });

  it("D-2: 대조군 — 계약 뒤 취득(2013.1.15)은 적격 (CH-2 값 불변)", () => {
    const r = housing987(new Date("2013-01-15"), [UNSOLD_987] as Reductions);
    expect(r.unsold987Detail?.isEligible).toBe(true);
    expect(r.totalTax).toBe(38_579_500);
  });

  it("D-3: 경계 — 계약일과 같은 날 취득은 적격", () => {
    const r = housing987(new Date("2012-10-15"), [UNSOLD_987] as Reductions);
    expect(r.unsold987Detail?.ineligibleReasons.map((x) => x.code) ?? []).not.toContain("ACQUIRED_BEFORE_CONTRACT");
  });
});

describe("US-44 ⑧ validate — 엔진 고지와 같은 사유 문구", () => {
  it("V-2: 토지 자산에 남은 §98의3 선택은 종전대로 「주택 양도에만」 사유로 막힌다", async () => {
    const { validateStep2Reductions } = await import("@/lib/calc/transfer-tax-validate-reductions");
    const { getReductionDefault } = await import("@/components/calc/transfer/UnifiedReductionPanel-defaults");
    const { makeDefaultAsset } = await import("@/lib/stores/calc-wizard-store");
    const form = {
      assets: [{ ...makeDefaultAsset(1), assetKind: "land" as const, acquisitionDate: "2009-06-01", reductions: [getReductionDefault("unsold_98_3")] }],
      transferDate: "2026-02-16",
    } as never;
    expect(validateStep2Reductions(2, form)?.message).toContain("주택 양도에만");
  });

  it("V-1: 🔴 분양권 자산의 §98의3 선택은 「미분양주택」 사유로 차단된다 (「주택 양도에만」 아님)", async () => {
    const { validateStep2Reductions } = await import("@/lib/calc/transfer-tax-validate-reductions");
    const { getReductionDefault } = await import("@/components/calc/transfer/UnifiedReductionPanel-defaults");
    const { makeDefaultAsset } = await import("@/lib/stores/calc-wizard-store");
    const form = {
      assets: [
        {
          ...makeDefaultAsset(1),
          assetKind: "presale_right" as const,
          acquisitionDate: "2009-06-01",
          reductions: [getReductionDefault("unsold_98_3")],
        },
      ],
      transferDate: "2026-02-16",
    } as never;
    const issue = validateStep2Reductions(2, form);
    expect(issue?.message).toContain("§98의3");
    expect(issue?.message).toContain("미분양주택");
    expect(issue?.message).not.toContain("주택 양도에만");
  });
});
