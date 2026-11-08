/**
 * 이월과세(`carryover_gift`) 자산 — 화면·⑧이 읽는 취득일 (레인 L23 · L21 후속).
 *
 * 이월과세 카드에는 취득일 칸이 없다. 매매로 입력했다가 취득원인을 바꾸면 옛 `acquisitionDate`가 잔재로 남는데, ④ 와이어(`primaryAcquisitionDateOf`)는
 * 증여 등기접수일만 읽는다(L21). 화면·⑧ 일곱 곳이 원시값을 직접 읽어 엔진과 다른 날짜를 보고 있었다. 이 anchor는 7건을 셀마다 고정한다.
 *
 * 셀: 잔재(S) × 등기접수일(G) — ① S≠G 양방향 ② S="" ③ S=G 대조 ④ 매매(purchase) 대조(불변).
 * 법령(KoreanLaw MCP 본문 확인 2026-11-08): 소득세법 §95④ 단서·§104②2호 — 이월과세(§97의2①)는 증여자 취득일부터 보유기간을 센다. 소령 §154⑤ — 비과세 보유기간 계산도 법 §95④에 따른다.
 *   엔진은 §97의2②3호 비교(시나리오 A=증여자 취득일 · B=증여 등기접수일)를 계산 뒤에 정하므로 화면은 ④ 와이어 날짜(=B·rawInput, 증여 등기접수일)를 읽는다
 *   (`docs/00-pm/carryover-surcharge-suspension-holding.plan.md` §6). 세액은 불변이다.
 */
import { describe, it, expect } from "vitest";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { createDefaultTransferFormData, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { makeDefaultRentalUnit, RENTAL_HOUSING_EXCEPTION_DEFAULTS } from "@/lib/stores/calc-wizard-asset-factory";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { validateStep } from "@/lib/calc/transfer-tax-validate";
import { summarizeAssetSections } from "@/components/calc/transfer/asset-section-summary";
import { buildPeriodContext } from "@/components/calc/transfer/UnifiedReductionPanel";
import { gracePeriodInScope } from "@/lib/calc/grace-period-scope";
import { isMultiHouseSurchargeSuppressed } from "@/lib/calc/transfer-tax-api-helpers";
import { primaryAcquisitionDateOf } from "@/lib/calc/transfer-tax-api-carryover";
import { withTestAddress } from "@/__tests__/fixtures/transfer-test-address";
import { collectWithFields } from "@/lib/calc/transfer-tax-validate-field";
import { validateRentalHousingException } from "@/lib/calc/transfer-tax-validate-rental-exception";
import { rentalResidenceRequirementStatus } from "@/lib/calc/rental-residence-requirement-status";
import { calcRentalResidenceFacts } from "@/lib/calc/rental-residence-form-facts";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";

const TRANSFER = "2024-06-01";
type Cell = { name: string; S: string; G: string };
/** 잔재(S)·등기접수일(G) 셀 — 양방향·빈 잔재·동일 */
const CELLS: Cell[] = [
  { name: "S 이른 · G 늦음", S: "2010-01-01", G: "2023-01-01" },
  { name: "S 늦음 · G 이름", S: "2023-01-01", G: "2010-01-01" },
  { name: "S 빔 · G 이름", S: "", G: "2010-01-01" },
  { name: "S 빔 · G 늦음", S: "", G: "2023-01-01" },
  { name: "S = G", S: "2023-01-01", G: "2023-01-01" },
];

function carryoverAsset(S: string, G: string, over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "carryover_gift",
    acquisitionDate: S,
    actualSalePrice: "800000000",
    carryover: { ...CARRYOVER_DEFAULTS, giftRegistryDate: G, donorAcquisitionDate: "2000-01-01", donorAcquisitionPrice: "100000000", giftDateValuation: "400000000", giftTaxAmount: "0", donorRelation: "lineal", donorSameHousehold: "no" },
    ...over,
  } as AssetForm;
}
function purchaseAsset(S: string, over: Partial<AssetForm> = {}): AssetForm {
  return { ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: S, actualSalePrice: "800000000", fixedAcquisitionPrice: "400000000", ...over } as AssetForm;
}
function formOf(asset: AssetForm, over: Record<string, unknown> = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  Object.assign(f, { transferDate: TRANSFER, contractTotalPrice: "800,000,000", householdHousingCount: "1", ...over });
  f.assets[0] = { ...f.assets[0], ...asset, assetId: f.assets[0].assetId };
  return withTestAddress(f); // 소재지는 ⑧ 필수 — 비면 날짜 검증 전에 막혀 부정형 단언이 공허해진다
}

