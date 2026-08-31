/**
 * anchor — legacy 신축 매처가 §99 정본 경로와 이중 적용되지 않는다 (D3-03)
 *
 * `new-housing-reduction.ts`의 legacy 매처는 §99·§99의3까지 「산출세액 × **일수비율**」
 * **세액감면**으로 계산한다. 그러나 두 조문의 정본은 **소득차감형**(소득세법 §90② —
 * 조특령 §99①·§99의3② **기준시가 안분**)이고, `transfer-reductions/new-99.ts`·`new-99-3.ts`가
 * 이미 구현하고 있다(고가주택 단서·농특세 2-pass 포함).
 *
 * `reductions[]`에 정본 조문이 선택돼 있는데 legacy 후보까지 밀면 차감형과 세액감면형이
 * **동시 적용**돼 §127⑦을 우회한다 — D10-01과 같은 결함 클래스다.
 *
 * ⚠️ `newHousingDetails`는 `reductions[]` **밖의 별도 파라미터**라 ⑧ validate의 트랙 교차
 *    차단이 보지 못한다. 그래서 엔진에서 막는다.
 *
 * 도달성: ⑤ 클라이언트에 `newHousingDetails` 생성처가 **0건**이고(⑫ Zod·⑭ route만 열림)
 * direct-API POST로만 도달하는 latent 경로다 — 그래도 이중 혜택은 막아야 한다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";
import type { TaxRateKey } from "@/lib/tax-engine/types";

const D = (s: string) => new Date(`${s}T00:00:00`);

/**
 * ⚠️ `makeMockRates()` 기본값에는 `new_housing_matrix`가 **없다** — 그대로 쓰면 legacy 매처가
 *    아무 조문도 잡지 못해(`isEligible=false`) 이 anchor가 **구별력 0**이 된다(실측 확인).
 *    mock 선택이 게이트 도달을 가르는 사례라 매트릭스를 명시 주입한다.
 */
const NEW_HOUSING_MATRIX_MOCK = {
  "transfer:deduction:new_housing_matrix": {
    taxType: "transfer",
    category: "deduction",
    subCategory: "new_housing_matrix",
    rateTable: null,
    deductionRules: {
      type: "new_housing_matrix",
      articles: [
        {
          code: "99-main",
          article: "§99 (IMF 1차)",
          acquisitionPeriod: { start: "1998-05-22", end: "2001-12-31" },
          region: "nationwide",
          maxAcquisitionPrice: null,
          maxArea: null,
          requiresFirstSale: false,
          requiresUnsoldCertificate: false,
          reductionScope: "capital_gain",
          reductionRate: 1.0,
          fiveYearWindowRule: true,
          isExcludedFromHouseCount: true,
          isExcludedFromMultiHouseSurcharge: true,
        },
      ],
    },
    specialRules: null,
    effectiveDate: "1998-05-22",
    isActive: true,
  },
};

const rates = makeMockRates(NEW_HOUSING_MATRIX_MOCK as Partial<Record<TaxRateKey, object>>);

/** §99 신축주택취득기간 내 취득 — legacy 매처 `99-main`이 잡는 조합 */
const legacyDetails = {
  acquisitionDate: D("1999-03-01"),
  transferDate: D("2010-06-30"),
  region: "nationwide" as const,
  acquisitionPrice: 200_000_000,
  exclusiveAreaSquareMeters: 84,
  isFirstSale: true,
  hasUnsoldCertificate: false,
  totalCapitalGain: 400_000_000,
  calculatedTax: 0, // calcReductions가 덮어쓴다
};

const base = {
  transferPrice: 800_000_000,
  transferDate: D("2010-06-30"),
  acquisitionPrice: 200_000_000,
  acquisitionDate: D("1999-03-01"),
  isOneHousehold: false,
  householdHousingCount: 2,
};

describe("legacy 신축 매처 × §99 정본 트랙 교차", () => {
  it("정본 §99가 선택돼 있으면 legacy 세액감면 후보를 밀지 않는다", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        ...base,
        newHousingDetails: legacyDetails,
        reductions: [
          {
            type: "new_99",
            contractDate99: D("1999-02-01"),
            standardPriceAtAcquisition99: 100_000_000,
            standardPriceAt5Years99: 150_000_000,
            standardPriceAtTransfer99: 300_000_000,
            exclusiveAreaSqm99: 84,
            isResident99: true,
            isHousingConstructionBusiness99: false,
            acquisitionType99: "from_builder",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
        ],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
      rates,
    );
    // legacy 세액감면이 채택되면 안 된다 — 정본은 소득차감형이라 reductionTypeApplied가 비거나 다른 값
    expect(r.reductionTypeApplied).not.toBe("new_housing");
  });

  it("대조군 — 정본 조문이 선택돼 있지 않으면 legacy 경로는 그대로 동작한다", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        ...base,
        newHousingDetails: legacyDetails,
        reductions: [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
      rates,
    );
    // 종전 동작 보존 — 이 anchor는 legacy 제거가 아니라 «교차 배제»만 고정한다.
    expect(r.newHousingReductionDetail).toBeDefined();
  });

  it("대조군 — 세액감면형 조문(§77)과 함께면 legacy는 §127⑦ max 안에서 경쟁한다", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        ...base,
        newHousingDetails: legacyDetails,
        reductions: [
          {
            type: "public_expropriation",
            businessApprovalDate: D("2009-01-01"),
            cashCompensation: 800_000_000,
            bondCompensation: 0,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
        ],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
      rates,
    );
    // 두 후보 모두 세액감면 트랙 → max 택일. 배제되지 않는다.
    expect(r.newHousingReductionDetail).toBeDefined();
  });
});
