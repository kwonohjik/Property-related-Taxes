/**
 * anchor(④⑧) — 배율 초과분 수용 의제·유예 사실의 와이어 값 + 유예 행 검증 (NBL2611-C4 · R16).
 * 입력은 새로 받지 않는다 — 자산-수준 `expropriationNoticeDate`와 NBL 섹션의 `nblGracePeriods` 행을 재사용한다.
 */
import { describe, it, expect } from "vitest";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { buildAppurtenantExcessFacts, housingExcessGraceApplies, housingExcessGraceIntervals } from "@/lib/calc/appurtenant-excess-facts";
import { validateHousingExcessGrace } from "@/lib/calc/transfer-tax-validate-housing-excess-grace";
import { buildExpropriationInput } from "@/lib/calc/transfer-tax-api-helpers";

const TRANSFER = "2024-09-01";
/** 주택 · 토지 1,000㎡ · 정착 100㎡ · 수도권 주거(3배) → 초과 700㎡ */
const house = (o: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2015-01-01",
    acquisitionArea: "1000",
    buildingFootprintArea: "100",
    appurtenantLandZone: "metropolitan_residential",
    ...o,
  }) as AssetForm;
const expro = { transferCause: "public_expropriation", expropriationNoticeDate: "2021-03-01" } as Partial<AssetForm>;

describe("④ buildAppurtenantExcessFacts — 사업인정 고시일(수용일 때만)", () => {
  it("양도원인 수용 + 고시일 → 고시일을 싣는다", () => {
    expect(buildAppurtenantExcessFacts(house(expro), TRANSFER)).toEqual({ expropriationNoticeDate: "2021-03-01" });
  });
  it("양도원인이 일반이면 남은 고시일(stale)을 싣지 않는다", () => {
    expect(buildAppurtenantExcessFacts(house({ transferCause: "general", expropriationNoticeDate: "2021-03-01" }), TRANSFER)).toBeUndefined();
  });
  it("수용인데 고시일 공란 → 싣지 않는다(의제 불성립 + 확인 필요는 엔진이 낸다 — 차단 안 함)", () => {
    expect(buildAppurtenantExcessFacts(house({ transferCause: "public_expropriation" }), TRANSFER)).toBeUndefined();
  });
  it("상가·일반건물도 고시일만 싣는다(영 §168의12는 주택 배율이라 유예 대상이 아니다)", () => {
    for (const assetKind of ["commercial_building", "building"] as const) {
      expect(buildAppurtenantExcessFacts(house({ ...expro, assetKind, nblGracePeriods: [{ reasonCode: "other_justifiable", anchorDate: "2020-01-01", endDate: "2020-06-01", description: "" }] }), TRANSFER)).toEqual({
        expropriationNoticeDate: "2021-03-01",
      });
    }
  });
  it("토지·겸용주택은 이 입구가 아니다", () => {
    expect(buildAppurtenantExcessFacts(house({ ...expro, assetKind: "land" }), TRANSFER)).toBeUndefined();
    expect(buildAppurtenantExcessFacts(house({ ...expro, isMixedUseHouse: true }), TRANSFER)).toBeUndefined();
  });
  it("단건·다건이 같이 쓰는 `buildExpropriationInput`이 이 값을 body에 싣는다", () => {
    expect(buildExpropriationInput(house(expro), TRANSFER)).toMatchObject({ transferCause: "public_expropriation", appurtenantExcessFacts: { expropriationNoticeDate: "2021-03-01" } });
    expect(buildExpropriationInput(house({}), TRANSFER)).not.toHaveProperty("appurtenantExcessFacts");
  });
});

describe("④ 유예기간 — 입력이 보이는 자산(초과분이 있는 주택)만", () => {
  const rows = [{ reasonCode: "use_prohibited", anchorDate: "2014-01-01", endDate: "2023-12-31", description: "" }] as AssetForm["nblGracePeriods"];
  it("초과분이 있는 주택: 행을 구간으로 풀어 싣는다(NBL 섹션과 같은 `resolveGraceIntervals`)", () => {
    const a = house({ nblGracePeriods: rows, hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2014-01-01" });
    expect(housingExcessGraceApplies(a, TRANSFER)).toBe(true);
    expect(housingExcessGraceIntervals(a, TRANSFER)).toEqual([{ startDate: "2014-01-01", endDate: "2023-12-31" }]);
    expect(buildAppurtenantExcessFacts(a, TRANSFER)).toEqual({ graceIntervals: [{ startDate: "2014-01-01", endDate: "2023-12-31" }] });
  });
  it("초과분이 없으면(한도 이내) 입력이 화면에 없으므로 남은 행을 싣지 않는다 — stale이 세액에 닿지 않는다", () => {
    const a = house({ nblGracePeriods: rows, acquisitionArea: "250" });
    expect(housingExcessGraceApplies(a, TRANSFER)).toBe(false);
    expect(buildAppurtenantExcessFacts(a, TRANSFER)).toBeUndefined();
  });
  it("양도일이 없으면 싣지 않는다", () => {
    expect(buildAppurtenantExcessFacts(house({ nblGracePeriods: rows }), undefined)).toBeUndefined();
  });
});

describe("⑧ validateHousingExcessGrace — 사유별 필수 입력·역순(자동 안분 fallback 금지)", () => {
  const withRow = (row: NonNullable<AssetForm["nblGracePeriods"]>[number]) => house({ nblGracePeriods: [row] });
  it("종료일이 빈 사유 → 막는다(그 행은 조용히 빈 구간이 돼 유예가 사라진다)", () => {
    const err = validateHousingExcessGrace(withRow({ reasonCode: "use_prohibited", anchorDate: "2014-01-01", endDate: "", description: "" }), "주택", TRANSFER);
    expect(err).toContain("종료일");
  });
  it("종료일이 시작일보다 빠르면 → 막는다", () => {
    const err = validateHousingExcessGrace(withRow({ reasonCode: "use_prohibited", anchorDate: "2014-01-01", endDate: "2013-01-01", description: "" }), "주택", TRANSFER);
    expect(err).toContain("종료일");
  });
  it("정상 행은 통과", () => {
    expect(validateHousingExcessGrace(withRow({ reasonCode: "use_prohibited", anchorDate: "2014-01-01", endDate: "2023-12-31", description: "" }), "주택", TRANSFER)).toBeNull();
  });
  it("입력이 보이지 않는 자산(초과분 없음)의 남은 잘못된 행은 막지 않는다 — UI 통과 ↔ validate 차단 모순 금지", () => {
    const a = house({ acquisitionArea: "250", nblGracePeriods: [{ reasonCode: "use_prohibited", anchorDate: "2014-01-01", endDate: "", description: "" }] });
    expect(validateHousingExcessGrace(a, "주택", TRANSFER)).toBeNull();
  });
});
