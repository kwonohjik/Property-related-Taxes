// anchor — §98의8·§99의2 자산 종류 게이트 (사용자 결정 2026-11-11, US-77 재개발 하이브리드 점검 후속 · US-44 Q-4의 확대)
//
// 두 조문도 «사업주체 등과 최초로 매매계약을 체결하고 취득»한 주택이 대상이다.
//   · 법 §98의8①: 사업주체 등과 2015년 중 최초로 매매계약을 체결한 준공후미분양주택 (MST 284389)
//   · 조특령 §99의2①: 신축주택등 = 사업주체 등이 공급하는 주택. 자기건설 주택 중 정비사업조합 조합원이 관리처분계획에 따라 취득하는 주택은 ①8호 가목이 뺀다 (MST 288915)
// 종전에는 US-44 결정 범위 밖이라 카테고리 게이트를 탔다 — 재개발APT가 §99의2를 고르면 5년 이내 100% 세액감면, §98의8을 고르면 5년간 발생분 50% 차감이 일반 주택과 똑같이 적용됐다.
// (mock 실측 2026-11-11: §99의2 5년 이내 20,732,921 → 0 · 5년 후 19,685,309 → 8,451,556 · §98의8 17,307,532 → 12,084,360)
// 대조: §98의4(비거주자 — 최초 계약 요건 없음)·§98의9(주택 수 제외)는 이유가 없어 열어 둔다.
import { describe, it, expect } from "vitest";
import {
  isReductionAllowedForAssetKind,
  assetKindGateReason,
  assetKindGateMessage,
  type ReductionAssetKind,
} from "@/lib/tax-engine/transfer-reductions";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { case44RedevelopmentInfo } from "@/__tests__/tax-engine/transfer-tax/redevelopment/_helpers";

const rates = makeMockRates();
const IDS = ["unsold_98_8", "unsold_99_2"] as const;
const BLOCKED: ReductionAssetKind[] = ["redevelopment_apt", "right_to_move_in", "presale_right"];
type Reductions = TransferTaxInput["reductions"];

const R992 = {
  type: "unsold_99_2" as const, houseType992: "new_or_unsold", contractDate992: new Date("2013-05-01"),
  acquisitionPrice992: 500_000_000, exclusiveAreaSqm992: 80,
  meetsHouseTypeRequirement992: true, isNotExcludedSelfBuilt992: true, isNotRecontract992: true, hasConfirmationSeal992: true,
  standardPriceAtAcquisition992: 100_000_000, standardPriceAt5Years992: 160_000_000, standardPriceAtTransfer992: 250_000_000,
};
const R988 = {
  type: "unsold_98_8" as const, contractDate988: new Date("2015-05-01"), acquisitionPrice988: 500_000_000, exclusiveAreaSqm988: 80,
  rentalContractDate988: new Date("2015-09-01"), rentalStartDate988: new Date("2015-09-01"), rentalEndDate988: new Date("2021-12-31"),
  businessRegistrationDate988: new Date("2015-08-01"), rentalRegistrationDate988: new Date("2015-08-01"),
  isUnsoldAfterCompletion988: true, isFirstContract988: true, isNotRecontract988: true,
  standardPriceAtAcquisition988: 100_000_000, standardPriceAt5Years988: 160_000_000, standardPriceAtTransfer988: 250_000_000,
};

function asset(kind: "redevelopment_apt" | "housing" | "presale_right", acq: string, tr: string, reductions: Reductions): TransferTaxInput {
  return baseTransferInput({
    propertyType: kind,
    transferPrice: 525_000_000,
    transferDate: new Date(tr),
    acquisitionDate: new Date(acq),
    acquisitionPrice: 300_000_000,
    expenses: 0,
    isOneHousehold: false,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    ...(kind === "redevelopment_apt" ? { redevelopment: { ...case44RedevelopmentInfo(), completionDate: new Date("2012-06-01") } } : {}),
    reductions,
  });
}