// ── 4번 N2 — 날짜 순서·미래 검증 (⑧ · 카드 인라인 경고) ─────────────────────────────────
describe("N2 — 날짜 순서·미래 검증이 증여 등기접수일을 읽는다", () => {
  const dateIssues = (f: TransferFormData) =>
    collectStepIssues(0, f).filter((i) => i.field === "acquisitionDate" || /취득일|등기접수일/.test(i.message));

  it("🔑 잔재가 양도일 이후(2030) · 등기접수일 정상 → 막지 않는다 (수정 전: 칸 없는 acquisitionDate로 막다른 길)", () => {
    expect(dateIssues(formOf(carryoverAsset("2030-01-01", "2020-01-01")))).toEqual([]);
  });
  it("🔑 잔재가 오늘 이후(2099) · 등기접수일 정상 → 막지 않는다", () => {
    expect(dateIssues(formOf(carryoverAsset("2099-01-01", "2020-01-01")))).toEqual([]);
  });
  it("🔑 잔재 정상 · 등기접수일이 양도일 이후 → 증여 등기접수일 칸을 지목해 막는다 (수정 전: 통과)", () => {
    const issues = collectStepIssues(0, formOf(carryoverAsset("2010-01-01", "2030-01-01")));
    expect(issues.some((i) => i.field === "carryover.giftRegistryDate")).toBe(true);
    expect(issues.some((i) => i.field === "acquisitionDate")).toBe(false);
  });
  it("잔재 빔 · 등기접수일 정상 → 막지 않는다", () => {
    expect(dateIssues(formOf(carryoverAsset("", "2020-01-01")))).toEqual([]);
  });
  it("대조(불변) — 매매 · 취득일 ≥ 양도일 → acquisitionDate 칸 차단", () => {
    const issues = collectStepIssues(0, formOf(purchaseAsset("2030-01-01")));
    expect(issues.some((i) => i.field === "acquisitionDate")).toBe(true);
  });
  it("대조(불변) — 매매 · 취득일이 오늘 이후(2099) → acquisitionDate 칸 차단", () => {
    const f = formOf(purchaseAsset("2099-01-01"), { transferDate: "2099-06-01" });
    expect(collectStepIssues(0, f).some((i) => i.field === "acquisitionDate" && /오늘 이후/.test(i.message))).toBe(true);
  });
});

// ── 5번 N3 — 「3 취득」 칩 ──────────────────────────────────────────────────────────────
describe("N3 — ③ 취득정보 칩(✓/○)은 이월과세에서 증여 등기접수일로 판정한다", () => {
  const filled = (a: AssetForm) => summarizeAssetSections(a, {}).acquisition.filled;
  for (const c of CELLS) {
    it(`이월과세 · ${c.name} → 등기접수일 유무(${!!c.G})와 같다`, () => {
      expect(filled(carryoverAsset(c.S, c.G))).toBe(!!c.G);
    });
  }
  it("🔑 이월과세 · 잔재 있음 · 등기접수일 빔 → ○ (수정 전 ✓)", () => {
    expect(filled(carryoverAsset("2010-01-01", ""))).toBe(false);
  });
  it("🔑 이월과세 · 잔재 빔 · 등기접수일 있음 → ✓ (수정 전 ○ — 정상 경로가 늘 미입력으로 보였다)", () => {
    expect(filled(carryoverAsset("", "2020-01-01"))).toBe(true);
  });
  it("대조(불변) — 매매는 acquisitionDate로 판정", () => {
    expect(filled(purchaseAsset(""))).toBe(false);
    expect(filled(purchaseAsset("2010-01-01"))).toBe(true);
  });
});

