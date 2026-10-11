/**
 * anchor — C1-03 (§89①4호 **나목** 경로 신설) + E3-03 (12억 안분 술어 분리).
 *
 * ## 조문 (법제처 실독 — 소득세법 [시행 2026-07-01] §89①4호)
 *
 * > 조합원입주권을 **1개** 보유한 1세대[…인가일… 현재 제3호가목에 해당하는 기존주택을 소유하는
 * > 세대]가 다음 각 목의 **어느 하나**의 요건을 충족하여 양도하는 경우 … 다만, 해당 조합원입주권의
 * > 양도 당시 실지거래가액이 **12억원을 초과**하는 경우에는 양도소득세를 과세한다.
 * > 가. 양도일 현재 다른 주택 또는 분양권을 보유하지 아니할 것
 * > 나. 양도일 현재 1조합원입주권 외에 **1주택**을 보유한 경우(분양권을 보유하지 아니하는 경우로
 * >     한정한다)로서 **해당 1주택을 취득한 날부터 3년 이내**에 해당 조합원입주권을 양도할 것
 *
 * ## 종전 결함 둘 (같은 조문의 요건을 서로 다른 두 값이 보고 있었다)
 *
 * | | 판정 근거 | 결과 |
 * |---|---|---|
 * | 전액 비과세 | 가목 4조건 | **나목 경로 전무** → 요건 충족자 전액 과세 (C1-03) |
 * | 12억 안분 | `isOneHouseSingle`(= 세대 주택수 1) | **요건 무검증** → 미충족자도 안분 (E3-03) |
 * | LTHD 표2 | `isOneHouseSingle` | (당시 기각) → **#14(2026-10-11)에서 같은 가·나목 술어로 모았다** — 아래 마지막 describe |
 *
 * ⇒ `resolveOneRightExemptionClause` 하나가 **비과세·안분·장특 표2 대상** 세 곳을 함께 가른다(표2의 거주 2년 요건만 별개).
 *
 * ## 실측 (mock 세율 · 입주권 권리가액 5억 · 인가 2018-10-23 · 청산금 납부 5천만 · 취득 2010-04-09)
 *
 * | 케이스 | 종전 | 수정 후 | Δ |
 * |---|---|---|---|
 * | 나목 충족 · 9억 | 198,627,000 | **0** | 198,627,000 과대 해소 |
 * | 주택1채 요건 미검증 · 15억 | 70,485,800 | **479,638,500** | 409,152,700 과소 해소 |
 * | (표2 축은 #14에서 가·나목 술어로 바뀌었다 — 아래 마지막 describe) | | | |
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";
import type { PresaleRight } from "@/lib/tax-engine/types/multi-house-surcharge.types";

const rates = makeMockRates();

function redevInfo(extra: Partial<RedevelopmentInfo> = {}): RedevelopmentInfo {
  return {
    subject: "right",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2018-10-23"),
    rightsValue: 500_000_000,
    settlementDirection: "pay",
    settlementAmount: 50_000_000,
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
    exemptionEligibleAtApproval: true,
    ...extra,
  };
}

function input(o: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "right_to_move_in",
    transferPrice: 900_000_000,
    transferDate: new Date("2024-06-01"),
    acquisitionDate: new Date("2010-04-09"),
    acquisitionPrice: 300_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: true,
    householdHousingCount: 0,
    householdRightCount: 1,
    residencePeriodMonths: 0,
    // 분양권 「없음」 확정 — 이 파일은 가·나목 클로즈 판정이 관심사다(2026-10-06, §4-6 남은 별건 3).
    // 분양권 보유 케이스(아래)는 `presaleRights`를 채워 이 값과 무관하게 목록으로 판정된다.
    householdNoPresaleRightsConfirmed: true,
    redevelopment: redevInfo(),
    ...o,
  });
}

/** 나목 충족 — 그 1주택을 2022-08-01 취득, 입주권은 2024-06-01 양도 (1년 10개월 < 3년) */
const NA_OK = { householdHousingCount: 1, redevelopment: redevInfo({ otherHouseAcquisitionDate: new Date("2022-08-01") }) };
/** 나목 초과 — 2020-01-01 취득 → 양도까지 4년 5개월 */
const NA_LATE = { householdHousingCount: 1, redevelopment: redevInfo({ otherHouseAcquisitionDate: new Date("2020-01-01") }) };