describe("§98의8·§99의2 게이트 행렬 — ⑤⑧ 공용 술어", () => {
  it("G-1: 🔴 재개발APT·조합원입주권·분양권은 차단, 주택은 허용", () => {
    for (const id of IDS) {
      expect(isReductionAllowedForAssetKind(id, "housing")).toBe(true);
      for (const kind of BLOCKED) expect(isReductionAllowedForAssetKind(id, kind)).toBe(false);
    }
  });

  it("G-2: 대조군 — §98의4·§98의9·§99는 열려 있다(이유가 없다)", () => {
    for (const id of ["unsold_98_4", "unsold_98_9", "new_99"]) {
      for (const kind of BLOCKED) expect(isReductionAllowedForAssetKind(id, kind)).toBe(true);
    }
  });

  it("G-3: 사유 문구 — 조문 원문 표현 · §99의2는 조합원 제외 근거(령 §99의2①)", () => {
    expect(assetKindGateReason("unsold_98_8", "redevelopment_apt")).toContain("사업주체 등과 최초로 매매계약을 체결하고 취득한 준공후미분양주택");
    expect(assetKindGateReason("unsold_98_8", "redevelopment_apt")).toContain("관리처분계획");
    const r992 = assetKindGateReason("unsold_99_2", "redevelopment_apt");
    expect(r992).toContain("신축주택·미분양주택과 최초로 매매계약을 체결하고 취득한 주택");
    expect(r992).toContain("조특령 §99의2①");
    expect(r992).not.toContain("미분양주택이 아닙니다"); // 신축주택등 — «미분양주택» 단정 문구를 쓰지 않는다
    expect(assetKindGateReason("unsold_99_2", "presale_right")).toContain("소득세법 §94①2호가목");
    expect(assetKindGateReason("unsold_99_2", "housing")).toBeUndefined();
  });

  it("G-4: ⑧·⑫ 공용 메시지가 같은 사유 + 해제 안내를 쓴다", () => {
    for (const id of IDS) {
      const m = assetKindGateMessage(id, "redevelopment_apt");
      expect(m).toContain(assetKindGateReason(id, "redevelopment_apt")!);
      expect(m).toContain("감면 선택을 해제하세요");
    }
  });

  it("G-5: 토지·건물 등 비주택은 조문 사유가 아니라 카테고리 사유(「주택 양도에만」)를 쓴다", () => {
    for (const id of IDS) expect(assetKindGateReason(id, "land")).toBeUndefined();
  });
});

describe("엔진 진입 방어 — ⑤⑧을 거치지 않은 재개발APT 입력", () => {
  it("E-1: 🔴 §99의2 5년 이내(100% 세액감면) — 걷어 내고 미선택과 세액이 같다 + 고지", () => {
    const withRed = calculateTransferTax(asset("redevelopment_apt", "2013-06-01", "2016-06-01", [R992] as Reductions), rates);
    const none = calculateTransferTax(asset("redevelopment_apt", "2013-06-01", "2016-06-01", []), rates);
    expect(none.determinedTax).toBe(20_732_921);
    expect(withRed.unsold992Detail).toBeUndefined();
    expect(withRed.reductionAmount).toBe(0);
    expect(withRed.determinedTax).toBe(none.determinedTax);
    expect(withRed.warnings?.some((w) => w.includes("§99의2") && w.includes("이 계산에 반영하지 않았습니다"))).toBe(true);
  });

  it("E-2: 🔴 §99의2 5년 후(소득금액 공제) — 미선택과 세액이 같다", () => {
    const withRed = calculateTransferTax(asset("redevelopment_apt", "2013-06-01", "2019-06-01", [R992] as Reductions), rates);
    const none = calculateTransferTax(asset("redevelopment_apt", "2013-06-01", "2019-06-01", []), rates);
    expect(none.determinedTax).toBe(19_685_309);
    expect(withRed.unsold992Detail).toBeUndefined();
    expect(withRed.determinedTax).toBe(none.determinedTax);
  });

  it("E-3: 🔴 §98의8 — 미선택과 세액이 같다 + 고지", () => {
    const withRed = calculateTransferTax(asset("redevelopment_apt", "2015-06-01", "2022-06-01", [R988] as Reductions), rates);
    const none = calculateTransferTax(asset("redevelopment_apt", "2015-06-01", "2022-06-01", []), rates);
    expect(none.determinedTax).toBe(17_307_532);
    expect(withRed.unsold988Detail).toBeUndefined();
    expect(withRed.determinedTax).toBe(none.determinedTax);
    expect(withRed.warnings?.some((w) => w.includes("§98의8") && w.includes("이 계산에 반영하지 않았습니다"))).toBe(true);
  });

  it("E-4: 분양권도 같다 — §99의2 선택이 걷힌다", () => {
    const withRed = calculateTransferTax(asset("presale_right", "2013-06-01", "2016-06-01", [R992] as Reductions), rates);
    const none = calculateTransferTax(asset("presale_right", "2013-06-01", "2016-06-01", []), rates);
    expect(withRed.unsold992Detail).toBeUndefined();
    expect(withRed.determinedTax).toBe(none.determinedTax);
  });

  it("E-5: 대조군 — 같은 사실의 일반 주택은 감면이 그대로 적용된다", () => {
    const a = calculateTransferTax(asset("housing", "2013-06-01", "2016-06-01", [R992] as Reductions), rates);
    expect(a.unsold992Detail?.isEligible).toBe(true);
    expect(a.determinedTax).toBe(0);
    const b = calculateTransferTax(asset("housing", "2015-06-01", "2022-06-01", [R988] as Reductions), rates);
    expect(b.unsold988Detail?.isEligible).toBe(true);
    expect(b.determinedTax).toBe(37_934_000);
  });
});
