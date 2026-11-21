/**
 * 양도소득세 결과뷰 리뷰(2026-11-21) MINOR 묶음 n6 — c09·c11 청크 표시 anchor (세액 불변 · 표시만).
 *
 * | R-id | 수정 전 실측 |
 * |---|---|
 * | R-c09-03 | 원조합원 입주권 · 청산금 방향 미선택(팩토리 기본값 "") — `?? "pay"`가 ""를 통과시켜 §95② 안내 카드가 빠짐 (pay는 표시) |
 * | R-c09-04 | 종부세 특례 신청기간 「9월 16일~30일」의 근거를 조특령 §98의8④로 적음(기간은 법 §98의9③) · ④ 단서(신청 생략) 누락 |
 * | R-c09-05 | §77 고시 2016-06-01 · 양도 2017-06-01 → current_2018(현금 10%)인데 라벨 「2018 감면율 (2018.1.1.~2024.12.31. 양도 …)」 |
 * | R-c09-06 | §97②2호 단서 swap 건물 파트 — 개산공제 0 옆에 「취득시 기준시가 50,000,000 × 3%」 |
 * | R-c11-03 | §97 본문·단서·§97의2 ⑲ 근거 문구가 「임대기간 분 안분」(엔진 rentalGainRatio = 1 · 전액) |
 */
import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { PublicExpropriationDetailCard } from "@/components/calc/results/transfer/TransferReductionRows";
import { SplitGainDetailSection } from "@/components/calc/results/transfer/SplitGainDetailSection";
import { SingleDetailCards } from "@/components/calc/results/transfer/SingleDetailCards";
import { Unsold989DetailCard } from "@/components/calc/results/transfer/Unsold989DetailCard";
import { eligibleIncomeBasisText } from "@/components/calc/results/transfer/reduction-eligible-income";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";

afterEach(cleanup);
const rates = makeMockRates();
const D = (s: string) => new Date(s);

describe("R-c09-03 재개발 청산금 방향 — 빈 문자열은 납부(pay)로 본다", () => {
  const result = calculateTransferTax(
    baseTransferInput({
      propertyType: "right_to_move_in", transferPrice: 520_000_000, transferDate: D("2023-03-02"), acquisitionDate: D("2002-04-09"),
      acquisitionPrice: 100_000_000, expenses: 0, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0,
      redevelopment: {
        subject: "right", approvalLawBasis: "urban_renovation_art_74", approvalDate: D("2018-10-23"), rightsValue: 300_000_000,
        settlementDirection: "pay", settlementAmount: 100_000_000, preApprovalExpenses: 0, postApprovalExpenses: 0,
        originalAssetType: "housing", receiveOnlyMode: false, exemptionEligibleAtApproval: false,
      },
    } as never),
    rates,
  );
  const cardText = (dir: string) => {
    const asset = { assetKind: "right_to_move_in", redevSubject: "", redevSettlementDirection: dir };
    return render(createElement(SingleDetailCards, { result, formData: { assets: [asset] }, asset } as never)).container.textContent ?? "";
  };
  it("미선택(\"\")도 §95② 본문 괄호 안내 카드를 낸다 — 명시 pay와 같다", () => {
    expect(cardText("")).toContain("인가후 양도차익 — 장기보유특별공제 적용 제외");
    cleanup();
    expect(cardText("pay")).toContain("인가후 양도차익 — 장기보유특별공제 적용 제외");
  });
});

describe("R-c09-04 종부세 특례 신청 — 기간은 조특법 §98의9③ · 신청 생략은 조특령 §98의8④ 단서", () => {
  it("결과 카드 문구", () => {
    const detail = { isEligible: true, dualExclusionApplied: false, ineligibleReasons: [], legalBasis: "조특법 §98의9" };
    const t = render(createElement(Unsold989DetailCard, { detail } as never)).container.textContent?.replace(/\s+/g, " ") ?? "";
    expect(t).toContain("9월 16일부터 9월 30일까지 관할 세무서장에게 별도 신청해야 합니다 (조특법 §98의9③)");
    expect(t).toContain("신청 내용에 변동이 없으면 신청하지 않을 수 있습니다 (조특령 §98의8④ 단서)");
    expect(t).not.toContain("별도 신청해야 합니다 (조특령 §98의8④)");
  });
});