// ── 3번 — 감면 패널 시한·§127⑦ 트랙·⑧ ─────────────────────────────────────────────────────
describe("감면 — 시한 ctx · §127⑦ 트랙 교차 · 5년 경과 기준시가가 증여 등기접수일을 읽는다", () => {
  it("buildPeriodContext.acquisitionDate = 증여 등기접수일 (잔재·빈 잔재·동일 5셀)", () => {
    for (const c of CELLS) {
      const ctx = buildPeriodContext(carryoverAsset(c.S, c.G), TRANSFER);
      expect(ctx.acquisitionDate?.toISOString().slice(0, 10), c.name).toBe(c.G);
    }
  });
  it("buildPeriodContext — 등기접수일 빔 → acquisitionDate 없음(잔재로 채우지 않는다)", () => {
    expect(buildPeriodContext(carryoverAsset("2010-01-01", ""), TRANSFER).acquisitionDate).toBeUndefined();
  });
  it("대조(불변) — 매매는 acquisitionDate", () => {
    expect(buildPeriodContext(purchaseAsset("2010-01-01"), TRANSFER).acquisitionDate?.toISOString().slice(0, 10)).toBe("2010-01-01");
  });

  const r993 = { type: "new_99_3" } as unknown as AssetReductionForm;
  const r983 = {
    type: "unsold_98_3", residencyType983: "resident", houseType983: "purchased", contractDate983: "2009-06-01", isOverconcentration983: false,
    standardPriceAtAcquisition983: "", standardPriceAt5Years983: "", standardPriceAtTransfer983: "",
  } as unknown as AssetReductionForm;
  const conflict = (asset: AssetForm) => String(validateStep(2, formOf(asset)) ?? "").includes("§127⑦ 중복배제");

  it("§127⑦ 트랙 교차: 소득차감형 §99의3 + 하이브리드 §98의3 — 5년 이내(등기접수일 2023)면 세액감면형이라 교차 차단", () => {
    expect(conflict(carryoverAsset("2010-01-01", "2023-01-01", { reductions: [r993, r983] }))).toBe(true);
  });
  it("🔑 §127⑦: 잔재 2023(5년 이내)·등기접수일 2010(5년 경과)이면 둘 다 소득차감형이라 교차 아님 (수정 전: 차단)", () => {
    expect(conflict(carryoverAsset("2023-01-01", "2010-01-01", { reductions: [r993, r983] }))).toBe(false);
  });
  it("🔑 §127⑦: 잔재 2010(5년 경과)·등기접수일 2023(5년 이내)이면 교차 차단 (수정 전: 통과)", () => {
    expect(conflict(carryoverAsset("2010-01-01", "2023-01-01", { reductions: [r993, r983] }))).toBe(true);
  });
  it("대조(불변) — 매매 취득일 2023(5년 이내)이면 교차 차단", () => {
    expect(conflict(purchaseAsset("2023-01-01", { reductions: [r993, r983] }))).toBe(true);
  });

  // §99의2는 취득원인 게이트가 없다(§98의3은 증여 취득을 거절해 이 셀에 못 닿는다)
  const r992std = (std: boolean) =>
    ({
      type: "unsold_99_2", houseType992: "existing_one_house", contractDate992: "2013-06-01", usageApprovalDate992: "", acquisitionPrice992: "550,000,000", exclusiveAreaSqm992: "84",
      standardPriceAtAcquisition992: std ? "200,000,000" : "", standardPriceAt5Years992: std ? "300,000,000" : "", standardPriceAtTransfer992: std ? "400,000,000" : "",
    }) as unknown as AssetReductionForm;
  const needsStd = (asset: AssetForm) => /5년 경과 양도는 취득시 기준시가/.test(String(validateStep(2, formOf(asset)) ?? ""));
  it("🔑 5년 경과 기준시가 요구: 등기접수일 2010(경과)·잔재 2023 → 요구 (수정 전: 요구 안 함)", () => {
    expect(needsStd(carryoverAsset("2023-01-01", "2010-01-01", { reductions: [r992std(false)] }))).toBe(true);
  });
  it("🔑 5년 경과 기준시가 요구: 등기접수일 2023(5년 이내)·잔재 2010 → 요구 안 함 (수정 전: 요구)", () => {
    expect(needsStd(carryoverAsset("2010-01-01", "2023-01-01", { reductions: [r992std(false)] }))).toBe(false);
  });
  it("대조(불변) — 매매 2010(경과)·미입력 → 요구, 입력 → 통과", () => {
    expect(needsStd(purchaseAsset("2010-01-01", { reductions: [r992std(false)] }))).toBe(true);
    expect(needsStd(purchaseAsset("2010-01-01", { reductions: [r992std(true)] }))).toBe(false);
  });
});