describe("C1-03 — §89①4호 나목 (1입주권 + 1주택 · 3년 이내)", () => {
  it("🔑 나목 충족 · 12억 이하 → 전액 비과세 (종전 198,627,000 전액 과세)", () => {
    const r = calculateTransferTax(input(NA_OK), rates);
    expect(r.redevelopmentDetail?.oneRightExemptionApplied).toBe(true);
    expect(r.redevelopmentDetail?.oneRightExemptionClause).toBe("na");
    expect(r.totalTax).toBe(0);
  });

  it("3년을 넘기면 나목 불성립 → 과세 198,627,000", () => {
    const r = calculateTransferTax(input(NA_LATE), rates);
    expect(r.redevelopmentDetail?.oneRightExemptionApplied).toBeUndefined();
    expect(r.totalTax).toBe(198_627_000);
  });

  it("「그 1주택 취득일」 미입력이면 3년 요건을 판정할 수 없다 → 나목 미적용 (과세)", () => {
    const r = calculateTransferTax(input({ householdHousingCount: 1 }), rates);
    expect(r.redevelopmentDetail?.oneRightExemptionClause).toBeUndefined();
    expect(r.totalTax).toBe(198_627_000);
  });

  it("나목도 분양권 미보유가 요건이다 — 분양권 보유 시 불성립", () => {
    const presale: PresaleRight = { id: "p", type: "presale_right", acquisitionDate: new Date("2022-01-01"), region: "capital" };
    // E-3 후속 — 분양권 요건은 2022.1.1. 이후 인가(취득) 입주권에만 걸린다(법률 제18578호 부칙 제7조②).
    //   이 파일의 기본 인가일(2018-10-23)로는 게이트를 시험할 수 없어 이 케이스만 인가일을 옮긴다.
    const naOk2022 = {
      householdHousingCount: 1,
      redevelopment: redevInfo({ approvalDate: new Date("2022-01-01"), otherHouseAcquisitionDate: new Date("2022-08-01") }),
    };
    const r = calculateTransferTax(input({ ...naOk2022, presaleRights: [presale] }), rates);
    expect(r.redevelopmentDetail?.oneRightExemptionClause).toBeUndefined();
    // 인가일이 §166 3분할 경계라 과세액이 기본 fixture(198,627,000)와 다르다 — 실측값.
    expect(r.totalTax).toBe(193_083_000);
    // 긍정 짝 — 같은 사실에서 분양권만 빼면 나목 성립(게이트가 분양권 하나로 갈린다).
    const clean = calculateTransferTax(input(naOk2022), rates);
    expect(clean.redevelopmentDetail?.oneRightExemptionClause).toBe("na");
    expect(clean.totalTax).toBe(0);
  });

  it("가목은 그대로 — 주택 0채는 clause \"ga\"로 전액 비과세 (회귀 가드)", () => {
    const r = calculateTransferTax(input(), rates);
    expect(r.redevelopmentDetail?.oneRightExemptionClause).toBe("ga");
    expect(r.totalTax).toBe(0);
  });

  it("세대 주택 2채는 어느 목도 성립하지 않는다", () => {
    const r = calculateTransferTax(input({ householdHousingCount: 2 }), rates);
    expect(r.redevelopmentDetail?.oneRightExemptionClause).toBeUndefined();
  });
});

describe("E3-03 — 12억 안분은 §89①4호 요건을 충족할 때만", () => {
  it("🔑 주택 1채 · 요건 미검증 · 15억 → 안분 없음 (종전 70,485,800 → 479,638,500)", () => {
    const r = calculateTransferTax(input({ householdHousingCount: 1, transferPrice: 1_500_000_000 }), rates);
    expect(r.redevelopmentDetail?.highValueAllocation).toBeUndefined();
    expect(r.redevelopmentDetail?.oneRightHighValueApplied).toBeUndefined();
    expect(r.totalTax).toBe(479_638_500);
  });

  it("나목 충족 · 15억 → §89①4호 각 목 외의 부분 단서 안분 (70,485,800)", () => {
    const r = calculateTransferTax(input({ ...NA_OK, transferPrice: 1_500_000_000 }), rates);
    expect(r.redevelopmentDetail?.oneRightHighValueApplied).toBe(true);
    expect(r.redevelopmentDetail?.oneRightExemptionClause).toBe("na");
    expect(r.totalTax).toBe(70_485_800);
  });

  it("가목 충족 · 15억 → 종전과 동일 (회귀 가드)", () => {
    const r = calculateTransferTax(input({ transferPrice: 1_500_000_000 }), rates);
    expect(r.redevelopmentDetail?.oneRightHighValueApplied).toBe(true);
    expect(r.totalTax).toBe(70_485_800);
  });

  it("세대 주택 2채 · 15억 → 안분 없음 (종전과 동일)", () => {
    const r = calculateTransferTax(input({ householdHousingCount: 2, transferPrice: 1_500_000_000 }), rates);
    expect(r.totalTax).toBe(479_638_500);
  });
});

