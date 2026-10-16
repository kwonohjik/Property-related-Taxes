/**
 * RTL — 겸용주택 × 부담부증여 결과 화면 (PR-3 · UI 설계 §6.5 R-1~R-12).
 *
 * 입력은 엔진 anchor F1(주택 100㎡·상가 100㎡, 양도(증여)일 2024-03-01, 증여자 취득일 2010-03-15)의 **엔진 결과**이고,
 * 화면이 엔진 echo(`burdenedGift.perPart`·`debtAttribution`)를 그대로 읽는지 — 일반 겸용 문구로 떨어지지 않는지 — 를 잰다.
 * 부재 단언에는 일반 겸용(부담부증여 아님) 대조군이 짝으로 있다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import type { MixedUseAssetInput, MixedUseGainBreakdown } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import { MixedUseResultCard } from "@/components/calc/results/mixed-use/MixedUseResultCard";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

afterEach(cleanup);

const RATES = makeMockRates() as never;
const TD = new Date("2024-03-01");
const ACQ = new Date("2010-03-15");

function asset(over: Partial<MixedUseAssetInput> = {}): MixedUseAssetInput {
  return {
    isMixedUseHouse: true, residentialFloorArea: 100, nonResidentialFloorArea: 100, buildingFootprintArea: 100, totalLandArea: 200,
    landAcquisitionDate: ACQ, buildingAcquisitionDate: ACQ,
    transferStandardPrice: { housingPrice: 600e6, commercialBuildingPrice: 100e6, landPricePerSqm: 5_000_000, housingBuildingPrice: 100e6 },
    acquisitionStandardPrice: { housingPrice: 300e6, commercialBuildingPrice: 50e6, landPricePerSqm: 2_500_000, housingBuildingPrice: 50e6 },
    residencePeriodYears: 0, isMetropolitanArea: true, zoneType: "residential", isOneHouseExempt: false, acquisitionCause: "purchase",
    ...over,
  } as MixedUseAssetInput;
}
function bg(over: Partial<BurdenedGiftInfo> = {}): BurdenedGiftInfo {
  return {
    valuationMode: "sangjeungbeop_market", lendingDepositTotal: 0, mortgageDebtAmount: 600e6, annualRentTotal: 0, marketValueAtTransfer: 1_500_000_000,
    acquisitionMethod: "actual", actualAcquisitionTotal: 700e6, landStdPriceAtTransfer: 0, buildingStdPriceAtTransfer: 1_200_000_000,
    landStdPriceAtAcquisition: 0, buildingStdPriceAtAcquisition: 600e6, donorRelation: "lineal_descendant",
    debtAttribution: { housing: 0, commercial: 0, unallocated: 600e6 }, housingAppraisal: { exists: false }, ...over,
  } as BurdenedGiftInfo;
}
const calc = (a: MixedUseAssetInput, info?: BurdenedGiftInfo): MixedUseGainBreakdown =>
  calcMixedUseTransferTax(1, TD, info ? { ...a, burdenedGift: info } : a, RATES);
const formData = (extra: Record<string, unknown> = {}) =>
  ({ transferDate: "2024-03-01", filingDate: "2024-05-31", assets: [{ ...makeDefaultAsset(1), bgValuationMode: "sangjeungbeop_market", ...extra }], houses: [], presaleRights: [], contractTotalPrice: "", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false }) as never;
const text = (r: MixedUseGainBreakdown, extra?: Record<string, unknown>) => {
  const { container } = render(<MixedUseResultCard breakdown={r} formData={formData(extra)} />);
  return { container, txt: container.textContent ?? "" };
};

describe("BGM-R1 · M-0 (전부 구분 불분명 · 실지 7억) — 일반 겸용 문구로 떨어지지 않는다", () => {
  const r = calc(asset(), bg());

  it("① 부담부증여 섹션: 구분 불분명 몫·양도로 보는 채무액·채무비율·양도가액이 엔진 echo 그대로", () => {
    const { container } = text(r);
    const sec = container.querySelector('[data-testid="bg-result-apportion"]')!;
    expect(sec).not.toBeNull();
    const t = sec.textContent ?? "";
    expect(t).toContain("구분 불분명 채무의 주택 몫300,000,000");
    expect(t).toContain("주택분 양도로 보는 채무액300,000,000");
    expect(t).toContain("주택분 채무비율40.00%");
    expect(t).toContain("주택 양도가액300,000,000");
    expect(t).toContain("상가 양도가액300,000,000");
    expect(t).toContain("확인이 필요합니다");
  });

  it("일반 겸용의 «① 양도가액 안분»·«내림»·«총 양도가액 - 주택 양도가액»은 나오지 않는다", () => {
    const { txt } = text(r);
    expect(txt).not.toContain("① 양도가액 안분");
    expect(txt).not.toContain("총 양도가액 - 주택 양도가액");
    expect(txt).toContain("① 부담부증여 — 채무 귀속과 양도가액");
  });

  it("🔴 짝: 일반 겸용(부담부증여 아님)은 종전 «① 양도가액 안분» 그대로이고 부담부증여 섹션이 없다", () => {
    const { txt, container } = text(calc(asset()));
    expect(txt).toContain("① 양도가액 안분");
    expect(container.querySelector('[data-testid="bg-result-apportion"]')).toBeNull();
    expect(container.querySelector('[data-testid="bg-mixed-detail-card"]')).toBeNull();
  });

  it("취득가액·필요경비 산식: 부분별 채무비율이 분자·분모 숫자로 적힌다", () => {
    const { container } = text(r);
    const acq = container.querySelector('[data-testid="bg-result-acq-housing"]')!.textContent ?? "";
    expect(acq).toContain("주택 취득가액 · 실지취득가액 안분");
    expect(acq).toContain("주택분 양도로 보는 채무액 300,000,000");
    expect(acq).toContain("주택분 증여가액 750,000,000");
  });

  it("상세명세서: 양도가액이 «사용자 입력 0»·취득가액이 음수로 깨지지 않는다 (2026-10-16 렌더 실측 결함)", () => {
    const { txt } = text(r);
    expect(txt).not.toContain("사용자 입력 (실제 매매계약서상 거래금액)");
    expect(txt).not.toContain("-320,000,002");
    expect(txt).toContain("양도가액 = 양도로 보는 채무액 (소령 §159①2호) — 주택분 300,000,000 + 상가분 300,000,000 = 600,000,000");
    expect(txt).toContain("주택 토지분: 실지취득가액 중 이 부분 몫 × (주택분 양도로 보는 채무액 300,000,000 / 주택분 증여가액 750,000,000) = 116,666,666");
  });

  it("총 납부세액은 «양도세분»으로 한정되고 증여세는 수증자 별도라고 적힌다", () => {
    const { txt } = text(r);
    expect(txt).toContain("총 납부세액 (양도세분)");
    expect(txt).toContain("증여세는 수증자가 별도 신고·납부합니다");
    // 짝 — 일반 겸용은 한정 문구가 없다
    cleanup();
    expect(text(calc(asset())).txt).not.toContain("총 납부세액 (양도세분)");
  });

  it("증여재산 평가·무상이전분·증여세 카드와 증여세 신고서(별지 제10호)가 나온다 — 수증자 부담", () => {
    const { container } = text(r);
    const card = container.querySelector('[data-testid="bg-mixed-detail-card"]')!.textContent ?? "";
    expect(card).toContain("증여가액 = 양도시 시가");
    expect(container.querySelector('[data-testid="bg-mixed-gift-value"]')!.textContent).toBe("1,500,000,000");
    expect(card).toContain("무상이전분");
    expect(card).toContain("증여세 결정세액 (수증자 부담)189,150,000");
    expect(container.textContent).toContain("증여세 신고서 양식 (별지 제10호서식");
  });

  it("엔진 «확인이 필요한 사항» 고지가 화면에 노출된다 (R-9)", () => {
    const { txt } = text(r);
    expect(txt).toContain("확인이 필요한 사항");
    expect(txt).toContain("국세청 부동산거래관리과-119");
  });

  it("출력 항목 선택에 부담부증여 2종이 나온다 — 일반 겸용에는 없다 (R-7)", () => {
    expect(text(r).txt).toContain("부담부증여 평가 명세·증여세");
    expect(text(r).txt).toContain("증여세 신고서 양식 (별지 제10호)");
    cleanup();
    const plain = text(calc(asset())).txt;
    expect(plain).not.toContain("부담부증여 평가 명세·증여세");
    // 선택 패널 문구는 «증여세 신고서 양식 (별지 제10호)»이고 서식 본문은 «(별지 제10호서식 [» — 일반 겸용에는 둘 다 없다.
    expect(plain).not.toContain("증여세 신고서 양식 (별지 제10호)");
  });

  it("신고서 표 헤더 배지 «§159 채무비율 안분» (겸용 echo 기준)", () => {
    expect(text(r).txt).toContain("§159 채무비율 안분");
    cleanup();
    expect(text(calc(asset())).txt).not.toContain("§159 채무비율 안분");
  });
});

const r0 = calc(asset(), bg());

describe("BGM-R2 · M-8 (상가 귀속만) — 주택분은 «양도 없음», 비과세로 읽히지 않는다", () => {
  const r = calc(asset({ isOneHouseExempt: true, residencePeriodYears: 10 }), bg({ debtAttribution: { housing: 0, commercial: 600e6, unallocated: 0 } }));

  it("주택분 «양도 없음» 배지 + 사유(소득세법 제88조 제1호 후단), 상가분 배지는 없다", () => {
    const { container } = text(r);
    const housing = container.querySelector('[data-testid="bg-result-not-transferred-housing"]')!;
    expect(housing.textContent).toContain("양도 없음");
    expect(housing.textContent).toContain("소득세법 제88조 제1호 후단");
    expect(container.querySelector('[data-testid="bg-result-not-transferred-commercial"]')).toBeNull();
  });

  it("🔴 «1세대 1주택 비과세: …» 줄을 그리지 않는다 — 1세대1주택 신고여도 양도 없는 주택분에 비과세를 말하지 않는다", () => {
    const { txt, container } = text(r);
    expect(txt).not.toContain("1세대 1주택 비과세:");
    expect(txt).not.toContain("12억 이하 → 전액 비과세");
    expect(txt).toContain("고가주택 판정: 해당 없음 (주택분 양도 없음)");
    const banner = container.querySelector('[data-testid="bg-result-no-transfer-banner"]')!.textContent ?? "";
    expect(banner).not.toMatch(/비과세 적용|비과세 성립|감면/);
  });

  it("신고서 주택분 두 열의 양도가액 칸에 «양도 없음 (채무 미귀속)» 고지 (R-11)", () => {
    const { txt } = text(r);
    expect(txt.match(/양도 없음 \(채무 미귀속\)/g)?.length).toBe(2);
  });

  it("상세명세서: 양도 없는 주택분은 산식 대신 «양도 없음 (인수 채무가 귀속되지 않음)»", () => {
    const { txt } = text(r);
    expect(txt).toContain("주택분: 양도 없음 (인수 채무가 귀속되지 않음)");
  });

  it("🔴 상가분이 양도 없음이면 ③ 상가부분 섹션이 «상가부분 양도소득금액»·장기보유공제 행을 그리지 않고 «양도 없음»을 말한다 (짝: 양도가 있으면 그 행이 있다)", () => {
    const h = calc(asset(), bg({ debtAttribution: { housing: 600e6, commercial: 0, unallocated: 0 } }));
    const sectionOf = (c: HTMLElement) => Array.from(c.querySelectorAll("h4")).find((e) => e.textContent?.startsWith("③"))!.parentElement!.parentElement!.textContent ?? "";
    const none = sectionOf(text(h).container);
    expect(none).toContain("양도 없음");
    expect(none).not.toContain("상가부분 양도소득금액");
    expect(none).not.toContain("장기보유공제");
    cleanup();
    const both = sectionOf(text(r0).container);
    expect(both).toContain("상가부분 양도소득금액");
    expect(both).toContain("장기보유공제");
  });

  it("🔴 짝: 주택 귀속만 + 1세대1주택이면 주택분은 «양도가 있고 비과세»라 비과세 줄이 나오고, 상가분이 «양도 없음»", () => {
    const h = calc(asset({ isOneHouseExempt: true, residencePeriodYears: 10 }), bg({ debtAttribution: { housing: 600e6, commercial: 0, unallocated: 0 } }));
    const { txt, container } = text(h);
    expect(txt).toContain("1세대 1주택 비과세:");
    expect(container.querySelector('[data-testid="bg-result-not-transferred-commercial"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="bg-result-not-transferred-housing"]')).toBeNull();
  });
});

describe("BGM-R3 · 산식이 값을 만든다 — K-5 환산, 기준시가 모드, 개산공제", () => {
  it("K-5 환산: 부분별 «양도가액 × 취득시 기준시가 / 양도시 기준시가»가 취득가액 echo와 1원까지 같다 (적힌 산식 = 적힌 값)", () => {
    const r = calc(asset(), bg({ acquisitionMethod: "converted", actualAcquisitionTotal: undefined }));
    for (const k of ["housingLand", "housingBuilding", "commercialLand", "commercialBuilding"] as const) {
      const p = r.burdenedGift!.perPart[k];
      expect(Math.floor((p.transferPrice * p.stdPriceAtAcquisition) / p.stdPriceAtTransfer), k).toBe(p.acquisitionPrice);
    }
    const { container } = text(r);
    const acq = container.querySelector('[data-testid="bg-result-acq-housing"]')!.textContent ?? "";
    expect(acq).toContain("환산취득가액 (시행령 §176의2②2호)");
    expect(acq).toContain("개산공제율 3%");
  });

  it("기준시가 모드(K-1~3): 취득가액 = 취득시 기준시가 × 채무비율, 개산공제율이 echo에서 읽힌다", () => {
    const r = calc(asset(), bg({ valuationMode: "sangjeungbeop_standard", marketValueAtTransfer: undefined, acquisitionMethod: undefined, actualAcquisitionTotal: undefined, housingAppraisal: undefined }));
    const p = r.burdenedGift!.perPart.housingLand;
    expect(Math.floor((p.stdPriceAtAcquisition * r.burdenedGift!.debtAttribution.housingDebt) / r.burdenedGift!.debtAttribution.housingGiftValue)).toBe(p.acquisitionPrice);
    const { container } = text(r, { bgValuationMode: "sangjeungbeop_standard" });
    expect(container.querySelector('[data-testid="bg-result-acq-housing"]')!.textContent).toContain("취득시 기준시가 안분");
    expect(container.querySelector('[data-testid="bg-mixed-detail-card"]')!.textContent).toContain("증여가액 = 보충적평가");
  });
});
