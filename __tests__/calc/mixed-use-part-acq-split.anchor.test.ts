/**
 * anchor: 겸용 **별개 취득 파트 모델**(B1) UI 어댑터 — ① 폼 ② initial ③ normalize ④ API ⑥ 사이드바 ⑧ validate (+ ⑫ 거울).
 *
 * 설계: `docs/02-design/features/mixed-use-separate-acq-per-part.ui.design.md` §2.1·§5 · 엔진 설계 §11 회신(U-1~U-4).
 *
 * 규약
 *  · 판정 규칙은 엔진 leaf(`lib/tax-engine/mixed-use-part-acq.ts`)에만 있다. 이 파일의 **기대값은 leaf를 이 테스트가 독립으로 다시 호출**해 얻는다
 *    (어댑터가 인자를 틀리게 만들면 여기서 갈린다 — 라이브러리 anchor ≠ 배선 증명이라, ④ 페이로드·⑧·Zod ⑫를 같은 격자에서 대조한다).
 *  · 미노출/미전송 단언에는 긍정 단언이 짝으로 있다(`feedback_negative_anchor_needs_positive_twin`).
 *  · fixture는 가상(실제 신고 사례 아님).
 */
import { describe, it, expect } from "vitest";
import {
  buildMixedSeparateAcquisition,
  isMixedUsePerPartAcq,
  isMixedUsePerPartCandidate,
  mixedAnyPartActual,
  mixedAnyPartEstimated,
  mixedBuildingContractActive,
  mixedBuildingContractCommercialDerived,
  mixedPartAcqNeedsOfForm,
  mixedPartAcqSum,
  mixedPartModes,
  mixedUsePhdEffective,
} from "@/lib/calc/mixed-use-part-acq-split";
import { mixedPartAcqNeeds } from "@/lib/tax-engine/mixed-use-part-acq";
import type { PartAcqMode } from "@/lib/calc/transfer-tax-split-acq-mode";
import { buildMixedUsePayload } from "@/lib/calc/transfer-tax-api-mixed-use";
import { validateMixedUseAsset } from "@/lib/calc/transfer-tax-validate-mixed-use-asset";
import { collectWithFields } from "@/lib/calc/transfer-tax-validate-field";
import { mixedUseAssetSchema } from "@/lib/api/transfer-tax-schema-mixed-use";
import { createDefaultTransferFormData, computeTransferSummary, mergePersistedWizard } from "@/lib/stores/calc-wizard-store";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset, migrateAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { mixedUseDisplayedAcqPrice } from "@/lib/calc/mixed-use-part-acq-split";
import { mixedUseToFilingResult } from "@/components/calc/results/mixed-use/MixedUseResultCardAdapter";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import type { TransferAPIResult } from "@/lib/calc/transfer-tax-api";

const TRANSFER_DATE = "2024-08-20";

/** 별개 취득 + 파트 모델 ON + 양쪽 실거래가(주택 100㎡·상가 100㎡·대지 200㎡). 취득시 기준시가는 의도적으로 채워 둔다 — 쓰이지 않으면 미전송이어야 한다. */
function pp(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    isMixedUseHouse: true,
    acquisitionCause: "purchase",
    hasSeperateLandAcquisitionDate: true,
    landAcquisitionDate: "2005-06-10",
    acquisitionDate: "2010-03-15",
    mixedAcqPerPartMode: true,
    residentialFloorArea: "100",
    nonResidentialFloorArea: "100",
    buildingFootprintArea: "100",
    mixedUseTotalLandArea: "200",
    mixedTransferHousingPrice: "1,600,000,000",
    mixedTransferCommercialBuildingPrice: "100,000,000",
    mixedTransferLandPricePerSqm: "12,000,000",
    mixedTransferHousingBuildingStdPrice: "800,000,000",
    mixedAcqHousingPrice: "400,000,000",
    mixedAcqCommercialBuildingPrice: "80,000,000",
    mixedAcqLandPricePerSqm: "1,200,000",
    mixedAcqLandPricePerSqmAtBuildingAcq: "1,800,000",
    mixedAcqHousingBuildingStdPrice: "320,000,000",
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "500,000,000",
    buildingAcquisitionPrice: "400,000,000",
    ...over,
  } as AssetForm;
}
function formOf(a: AssetForm, extra: Partial<TransferFormData> = {}): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    transferDate: TRANSFER_DATE,
    contractTotalPrice: "3,000,000,000",
    assets: [a],
    ...extra,
  } as unknown as TransferFormData;
}
type Sent = {
  separateAcquisition?: Record<string, unknown>;
  useActualAcquisition?: boolean;
  useAppraisalSalesAcquisition?: boolean;
  acquisitionActualTotalPrice?: number;
  usePreHousingDisclosure?: boolean;
  preHousingDisclosure?: unknown;
  housingInheritedExpense?: number;
  commercialInheritedExpense?: number;
  capitalExpenditure?: number;
  acquisitionStandardPrice: {
    housingPrice?: number;
    housingBuildingPrice?: number;
    landPricePerSqmAtBuildingAcq?: number;
    commercialBuildingPrice: number;
    landPricePerSqm: number;
  };
};
const payload = (a: AssetForm, extra: Partial<TransferFormData> = {}) =>
  buildMixedUsePayload(a, formOf(a, extra)) as unknown as Sent;
