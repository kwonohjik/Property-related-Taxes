/**
 * anchor — §99·§99의3 고가주택 기준일이 «기간 게이트와 같은 축»을 쓴다 (D3-09)
 *
 * 결함: 같은 함수 안에서 **두 판정이 다른 축**을 썼다.
 * - 기간 게이트: `acquisitionType === "from_builder" ? 매매계약일 : 사용승인일` — 취득유형 분기 ✅
 * - 고가주택 기준일: `contractDate ?? usageApprovalDate ?? acquisitionDate` — **분기 없음** ❌
 *   (`new-99-3.ts:280` · `new-99.ts:201` 두 곳에 같은 식이 복제돼 있었다)
 *
 * §99①·§99의3①은 1호가 **매매계약 체결·계약금 납부일**, 2호가 **사용승인·사용검사일**을
 * 기준일로 삼는다. 고가주택 단서도 같은 조항의 단서이므로 같은 기준일을 써야 한다.
 *
 * 도달성: `contractDate993`에는 전용 위젯이 없고 `income-deduction-router.ts:194`가
 * **자산-수준 `assetContractDate`** 로 공급하는데, 그 위젯은 `acquisitionType`과 무관하게
 * 항상 렌더된다. 따라서 `self_built`(사용승인일 필수) + 매매계약일 입력 조합이 실재하고,
 * Zod·route mapper 어디에도 상호배타 정규화가 없다.
 *
 * 세액 영향: 기준일이 갈리면 고가주택 임계(면적 165/149㎡ · 가액 6억/9억/12억)가 달라져
 * 배제 여부가 통째로 뒤집힌다 — 감면 전액 ↔ 0.
 *
 * 주석 드리프트도 함께 정정했다 — docblock은 「가장 빠른 시점」이라 했으나 최솟값 연산은
 * 어디에도 없었다(`new-99.ts:200` 주석은 「우선일」로 구현과 일치해 서로도 어긋나 있었다).
 */
import { describe, it, expect } from "vitest";
import { evaluateNew993 } from "@/lib/tax-engine/transfer-reductions/new-99-3";

const D = (s: string) => new Date(`${s}T00:00:00`);

/**
 * 두 축이 갈리는 격자:
 * - 매매계약일 2002-09-01 → 「165㎡ 이상 AND 6억 초과」 → 100㎡라 고가주택 **아님**
 * - 사용승인일 2003-02-01 → 「6억 초과」(면적 무관) → 7억이라 고가주택 **맞음**
 */
const BASE = {
  transferDate: D("2010-06-30"),
  acquisitionDate: D("2003-03-01"),
  transferIncome: 300_000_000,
  standardPriceAtAcquisition: 200_000_000,
  standardPriceAt5Years: 250_000_000,
  standardPriceAtTransfer: 400_000_000,
  wholePropertyTransferPrice: 700_000_000,
  exclusiveAreaSqm: 100,
  region: "outside_speculation" as const,
  isResident: true,
  isHousingConstructionBusiness: false,
  calculatedTaxBeforeReduction: 100_000_000,
  calculatedTaxAfterReduction: 0,
};

describe("§99의3 고가주택 기준일 축", () => {
  it("2호(자기건설)는 사용승인일을 기준으로 판정한다 — 매매계약일이 함께 있어도", () => {
    const r = evaluateNew993({
      ...BASE,
      acquisitionType: "self_built",
      usageApprovalDate: D("2003-02-01"),
      contractDate: D("2002-09-01"), // 자산-수준 assetContractDate로 흘러들어오는 값
    });
    // 사용승인일 축 → 6억 초과라 고가주택 → 배제
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons?.map((x) => x.code)).toContain("HIGH_VALUE_HOUSE");
  });

  it("1호(주택건설사업자 취득)는 매매계약일을 기준으로 판정한다", () => {
    const r = evaluateNew993({
      ...BASE,
      acquisitionType: "from_builder",
      contractDate: D("2002-09-01"),
      usageApprovalDate: D("2003-02-01"),
    });
    // 매매계약일 축(2002-09-01) → 165㎡ 미만이라 고가주택 아님 → 적용
    expect(r.isEligible).toBe(true);
  });

  it("대조군 — 2호에 매매계약일이 없으면 결과가 같다(축 분기가 정상 경로를 바꾸지 않는다)", () => {
    const withContract = evaluateNew993({
      ...BASE,
      acquisitionType: "self_built",
      usageApprovalDate: D("2003-02-01"),
      contractDate: D("2002-09-01"),
    });
    const withoutContract = evaluateNew993({
      ...BASE,
      acquisitionType: "self_built",
      usageApprovalDate: D("2003-02-01"),
    });
    expect(withContract.isEligible).toBe(withoutContract.isEligible);
    expect(withContract.reducibleTransferIncome).toBe(withoutContract.reducibleTransferIncome);
  });

  it("대조군 — 1호에 사용승인일이 없어도 결과가 같다", () => {
    const withApproval = evaluateNew993({
      ...BASE,
      acquisitionType: "from_builder",
      contractDate: D("2002-09-01"),
      usageApprovalDate: D("2003-02-01"),
    });
    const withoutApproval = evaluateNew993({
      ...BASE,
      acquisitionType: "from_builder",
      contractDate: D("2002-09-01"),
    });
    expect(withApproval.isEligible).toBe(withoutApproval.isEligible);
  });
});