describe("감면 ⑧ — §99의3·§99 5년 경과 양도시 기준시가 요구(조합원 아닌 갈래)가 증여 등기접수일을 읽는다", () => {
  const r993 = {
    ...getReductionDefault("new_99_3"), houseType993: "apartment", firstContract993: "yes", standardPriceAtAcquisition993: "100,000,000",
    standardPriceAt5Years: "200,000,000", standardPriceAtTransfer993: "", exclusiveAreaSqm993: "84", contractDate993: "2002-05-01",
  } as unknown as AssetReductionForm;
  const r99 = {
    ...getReductionDefault("new_99"), houseType99: "apartment", firstContract99: "yes", standardPriceAtAcquisition99: "100,000,000",
    standardPriceAt5Years99: "160,000,000", standardPriceAtTransfer99: "", exclusiveAreaSqm99: "84", contractDate99: "1998-06-01",
  } as unknown as AssetReductionForm;
  const msgs = (asset: AssetForm) => collectStepIssues(2, formOf(asset, { transferDate: "2024-08-01", contractTotalPrice: "900,000,000", isOneHousehold: true })).map((i) => i.message).join("\n");
  for (const [label, red, re] of [["§99의3", r993, /§99의3 적용: 취득 후 5년 경과 양도는 양도시 기준시가/], ["§99", r99, /§99 적용: 취득 후 5년 경과 양도는 양도시 기준시가/]] as const) {
    it(`🔑 ${label}: 등기접수일 2010(5년 경과)·잔재 2023 → 양도시 기준시가를 요구한다 (수정 전: 요구 안 함)`, () => {
      expect(msgs(carryoverAsset("2023-01-01", "2010-01-01", { reductions: [red] }))).toMatch(re);
    });
    it(`🔑 ${label}: 등기접수일 2023(5년 이내)·잔재 2010 → 요구하지 않는다 (수정 전: 요구)`, () => {
      expect(msgs(carryoverAsset("2010-01-01", "2023-01-01", { reductions: [red] }))).not.toMatch(re);
    });
    it(`🔑 ${label}: 잔재 빔·등기접수일 2010 → 요구한다`, () => {
      expect(msgs(carryoverAsset("", "2010-01-01", { reductions: [red] }))).toMatch(re);
    });
    it(`대조(불변) — ${label} 매매 2010 → 요구, 2023 → 요구 안 함`, () => {
      expect(msgs(purchaseAsset("2010-01-01", { reductions: [red] }))).toMatch(re);
      expect(msgs(purchaseAsset("2023-01-01", { reductions: [red] }))).not.toMatch(re);
    });
  }
});