function validated(a: AssetForm): { msg: string | null; field: string | undefined } {
  const { result, fieldOf } = collectWithFields(() => validateMixedUseAsset(a, "자산", TRANSFER_DATE));
  return { msg: result, field: result ? (fieldOf(result) as string | undefined) : undefined };
}

const MODES: PartAcqMode[] = ["actual", "estimated", "appraisal", "salesCase"];
const PRICE_KEY = (m: PartAcqMode, part: "land" | "building") =>
  part === "land"
    ? m === "salesCase" ? "landSalesCaseValue" : "landAcquisitionPrice"
    : m === "salesCase" ? "buildingSalesCaseValue" : "buildingAcquisitionPrice";

// ═══════════════════════════════════════════════════════════════════════
describe("술어 격자 — 후보(날짜) ∧ 토글(모델) (겸용 × 취득원인 × chip × 날짜 × 토글)", () => {
  const cells: Array<{ name: string; over: Partial<AssetForm>; candidate: boolean; perPart: boolean }> = [];
  for (const mixed of [true, false])
    for (const cause of ["purchase", "inheritance", "gift"] as const)
      for (const chip of [true, false])
        for (const dates of ["differ", "same", "landEmpty"] as const)
          for (const toggle of [true, false, undefined]) {
            const candidate = mixed && cause === "purchase" && chip && dates === "differ";
            cells.push({
              name: [mixed ? "겸용" : "비겸용", cause, chip ? "chip ON" : "chip OFF", dates, `toggle=${String(toggle)}`].join(" · "),
              over: {
                isMixedUseHouse: mixed,
                acquisitionCause: cause,
                hasSeperateLandAcquisitionDate: chip,
                landAcquisitionDate: dates === "differ" ? "2005-06-10" : dates === "same" ? "2010-03-15" : "",
                mixedAcqPerPartMode: toggle as boolean,
              },
              candidate,
              perPart: candidate && toggle === true,
            });
          }
  it.each(cells.map((c) => [c.name, c] as const))("%s", (_n, c) => {
    const a = pp(c.over);
    expect(isMixedUsePerPartCandidate(a)).toBe(c.candidate);
    expect(isMixedUsePerPartAcq(a)).toBe(c.perPart);
  });
  it("격자가 공허하지 않다 — 후보 3셀(토글 3값) · 파트 모델 1셀", () => {
    expect(cells.filter((c) => c.candidate)).toHaveLength(3);
    expect(cells.filter((c) => c.perPart)).toHaveLength(1);
  });
  it("접근부 가드 — 필드 부재(stale·구 이력)는 파트 모델이 아니다(`=== true`)", () => {
    const a = pp() as Partial<AssetForm>;
    delete a.mixedAcqPerPartMode;
    expect(isMixedUsePerPartCandidate(a as AssetForm)).toBe(true);
    expect(isMixedUsePerPartAcq(a as AssetForm)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
describe("②③ initial ↔ normalize — 비대칭은 의도다 (신규 true / 부재 false)", () => {
  it("신규 자산 factory → true · 계약액 토글 false · 계약액 값 \"\"", () => {
    const a = makeDefaultAsset(1);
    expect(a.mixedAcqPerPartMode).toBe(true);
    expect(a.mixedAcqBuildingContractSplit).toBe(false);
    expect(a.mixedAcqHousingBuildingContractPrice).toBe("");
  });
  it("migrateAsset — 필드 부재(구 이력)는 false로 세운다 (factory 채움보다 먼저 — true로 뒤집히면 구 이력이 모델을 바꾼다)", () => {
    const raw = { ...makeDefaultAsset(1) } as unknown as Record<string, unknown>;
    delete raw.mixedAcqPerPartMode;
    delete raw.mixedAcqBuildingContractSplit;
    delete raw.mixedAcqHousingBuildingContractPrice;
    const m = migrateAsset(raw);
    expect(m.mixedAcqPerPartMode).toBe(false);
    expect(m.mixedAcqBuildingContractSplit).toBe(false);
    expect(m.mixedAcqHousingBuildingContractPrice).toBe("");
  });
  it("migrateAsset 양성 짝 — 저장된 true는 true 그대로, false는 false 그대로", () => {
    expect(migrateAsset({ ...makeDefaultAsset(1), mixedAcqPerPartMode: true }).mixedAcqPerPartMode).toBe(true);
    expect(migrateAsset({ ...makeDefaultAsset(1), mixedAcqPerPartMode: false }).mixedAcqPerPartMode).toBe(false);
  });
  it("sessionStorage rehydrate(mergePersistedWizard) — 부재 기록은 false, 현행 기록은 보존", () => {
    const legacyAsset = { ...makeDefaultAsset(1) } as unknown as Record<string, unknown>;
    delete legacyAsset.mixedAcqPerPartMode;
    const current = { ...makeDefaultAsset(1), assetId: "a2", mixedAcqPerPartMode: true };
    const merged = mergePersistedWizard(
      { formData: { ...createDefaultTransferFormData(), assets: [legacyAsset, current] } },
      { formData: createDefaultTransferFormData() } as never,
    );
    expect(merged.formData.assets[0].mixedAcqPerPartMode).toBe(false);
    expect(merged.formData.assets[1].mixedAcqPerPartMode).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
describe("파생 leaf — mixedPartModes · PHD 실효 · 계약액", () => {
  it("모드 파생 — 파트 라디오가 비면 레거시 3플래그에서(표시 폴백, store에 쓰지 않는다)", () => {
    const a = pp({ landAcqMode: "", buildingAcqMode: "", useEstimatedAcquisition: true });
    expect(mixedPartModes(a)).toEqual({ land: "estimated", building: "estimated" });
    expect(a.landAcqMode).toBe(""); // 파생만 — 기록 없음
    expect(mixedPartModes(pp({ landAcqMode: "appraisal", buildingAcqMode: "salesCase" }))).toEqual({ land: "appraisal", building: "salesCase" });
  });
  it("PHD 실효 = 저장값 ∧ 환산 파트 있음(파트 모델) — 총액 모델은 저장값 그대로", () => {
    expect(mixedUsePhdEffective(pp({ usePreHousingDisclosure: true }))).toBe(false); // 실/실 — 소비처 없음
    expect(mixedUsePhdEffective(pp({ usePreHousingDisclosure: true, buildingAcqMode: "estimated" }))).toBe(true); // 긍정 짝
    expect(mixedUsePhdEffective(pp({ usePreHousingDisclosure: false, buildingAcqMode: "estimated" }))).toBe(false);
    expect(mixedUsePhdEffective(pp({ usePreHousingDisclosure: true, mixedAcqPerPartMode: false }))).toBe(true); // 총액 모델 불변
  });
  it("계약액 — 건물 실거래가 ∧ 토글 ON일 때만 활성, 파생 상가분 = 총액 − 주택건물", () => {
    const on = pp({ mixedAcqBuildingContractSplit: true, mixedAcqHousingBuildingContractPrice: "150,000,000" });
    expect(mixedBuildingContractActive(on)).toBe(true);
    expect(mixedBuildingContractCommercialDerived(on)).toBe(250_000_000);
    expect(mixedBuildingContractActive(pp({ mixedAcqBuildingContractSplit: false }))).toBe(false);
    expect(mixedBuildingContractActive({ ...on, buildingAcqMode: "appraisal" })).toBe(false);
    expect(mixedBuildingContractCommercialDerived({ ...on, buildingAcqMode: "appraisal" })).toBeNull();
    // 계약액 ≥ 총액이면 도출하지 않는다(⑧이 막는다)
    expect(mixedBuildingContractCommercialDerived({ ...on, mixedAcqHousingBuildingContractPrice: "400,000,000" })).toBeNull();
    expect(mixedBuildingContractCommercialDerived({ ...on, mixedAcqHousingBuildingContractPrice: "" })).toBeNull();
  });
  it("any-actual / any-estimated", () => {
    expect([mixedAnyPartActual(pp()), mixedAnyPartEstimated(pp())]).toEqual([true, false]);
    expect([mixedAnyPartActual(pp({ landAcqMode: "appraisal", buildingAcqMode: "salesCase" })), mixedAnyPartEstimated(pp({ landAcqMode: "estimated" }))]).toEqual([false, true]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
describe("④ API 변환 — separateAcquisition 명시 매핑 (U-2·U-4)", () => {
  it("실가/실가 — 서브객체 · 계약액 키 없음 · 총액 플래그 false/미전송 · stale 총액 무시", () => {
    const a = pp({ useEstimatedAcquisition: true, fixedAcquisitionPrice: "999,999,999", isAppraisalAcquisition: true });
    // 파트 라디오가 명시돼 있으므로 레거시 3플래그(stale)는 모드에 영향이 없다
    const p = payload(a);
    expect(p.separateAcquisition).toEqual({
      landMode: "actual",
      buildingMode: "actual",
      landAcquisitionPrice: 500_000_000,
      buildingAcquisitionPrice: 400_000_000,
    });
    expect(p.useActualAcquisition).toBe(false);
    expect(p.useAppraisalSalesAcquisition).toBe(false);
    expect(p.acquisitionActualTotalPrice).toBeUndefined();
  });
  it("총액 모델(토글 OFF)은 키 자체가 없다 + 레거시 경로는 종전대로", () => {
    const a = pp({ mixedAcqPerPartMode: false, fixedAcquisitionPrice: "700,000,000", landAcqMode: "", buildingAcqMode: "" });
    const p = payload(a);
    expect("separateAcquisition" in p).toBe(false);
    expect(p.useActualAcquisition).toBe(true);
    expect(p.acquisitionActualTotalPrice).toBe(700_000_000);
  });
  it.each([
    ["감정", "appraisal", "buildingAcquisitionPrice"],
    ["매매사례", "salesCase", "buildingSalesCaseValue"],
  ] as const)("건물 %s — 값은 그 모드의 키에만 실린다(다른 키의 stale 차단)", (_n, mode, key) => {
    const a = pp({ buildingAcqMode: mode, buildingSalesCaseValue: "333,000,000", buildingAcquisitionPrice: "444,000,000" });
    const sep = payload(a).separateAcquisition!;
    expect(sep.buildingMode).toBe(mode);
    expect(sep[key]).toBe(mode === "salesCase" ? 333_000_000 : 444_000_000);
    const other = mode === "salesCase" ? "buildingAcquisitionPrice" : "buildingSalesCaseValue";
    expect(other in sep).toBe(false);
  });
  it("환산 파트 — 가액 키 없음(stale 값이 있어도)", () => {
    const sep = payload(pp({ landAcqMode: "estimated", landAcquisitionPrice: "500,000,000", landSalesCaseValue: "1" })).separateAcquisition!;
    expect(sep.landMode).toBe("estimated");
    expect("landAcquisitionPrice" in sep || "landSalesCaseValue" in sep).toBe(false);
  });
  it("계약액 — 토글 ON ∧ 건물 실가일 때만. OFF·비실가면 값이 남아도 미전송 (+ 건물 실가 복귀 시 복원)", () => {
    const base = { mixedAcqHousingBuildingContractPrice: "150,000,000" } as Partial<AssetForm>;
    expect(payload(pp({ ...base, mixedAcqBuildingContractSplit: true })).separateAcquisition!.housingBuildingContractPrice).toBe(150_000_000);
    expect("housingBuildingContractPrice" in payload(pp({ ...base, mixedAcqBuildingContractSplit: false })).separateAcquisition!).toBe(false);
    expect("housingBuildingContractPrice" in payload(pp({ ...base, mixedAcqBuildingContractSplit: true, buildingAcqMode: "appraisal" })).separateAcquisition!).toBe(false);
  });
  it("U-2 실비 — 실거래가 파트가 있으면 mixedHousing·CommercialActualExpense → 엔진 housing·commercialInheritedExpense (침묵 소실 없음)", () => {
    const a = pp({ mixedHousingActualExpense: "3,000,000", mixedCommercialActualExpense: "2,000,000", mixedHousingInheritedExpense: "9,999", mixedHousingGiftExpense: "8,888" });
    const p = payload(a);
    expect(p.housingInheritedExpense).toBe(3_000_000);
    expect(p.commercialInheritedExpense).toBe(2_000_000);
    // 긍정 짝 아님 — 두 파트 모두 비-실가면 카드가 숨으므로 싣지 않는다
    const none = payload(pp({ landAcqMode: "appraisal", buildingAcqMode: "salesCase", mixedHousingActualExpense: "3,000,000" }));
    expect(none.housingInheritedExpense).toBeUndefined();
  });
  it("PHD — 환산 파트가 없으면 stale PHD를 보내지 않는다 / 환산 파트가 있으면 PHD 3시점 객체를 싣는다", () => {
    const phdFields: Partial<AssetForm> = {
      usePreHousingDisclosure: true,
      phdFirstDisclosureDate: "2005-04-30",
      phdFirstDisclosureHousingPrice: "200,000,000",
      phdLandPricePerSqmAtFirst: "1,500,000",
      phdLandPricePerSqmAtAcq: "1,000,000",
      phdBuildingStdPriceAtAcq: "40,000,000",
    };
    const none = payload(pp(phdFields));
    expect(none.usePreHousingDisclosure).toBe(false);
    expect(none.preHousingDisclosure).toBeUndefined();
    const est = payload(pp({ ...phdFields, buildingAcqMode: "estimated" }));
    expect(est.usePreHousingDisclosure).toBe(true);
    expect(est.preHousingDisclosure).toBeDefined();
  });
  it("지분 60% — 절대금액 5종만 스케일(기준시가·면적은 100%)", () => {
    const a = pp({
      ownershipNumerator: "60",
      ownershipDenominator: "100",
      mixedAcqBuildingContractSplit: true,
      mixedAcqHousingBuildingContractPrice: "150,000,000",
    } as Partial<AssetForm>);
    const p = payload(a);
    expect(p.separateAcquisition).toMatchObject({
      landAcquisitionPrice: 300_000_000,
      buildingAcquisitionPrice: 240_000_000,
      housingBuildingContractPrice: 90_000_000,
    });
  });
  it("buildMixedSeparateAcquisition — 파트 모델이 아니면 undefined", () => {
    expect(buildMixedSeparateAcquisition(pp({ mixedAcqPerPartMode: false }))).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ⑤ 노출 술어(mixedPartAcqNeedsOfForm) ⇔ ④ 전송 ⇔ ⑧ 필수 ⇔ ⑫ Zod — 한 격자
describe("⑤⇔④⇔⑧⇔⑫ — 취득시 H·B0·나목·상가 취득시 기준시가 (모드 16 × 계약액 × 경비 선언)", () => {
  interface Cell { name: string; a: AssetForm; land: PartAcqMode; building: PartAcqMode; contract: boolean; expense: boolean }
  const GRID: Cell[] = [];
  for (const land of MODES)
    for (const building of MODES)
      for (const contract of [false, true])
        for (const expense of [false, true]) {
          if (contract && building !== "actual") continue; // 계약액은 건물 실거래가 한정(S-2)
          const over: Partial<AssetForm> = {
            landAcqMode: land,
            buildingAcqMode: building,
            ...(land === "estimated" ? {} : { [PRICE_KEY(land, "land")]: "500,000,000" }),
            ...(building === "estimated" ? {} : { [PRICE_KEY(building, "building")]: "400,000,000" }),
            ...(contract ? { mixedAcqBuildingContractSplit: true, mixedAcqHousingBuildingContractPrice: "150,000,000" } : {}),
            ...(expense ? { capitalExpenditure: "10,000,000" } : {}),
          };
          GRID.push({ name: `토지 ${land} · 건물 ${building}${contract ? " · 계약액" : ""}${expense ? " · 경비" : ""}`, a: pp(over), land, building, contract, expense });
        }

  /** 독립 도출 — 어댑터를 거치지 않고 leaf를 직접 호출한다. */
  const expected = (c: Cell) =>
    mixedPartAcqNeeds({ modes: { land: c.land, building: c.building }, usePhd: false, expenseDeclared: c.expense, buildingContractDeclared: c.contract });

  it("격자 크기 고정(공허 방지) — 모드 16 × 경비 2(계약액 없음) + 건물 실거래가 4 × 경비 2(계약액) = 40셀", () => {
    expect(GRID).toHaveLength(40);
  });

  it.each(GRID.map((g) => [g.name, g] as const))("⑤ 노출 술어 = leaf · ④ 전송 키 = 술어 · %s", (_n, c) => {
    const need = expected(c);
    expect(mixedPartAcqNeedsOfForm(c.a)).toEqual(need);
    const p = payload(c.a);
    expect("housingPrice" in p.acquisitionStandardPrice && p.acquisitionStandardPrice.housingPrice !== undefined).toBe(need.housingPriceAtAcq);
    expect("landPricePerSqmAtBuildingAcq" in p.acquisitionStandardPrice).toBe(need.landPricePerSqmAtBuildingDay);
    expect("housingBuildingPrice" in p.acquisitionStandardPrice).toBe(need.housingBuildingStdAtAcq);
  });

  it.each(GRID.map((g) => [g.name, g] as const))("⑧ 필수 — 술어 참이면 그 칸으로 차단 · 거짓이면 요구하지 않는다 · %s", (_n, c) => {
    const need = expected(c);
    // 기준: 모든 칸이 채워진 셀은 ⑧을 통과한다
    expect(validated(c.a).msg, `채운 셀이 ⑧을 통과해야 한다: ${validated(c.a).msg}`).toBeNull();
    // 칸을 하나씩 비운다 — 술어가 참인 칸만 막고, 막으면 그 칸의 data-field로 이동한다
    const blank = (patch: Partial<AssetForm>) => validated({ ...c.a, ...patch });
    expect(blank({ mixedAcqHousingPrice: "" }).field === "mixedAcqHousingPrice").toBe(need.housingPriceAtAcq);
    expect(blank({ mixedAcqHousingBuildingStdPrice: "" }).field === "mixedAcqHousingBuildingStdPrice").toBe(need.housingBuildingStdAtAcq);
    // B0는 H가 있을 때만 필수(기존 술어의 `housingPrice > 0` 게이트 — H가 비면 H가 먼저 막는다)
    expect(blank({ mixedAcqLandPricePerSqmAtBuildingAcq: "" }).field === "mixedAcqLandPricePerSqmAtBuildingAcq").toBe(need.landPricePerSqmAtBuildingDay);
    const commBlank = blank({ mixedAcqCommercialBuildingPrice: "" });
    expect(commBlank.field === "mixedAcqCommercialBuildingPrice").toBe(need.commercialStdAtAcq);
    // 쓰이지 않는 칸을 비워도 통과(양쪽 실가 + 계약액이면 취득시 기준시가 4칸 전부 불요)
    if (!need.housingPriceAtAcq && !need.housingBuildingStdAtAcq && !need.commercialStdAtAcq) {
      expect(blank({ mixedAcqHousingPrice: "", mixedAcqHousingBuildingStdPrice: "", mixedAcqCommercialBuildingPrice: "", mixedAcqLandPricePerSqm: "", mixedAcqLandPricePerSqmAtBuildingAcq: "" }).msg).toBeNull();
    }
  });

  it.each(GRID.map((g) => [g.name, g] as const))("⑫ Zod — 채운 셀은 통과 · 필수 칸을 비우면 해당 경로로 400 · %s", (_n, c) => {
    const paths = (a: AssetForm) => {
      const r = mixedUseAssetSchema.safeParse(JSON.parse(JSON.stringify(payload(a))));
      return r.success ? [] : r.error.issues.map((i) => i.path.join("."));
    };
    expect(paths(c.a)).toEqual([]);
    const need = expected(c);
    const blanked = paths({ ...c.a, mixedAcqHousingBuildingStdPrice: "", mixedAcqHousingPrice: "", mixedAcqCommercialBuildingPrice: "", mixedAcqLandPricePerSqm: "" } as AssetForm);
    expect(blanked.includes("acquisitionStandardPrice.housingBuildingPrice")).toBe(need.housingBuildingStdAtAcq);
    expect(blanked.includes("acquisitionStandardPrice.housingPrice")).toBe(need.housingPriceAtAcq);
    expect(blanked.includes("acquisitionStandardPrice.commercialBuildingPrice")).toBe(need.commercialStdAtAcq);
  });
});

describe("PHD 실효값 — stale PHD + 환산 파트 없음에서도 ⑤⇔④⇔⑧⇔⑫가 같은 술어를 본다", () => {
  // 감정 파트가 있어 취득시 H·B0·나목이 필수인데, 저장된 PHD(환산 파트가 없어 소비처 없음)가 필수 술어를 끄면 안 된다.
  const a = pp({ landAcqMode: "appraisal", usePreHousingDisclosure: true });
  it("④ — PHD 미전송 · H·B0·나목 전송", () => {
    const p = payload(a);
    expect(p.usePreHousingDisclosure).toBe(false);
    expect(p.acquisitionStandardPrice.housingPrice).toBe(400_000_000);
    expect(p.acquisitionStandardPrice.landPricePerSqmAtBuildingAcq).toBe(1_800_000);
    expect(p.acquisitionStandardPrice.housingBuildingPrice).toBe(320_000_000);
  });
  it("⑧ — B0·나목 미입력이면 막는다(raw PHD로 꺼지지 않는다) / ⑫ — 같은 입력을 같이 막는다", () => {
    expect(validated({ ...a, mixedAcqLandPricePerSqmAtBuildingAcq: "" }).field).toBe("mixedAcqLandPricePerSqmAtBuildingAcq");
    expect(validated({ ...a, mixedAcqHousingBuildingStdPrice: "" }).field).toBe("mixedAcqHousingBuildingStdPrice");
    expect(validated(a).msg).toBeNull();
    const blanked = { ...a, mixedAcqLandPricePerSqmAtBuildingAcq: "", mixedAcqHousingBuildingStdPrice: "" } as AssetForm;
    const r = mixedUseAssetSchema.safeParse(JSON.parse(JSON.stringify(payload(blanked))));
    const paths = r.success ? [] : r.error.issues.map((i) => i.path.join("."));
    expect(paths).toContain("acquisitionStandardPrice.landPricePerSqmAtBuildingAcq");
    expect(paths).toContain("acquisitionStandardPrice.housingBuildingPrice");
  });
});

// ═══════════════════════════════════════════════════════════════════════
describe("⑧ validate — 파트 값 · 계약액 · 결합 제외 (입력칸 이동 키)", () => {
  it("M1 토지 실거래가 비움 → landAcquisitionPrice / M2 토지 매매사례 비움 → landSalesCaseValue", () => {
    const m1 = validated(pp({ landAcquisitionPrice: "" }));
    expect(m1.field).toBe("landAcquisitionPrice");
    expect(m1.msg).toContain("나머지 금액에서 자동 계산되지 않습니다");
    expect(validated(pp({ landAcqMode: "salesCase", landSalesCaseValue: "" })).field).toBe("landSalesCaseValue");
    // 긍정 짝 — 채우면 통과
    expect(validated(pp({ landAcqMode: "salesCase", landSalesCaseValue: "500,000,000" })).msg).toBeNull();
  });
  it("M3 건물 감정·매매사례 비움 → buildingAcquisitionPrice / buildingSalesCaseValue", () => {
    expect(validated(pp({ buildingAcqMode: "appraisal", buildingAcquisitionPrice: "" })).field).toBe("buildingAcquisitionPrice");
    expect(validated(pp({ buildingAcqMode: "salesCase", buildingSalesCaseValue: "" })).field).toBe("buildingSalesCaseValue");
  });
  it("M4 계약액 — 토글 ON + 미입력 / 총액 이상 → mixedAcqHousingBuildingContractPrice, 정상값은 통과", () => {
    const on = { mixedAcqBuildingContractSplit: true } as Partial<AssetForm>;
    expect(validated(pp({ ...on, mixedAcqHousingBuildingContractPrice: "" })).field).toBe("mixedAcqHousingBuildingContractPrice");
    const ge = validated(pp({ ...on, mixedAcqHousingBuildingContractPrice: "400,000,000" }));
    expect(ge.field).toBe("mixedAcqHousingBuildingContractPrice");
    expect(ge.msg).toContain("건물 취득가액보다 작아야");
    expect(validated(pp({ ...on, mixedAcqHousingBuildingContractPrice: "150,000,000" })).msg).toBeNull();
    // 토글 OFF면 값이 남아도(≥ 총액) 요구·검증하지 않는다 — 입력칸이 없는 값으로 막지 않는다
    expect(validated(pp({ mixedAcqBuildingContractSplit: false, mixedAcqHousingBuildingContractPrice: "999,999,999" })).msg).toBeNull();
  });
  it("M5 경비 선언이 H를 요구한다 — 메시지가 원인(경비 입력)을 말하고 H 칸으로 이동한다", () => {
    const base = pp({ mixedAcqBuildingContractSplit: true, mixedAcqHousingBuildingContractPrice: "150,000,000", mixedAcqHousingPrice: "" });
    expect(validated(base).msg).toBeNull(); // 경비 없음 — H 불요
    const exp = validated({ ...base, capitalExpenditure: "10,000,000" });
    expect(exp.field).toBe("mixedAcqHousingPrice");
    expect(exp.msg).toMatch(/자본적지출 또는 주택분·상가분 실제 필요경비를 입력하셨으므로/);
    // 주택분 실비 카드 입력도 선언이다(U-1) — 양도비는 선언이 아니다
    expect(validated({ ...base, mixedHousingActualExpense: "3,000,000" }).field).toBe("mixedAcqHousingPrice");
    expect(validated({ ...base, transferExpense: "3,000,000" }).msg).toBeNull();
    // 비-실가 파트가 있으면 사유가 다르다
    const nonActual = validated({ ...base, buildingAcqMode: "appraisal", buildingAcquisitionPrice: "400,000,000" });
    expect(nonActual.field).toBe("mixedAcqHousingPrice");
    expect(nonActual.msg).toMatch(/실거래가가 아니어서/);
  });
  it("M6 결합 제외 X-1 용도변경 · X-2 공익수용 → 모델 토글(mixedAcqPerPartMode)로 이동 · 토글 OFF(총액 모델)는 이 오류를 내지 않는다", () => {
    const x1 = validated(pp({ hasPartialUsageChange: true, partialChangeDirection: "house_to_commercial", partialChangeDate: "2020-01-01" }));
    expect(x1.field).toBe("mixedAcqPerPartMode");
    expect(x1.msg).toMatch(/용도변경/);
    const x2 = validated(pp({ transferCause: "public_expropriation" }));
    expect(x2.field).toBe("mixedAcqPerPartMode");
    // 토글 OFF — 막다른 길 아님(해소 경로). 총액 모델은 파트 오류가 아니라 기존 검증을 탄다
    const off = validated(pp({ mixedAcqPerPartMode: false, hasPartialUsageChange: true, partialChangeDirection: "house_to_commercial", partialChangeDate: "2020-01-01" }));
    expect(off.field).not.toBe("mixedAcqPerPartMode");
  });
  it("PHD — 환산 파트 없는 stale PHD는 요구하지 않는다 / 환산 파트가 있으면 PHD 입력을 요구한다", () => {
    const stale = pp({ usePreHousingDisclosure: true }); // 최초 고시일 등 PHD 입력 전무
    expect(validated(stale).msg).toBeNull();
    const live = validated(pp({ usePreHousingDisclosure: true, buildingAcqMode: "estimated", acquisitionDate: "2000-01-01" }));
    expect(live.msg).not.toBeNull();
    expect(live.field).toBe("phdFirstDisclosureDate");
  });
  it("총액 모델(토글 OFF) 요구는 종전 그대로 — 총액 칸·H·상가 취득시 기준시가", () => {
    const off = pp({ mixedAcqPerPartMode: false, landAcqMode: "", buildingAcqMode: "", fixedAcquisitionPrice: "" });
    expect(validated(off).field).toBe("fixedAcquisitionPrice");
  });
});

// ═══════════════════════════════════════════════════════════════════════
describe("⑥ 사이드바 합계 — 파트 값 합 · 환산 파트면 계산 후 표시 · 숨은 총액 무시", () => {
  const sum = (a: AssetForm) => computeTransferSummary(formOf(a), null).totalAcqPrice;
  const row = (a: AssetForm) => computeTransferPerAssetSummary(formOf(a), null).rows[0];
  it("자산별 행(두 번째 사이드바 지점) — 파트 값 합 · stale 총액 무시 · 환산 파트면 계산 후 표시(acqPending)", () => {
    expect(row(pp({ fixedAcquisitionPrice: "999,999,999" })).acqPrice).toBe(900_000_000);
    expect(row(pp({ fixedAcquisitionPrice: "999,999,999" })).acqPending).toBe(false);
    const est = row(pp({ buildingAcqMode: "estimated", fixedAcquisitionPrice: "999,999,999" }));
    expect(est.acqPrice).toBe(0);
    expect(est.acqPending).toBe(true);
    // 총액 모델 짝 — 종전대로 총액 칸
    expect(row(pp({ mixedAcqPerPartMode: false, landAcqMode: "", buildingAcqMode: "", fixedAcquisitionPrice: "700,000,000" })).acqPrice).toBe(700_000_000);
  });
  it("실가/실가 — 토지 + 건물 (stale 총액 fixedAcquisitionPrice는 무시)", () => {
    expect(sum(pp({ fixedAcquisitionPrice: "999,999,999" }))).toBe(900_000_000);
  });
  it("감정/매매사례 혼합도 파트 값 합", () => {
    expect(sum(pp({ landAcqMode: "appraisal", buildingAcqMode: "salesCase", buildingSalesCaseValue: "350,000,000" }))).toBe(850_000_000);
  });
  it("환산 파트가 있으면 부분합을 총액으로 오독하지 않는다 — 0(계산 후 표시)", () => {
    expect(sum(pp({ buildingAcqMode: "estimated" }))).toBe(0);
    expect(mixedPartAcqSum(pp({ buildingAcqMode: "estimated" })).pending).toBe(true);
  });
  it("총액 모델(토글 OFF)은 종전대로 총액 칸을 쓴다 — 긍정 짝", () => {
    expect(sum(pp({ mixedAcqPerPartMode: false, landAcqMode: "", buildingAcqMode: "", fixedAcquisitionPrice: "700,000,000" }))).toBe(700_000_000);
  });
});

describe("⑥ 사이드바 ↔ ⑦ 결과 — §97②2호 단서가 나목을 채택해도 같은 취득가액 (단일 소스 mixedUseDisplayedAcqPrice)", () => {
  // pp()와 같은 수치의 엔진 입력 — 토지 실거래가 500M / 건물 환산, 자본적지출이 커서 환산 파트 묶음 단서가 나목(직접 경비)을 채택한다.
  const D = (s: string) => new Date(s);
  function engineInput(capex: number): MixedUseAssetInput {
    return {
      isMixedUseHouse: true,
      residentialFloorArea: 100,
      nonResidentialFloorArea: 100,
      buildingFootprintArea: 100,
      totalLandArea: 200,
      landAcquisitionDate: D("2005-06-10"),
      buildingAcquisitionDate: D("2010-03-15"),
      transferStandardPrice: { housingPrice: 1_600_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 12_000_000, housingBuildingPrice: 800_000_000 },
      acquisitionStandardPrice: { housingPrice: 400_000_000, commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_200_000, landPricePerSqmAtBuildingAcq: 1_800_000, housingBuildingPrice: 320_000_000 },
      residencePeriodYears: 0,
      isMetropolitanArea: true,
      zoneType: "general_residential",
      isOneHouseExempt: false,
      capitalExpenditure: capex,
      separateAcquisition: { landMode: "actual", buildingMode: "estimated", landAcquisitionPrice: 500_000_000 },
    } as unknown as MixedUseAssetInput;
  }
  const resultOf = (capex: number) =>
    calcMixedUseTransferTax(3_000_000_000, D(TRANSFER_DATE), engineInput(capex), makeMockRates());
  const sidebarAcq = (r: ReturnType<typeof resultOf>) =>
    computeTransferPerAssetSummary(
      formOf(pp({ buildingAcqMode: "estimated", buildingAcquisitionPrice: "" })),
      { mode: "mixed-use", result: r } as unknown as TransferAPIResult,
    ).rows[0].acqPrice;

  it("단서 나목 채택 — 사이드바 = 결과 카드 어댑터 = echo 4부분 합(500,000,000), 단서 전 합(estimatedAcquisitionPrice)이 아니다", () => {
    const r = resultOf(600_000_001);
    expect(r.separateAcquisition?.provisoGroup?.chosen).toBe("direct");
    const preProviso = r.housingPart.estimatedAcquisitionPrice + r.commercialPart.estimatedAcquisitionPrice;
    expect(preProviso).not.toBe(500_000_000); // 구별력 — 두 값이 갈리는 조합이다
    expect(mixedUseDisplayedAcqPrice(r)).toBe(500_000_000); // 토지 실가 500M + 건물 환산 파트 0(나목 채택)
    expect(sidebarAcq(r)).toBe(500_000_000);
    expect(mixedUseToFilingResult(r).estimatedBase).toBe(500_000_000); // 상세 명세서 값 칸
  });

  it("단서 가목 — 세 값이 모두 단서 전 합과 같다(긍정 짝)", () => {
    const r = resultOf(0);
    const preProviso = r.housingPart.estimatedAcquisitionPrice + r.commercialPart.estimatedAcquisitionPrice;
    expect(mixedUseDisplayedAcqPrice(r)).toBe(preProviso);
    expect(sidebarAcq(r)).toBe(preProviso);
  });
});