describe("R-c09-05 §77 감면율 배지 — 기간은 엔진 분류 범위", () => {
  it("고시 2016-06-01 · 양도 2017-06-01 — current_2018(현금 10%) · 라벨 「2016.1.1.~」", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        propertyType: "land", isOneHousehold: false, householdHousingCount: 0, transferPrice: 600_000_000, acquisitionPrice: 200_000_000,
        acquisitionDate: D("2010-01-01"), transferDate: D("2017-06-01"),
        reductions: [{ type: "public_expropriation", cashCompensation: 600_000_000, bondCompensation: 0, businessApprovalDate: D("2016-06-01") }],
      } as never) as never,
      rates,
    );
    const d = r.publicExpropriationDetail!;
    expect(d.rateSetApplied).toBe("current_2018");
    const t = render(createElement(PublicExpropriationDetailCard, { detail: d })).container.textContent ?? "";
    expect(t).toContain("적용 감면율: 2016 감면율 (2016.1.1.~2024.12.31. 양도 · 종전 감면율 대상 제외 · 현금 10% / 채권 15~40%)");
    expect(t).not.toContain("2018.1.1.~");
  });
});

describe("R-c09-06 §97②2호 단서 swap 파트 — 개산공제 산식 줄 대신 미적용 안내", () => {
  const split = (buildingDirectExpenses: number) =>
    calculateTransferTax(
      baseTransferInput({
        propertyType: "housing", transferPrice: 900_000_000, transferDate: D("2026-02-16"), acquisitionPrice: 0, acquisitionDate: D("2018-06-01"),
        landAcquisitionDate: D("2010-03-15"), isSeparateAcquisition: true, saleSplitMode: "apportioned", landAcqMode: "actual", buildingAcqMode: "estimated",
        landAcquisitionPrice: 200_000_000, buildingDirectExpenses, standardPricePerSqmAtAcquisition: 500_000, acquisitionArea: 200,
        buildingStandardPriceAtAcquisition: 50_000_000, landStandardPriceAtTransfer: 300_000_000, buildingStandardPriceAtTransfer: 100_000_000,
        isOneHousehold: false, householdHousingCount: 2,
      } as never),
      rates,
    ).splitDetail!;
  const q = (c: HTMLElement, id: string) => c.querySelector(`[data-testid="${id}"]`)?.textContent ?? null;

  it("swap(건물 자본적지출·양도비 150,000,000) — 0원 옆에 「× 3%」 없음 · 미적용 안내", () => {
    const s = split(150_000_000);
    expect(s.building.swapApplied).toBe(true);
    expect(s.building.appraisalDeduction).toBe(0);
    const c = render(createElement(SplitGainDetailSection, { splitDetail: s })).container;
    expect(q(c, "split-card-lump-base-building")).toBeNull();
    expect(q(c, "split-card-lump-swap-building")).toBe("개산공제 미적용 (소득세법 §97 ② 2호 단서 — 자본적지출·양도비 택일)");
  });
  it("🔴 짝: swap 없음(비용 0) — 산식 줄 그대로", () => {
    const s = split(0);
    expect(s.building.swapApplied).toBe(false);
    const c = render(createElement(SplitGainDetailSection, { splitDetail: s })).container;
    expect(q(c, "split-card-lump-base-building")).toBe("취득시 기준시가 50,000,000 × 3%");
    expect(q(c, "split-card-lump-swap-building")).toBeNull();
  });
});

describe("R-c11-03 ⑲ 근거 문구 — §97·§97의2는 전액, §97의5만 임대기간 안분", () => {
  it.each([
    ["rental_97_main", "양도소득금액 전액 300,000,000 (조특법 §97 ① 본문 — 임대기간 안분 없음)"],
    ["rental_97_proviso", "양도소득금액 전액 300,000,000 (조특법 §97 ① 단서 — 임대기간 안분 없음)"],
    ["rental_97_2", "양도소득금액 전액 300,000,000 (조특법 §97의2 — 임대기간 안분 없음)"],
    ["rental_97_5", "임대기간 중 발생한 양도소득 300,000,000 (조특법 §97의5① — 임대기간 분 안분)"],
  ])("%s", (type, text) => {
    expect(eligibleIncomeBasisText(type, 300_000_000)).toBe(text);
  });
});