// ── 7번 N5 — 다주택 중과 한시배제 유예 범위 ─────────────────────────────────────────────────
describe("N5 — 한시배제 판정·유예 입력 범위(gracePeriodInScope)는 증여 등기접수일을 읽는다", () => {
  const form = (asset: AssetForm, transferDate = "2023-03-01") =>
    formOf(asset, {
      transferDate, isOneHousehold: true, householdHousingCount: "2",
      houses: [{ id: "h1", region: "capital", acquisitionDate: "2015-01-01", officialPrice: "300000000", isInherited: false, isLongTermRental: false, isApartment: true, isOfficetel: false, isUnsoldHousing: false }],
    });
  it("🔑 잔재 2018(보유 2년↑)·등기접수일 2022-03-01(보유 1년) → 한시배제 아님 → 유예 입력 범위 안 (수정 전: 배제로 읽어 범위 밖)", () => {
    expect(isMultiHouseSurchargeSuppressed("2023-03-01", primaryAcquisitionDateOf(carryoverAsset("2018-05-05", "2022-03-01")))).toBe(false);
    expect(gracePeriodInScope(form(carryoverAsset("2018-05-05", "2022-03-01")))).toBe(true);
  });
  it("🔑 잔재 2022-03-01(보유 1년)·등기접수일 2018-05-05(보유 2년↑) → 한시배제 → 범위 밖 (수정 전: 범위 안)", () => {
    expect(gracePeriodInScope(form(carryoverAsset("2022-03-01", "2018-05-05")))).toBe(false);
  });
  it("잔재 빔 · 등기접수일 2018 → 한시배제 → 범위 밖", () => {
    expect(gracePeriodInScope(form(carryoverAsset("", "2018-05-05")))).toBe(false);
  });
  it("대조(불변) — 매매 취득일 2018 → 한시배제 → 범위 밖, 2022-03-01 → 범위 안", () => {
    expect(gracePeriodInScope(form(purchaseAsset("2018-05-05")))).toBe(false);
    expect(gracePeriodInScope(form(purchaseAsset("2022-03-01")))).toBe(true);
  });
});