/**
 * #14(G3-7) — **LTHD 표2는 §89①4호 가·나목 성립 + 거주 2년이다** (종전 E3-03 기각 해석을 뒤집었다).
 *
 * 종전 이 자리는 「표2는 §89①4호와 술어를 공유하지 않는다 — 표2는 양도일 현재 세대 주택 수 1 + 거주 2년」이라고 적었다.
 * 그 독법은 입주권 외 다른 주택이 **정확히 1채**일 때만 표2를 줬다:
 *   · 다른 주택이 없는 가목 고가 입주권 → 표1 (과대과세)
 *   · 나목 기한이 지났거나 요건을 선언하지 않은 입주권 + 다른 주택 1채 → 표2 (「모르는데 혜택」)
 * 국세청 회신(재산세과-1078 · 부동산거래관리과-1046 · 서면법규과-501 · 사전-2018-법령해석재산-0017 · 사전-2023-법규재산-0141)과
 * 심판례(조심2011서1530 · 조심2022중7305)는 모두 「입주권이 1세대1주택으로 보는 요건(가·나목)을 갖추면 표2, 못 갖추면 표1」이다
 * (§95② 단서는 양도하는 그 자산이 1세대1주택일 때 표2를 준다). 사용자 결정 #14(2026-10-11) A로 비과세와 표2를 같은 판정 하나로 모았다.
 *
 * 표2의 거주 2년 요건(영 §159의4)은 별개 축으로 그대로다.
 */
describe("#14 — LTHD 표2는 §89①4호 가·나목 성립 + 거주 2년", () => {
  it("🔑 주택 1채 + 거주 60개월이지만 나목 불성립(취득일 미입력) → 표1 (0.16) — 종전 표2(0.52)", () => {
    const r = calculateTransferTax(input({ householdHousingCount: 1, residencePeriodMonths: 60 }), rates);
    expect(r.redevelopmentDetail?.oneRightExemptionClause).toBeUndefined(); // 나목 미충족
    expect(r.redevelopmentDetail?.preApproval.lthdRate).toBe(0.16);
  });

  it("🔑 주택 1채 + 나목 기한 경과(4년 5개월) + 거주 60개월 → 표1 (0.16) — 요건 불성립은 다른 주택 1채여도 표1", () => {
    const r = calculateTransferTax(input({ ...NA_LATE, residencePeriodMonths: 60 }), rates);
    expect(r.redevelopmentDetail?.oneRightExemptionClause).toBeUndefined();
    expect(r.redevelopmentDetail?.preApproval.lthdRate).toBe(0.16);
  });

  it("🔑 주택 0채(가목 충족) + 거주 60개월 · 15억 → 표2 (0.52) — 종전 표1(0.16)", () => {
    const r = calculateTransferTax(input({ transferPrice: 1_500_000_000, residencePeriodMonths: 60 }), rates);
    expect(r.redevelopmentDetail?.oneRightExemptionClause).toBe("ga");
    expect(r.redevelopmentDetail?.preApproval.lthdRate).toBe(0.52);
  });

  it("긍정 짝 — 가목 + 거주 12개월(2년 미만)이면 표1 (거주 2년 요건은 그대로)", () => {
    const r = calculateTransferTax(input({ transferPrice: 1_500_000_000, residencePeriodMonths: 12 }), rates);
    expect(r.redevelopmentDetail?.oneRightExemptionClause).toBe("ga");
    expect(r.redevelopmentDetail?.preApproval.lthdRate).toBe(0.16);
  });

  it("나목 충족 · 거주 60개월 · 15억 → 표2 (0.52) · 안분 동시 적용", () => {
    const r = calculateTransferTax(
      input({ ...NA_OK, residencePeriodMonths: 60, transferPrice: 1_500_000_000 }),
      rates,
    );
    expect(r.redevelopmentDetail?.preApproval.lthdRate).toBe(0.52);
    expect(r.redevelopmentDetail?.oneRightHighValueApplied).toBe(true);
    expect(r.totalTax).toBe(64_466_600);
  });

  it("세대 주택 2채 · 거주 60개월 → 표1 (§159의4 「1주택」 아님)", () => {
    const r = calculateTransferTax(input({ householdHousingCount: 2, residencePeriodMonths: 60 }), rates);
    expect(r.redevelopmentDetail?.preApproval.lthdRate).toBe(0.16);
    expect(r.totalTax).toBe(198_627_000);
  });
});