// ── 6번 N4 — 장기임대 거주주택 특례 ──────────────────────────────────────────────────────────
describe("N4 — 장기임대 거주주택 특례의 거주주택 취득일(⑧ · 카드 상태 leaf · 상생임대 날짜 하한)이 증여 등기접수일을 읽는다", () => {
  const rh = () =>
    ({
      ...RENTAL_HOUSING_EXCEPTION_DEFAULTS,
      applyException: true,
      scenario: "A",
      rentalUnits: [{ ...makeDefaultRentalUnit(), businessRegistrationDate: "2016-06-01", rentalRegistrationDate: "2016-06-01", standardPriceAtRentalStart: "300,000,000", rentalInputMode: "direct", rentalMonths: "96", requirementsConfirmed: true }],
    }) as AssetForm["rentalHousingException"];
  const withRh = (a: AssetForm) =>
    ({ ...a, rentalHousingException: rh(), residenceInputMode: "direct", residencePeriodMonthsAsset: "30" }) as AssetForm;
  // 계산기 카드(`calc`)와 같은 인자 — 요건 미달은 막지 않는다(blockRequirementShortfall=false)
  const run = (a: AssetForm, block: boolean) =>
    collectWithFields(() =>
      validateRentalHousingException(a.rentalHousingException, a, 0, "자산1", TRANSFER, "full", false, false, undefined, undefined, undefined, undefined, block),
    );
  const calcMsg = (a: AssetForm) => validateRentalHousingException(a.rentalHousingException, a, 0, "자산1", TRANSFER, "full", false, false, undefined, undefined, undefined, undefined, false);
  // 부담부증여 카드(`full`)와 같은 인자 — 보유 2년 미달을 막는다
  const fullMsg = (a: AssetForm) => validateRentalHousingException(a.rentalHousingException, a, 0, "자산1", TRANSFER, "full", false, false, undefined, undefined, undefined, undefined, true);

  it("🔑 잔재 빔 · 등기접수일 있음 → 「거주주택 취득일을 입력하세요」 막다른 길이 없다 (수정 전: 칸 없는 acquisitionDate로 차단)", () => {
    expect(String(calcMsg(withRh(carryoverAsset("", "2020-01-01"))) ?? "")).not.toMatch(/취득일을 입력|등기접수일을 입력/);
  });
  it("등기접수일 빔 → 증여 등기접수일 칸을 지목한다 (취득일 칸이 아니다)", () => {
    const { result, fieldOf } = run(withRh(carryoverAsset("2010-01-01", "")), false);
    expect(String(result)).toMatch(/증여 등기접수일을 입력하세요/);
    expect(fieldOf(String(result))).toBe("carryover.giftRegistryDate");
  });
  it("대조(불변) — 매매 · 취득일 빔 → 「거주주택 취득일을 입력하세요」 acquisitionDate", () => {
    const { result, fieldOf } = run(withRh(purchaseAsset("")), false);
    expect(String(result)).toMatch(/거주주택 취득일을 입력하세요/);
    expect(fieldOf(String(result))).toBe("acquisitionDate");
  });
  it("🔑 보유 2년(부담부증여 카드 `full` 인자): 등기접수일 2023-01-01(1년 5개월)이면 미달 — 잔재 2010이어도 (수정 전: 잔재로 통과)", () => {
    const { result, fieldOf } = run(withRh(carryoverAsset("2010-01-01", "2023-01-01")), true);
    expect(String(result)).toMatch(/증여 등기접수일~양도일/);
    expect(String(result)).toMatch(/보유기간 2년 이상이 필요합니다/);
    expect(fieldOf(String(result))).toBe("carryover.giftRegistryDate");
  });
  it("🔑 보유 2년: 등기접수일 2010이면 충족 — 잔재 2023이어도 (수정 전: 잔재로 오차단)", () => {
    expect(String(fullMsg(withRh(carryoverAsset("2023-01-01", "2010-01-01"))) ?? "")).not.toMatch(/보유기간 2년 이상이 필요합니다/);
  });
  it("대조(불변) — 매매 취득일 2023-01-01 → 보유 2년 미달 acquisitionDate", () => {
    const { result, fieldOf } = run(withRh(purchaseAsset("2023-01-01")), true);
    expect(String(result)).toMatch(/\(취득일~양도일/);
    expect(String(result)).toMatch(/보유기간 2년 이상이 필요합니다/);
    expect(fieldOf(String(result))).toBe("acquisitionDate");
  });

  it("🔑 카드 상태 leaf `rentalResidenceRequirementStatus.holding`: 등기접수일 기준 (양방향·잔재 빔)", () => {
    const years = (a: AssetForm) => rentalResidenceRequirementStatus(rh(), a, 0, TRANSFER, {}).holding?.years;
    expect(years(carryoverAsset("2010-01-01", "2023-01-01"))).toBe(1);
    expect(years(carryoverAsset("2023-01-01", "2010-01-01"))).toBe(14);
    expect(years(carryoverAsset("", "2010-01-01"))).toBe(14);
    expect(years(carryoverAsset("2023-01-01", "2023-01-01"))).toBe(1);
    expect(years(purchaseAsset("2010-01-01"))).toBe(14); // 대조(불변)
  });
  it("상생임대 ①1호 날짜 하한(`calcRentalResidenceFacts`)은 같은 leaf를 쓴다 — 함수 호출이 터지지 않고 등기접수일 자산에서 정의된다", () => {
    const a = carryoverAsset("2010-01-01", "2023-01-01");
    expect(() => calcRentalResidenceFacts(formOf(a), a, 0)).not.toThrow();
  });
});
