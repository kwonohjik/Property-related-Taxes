/**
 * anchor — 이월과세 × 당초 증여 채무 부분(매입분) 이력 복원 (UI 설계서 V-10 · Q-UI-3 a).
 * V-7 시절(분자 전용)에 토글 ON으로 저장한 일반건물 폼을 **두 복원 경로**(이력 「편집」= `resumeTransferRecord`의 migrateAsset 경로 ·
 * 세션 복원 = `migratePersistedTransferForm`)에 통과시켜도 토글·채무·증여세 두 칸이 그대로이고,
 * 복원 뒤 ⑧이 «채워진 입력 → 통과 / 증여세 칸이 빈 입력 → 그 칸으로 이동»으로 판정하며 ④ 와이어에 채무가 실리는지 본다.
 * 브라우저 경로(IndexedDB → 편집 → 계산)는 `e2e/carryover-gift-debt-purchased-part-parts.spec.ts` CDPP-16.
 */
import { describe, it, expect } from "vitest";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset";
import { clearInheritedStaleAcqInputs } from "@/lib/stores/calc-wizard-asset-migrate";
import { migratePersistedTransferForm, createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const co = (o: Record<string, unknown> = {}) => ({
  ...CARRYOVER_DEFAULTS, giftRegistryDate: "2021-03-01", donorAcquisitionDate: "2005-06-15", donorAcquisitionPrice: "150000000", giftDateValuation: "400000000",
  giftTaxCalculated: "30000000", giftTaxBase: "1000000000", donorRelation: "lineal", donorSameHousehold: "no", giftDebtAssumed: true, giftAssumedDebt: "100000000", ...o,
});
/** 일반건물 환산 · 분리 ON — 화면의 «토지만 이월과세» / «건물만 이월과세» 모양(E2E CDPP-11·12와 같은 시드). */
const gb = (over: Record<string, unknown>): AssetForm =>
  ({
    ...makeDefaultAsset(1), assetLabel: "자산 1", addressJibun: "서울 강남구 테스트동 1-1", assetKind: "general_building",
    hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2021-03-01", acquisitionDate: "2021-03-01",
    useEstimatedAcquisition: true, landAcqMode: "estimated", buildingAcqMode: "estimated",
    gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbTransferLandPricePerSqm: "2000000", gbTransferBuildingValue: "200000000",
    gbZoneType: "general_residential", gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "100000000", actualSalePrice: "1000000000", ...over,
  }) as AssetForm;
const landOnly = (o: Record<string, unknown> = {}) => gb({ acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "purchase", carryover: co(o) });
const buildingOnly = (o: Record<string, unknown> = {}) => gb({ acquisitionCause: "purchase", gbBuildingAcquisitionCause: "carryover_gift", carryover: { ...CARRYOVER_DEFAULTS }, buildingCarryover: co(o) });
const unified = (o: Record<string, unknown> = {}) =>
  gb({ hasSeperateLandAcquisitionDate: false, acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "carryover_gift", carryover: co(o), buildingCarryover: co(o) });

const formOf = (assets: AssetForm[], over: Record<string, unknown> = {}): TransferFormData =>
  ({
    ...createDefaultTransferFormData(), assets, transferDate: "2026-03-01", filingDate: "2026-05-31", contractTotalPrice: "1000000000", totalTransferExpense: "0",
    householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isOneHousehold: false, ...over,
  }) as unknown as TransferFormData;

/** 이력 「편집」 경로 — `lib/calc/transfer-resume-entry.ts`의 assets 정규화와 같은 호출. JSON 왕복은 IndexedDB(구조화 복제) 대용. */
const restoreByHistory = (f: TransferFormData): TransferFormData => {
  const saved = JSON.parse(JSON.stringify(f)) as TransferFormData;
  return clearInheritedStaleAcqInputs({ ...saved, assets: saved.assets.map((a) => migrateAsset({ ...a })) });
};
const restoreBySession = (f: TransferFormData): TransferFormData => migratePersistedTransferForm(JSON.parse(JSON.stringify(f)));

const issuesOf = (f: TransferFormData) => [0, 1, 2, 3, 4].flatMap((s) => collectStepIssues(s, f)) as Array<{ field?: string; message?: string }>;
async function bodyOf(f: TransferFormData): Promise<Body> {
  let captured: Body = {};
  const orig = global.fetch;
  global.fetch = (async (_u: unknown, init: { body?: string }) => {
    captured = JSON.parse(init?.body ?? "{}");
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
  }) as unknown as typeof fetch;
  try { await callTransferTaxAPI(f); } catch { /* body 만 필요하다 */ }
  global.fetch = orig;
  return captured;
}

const KEYS = ["giftDebtAssumed", "giftAssumedDebt", "giftTaxCalculated", "giftTaxBase"] as const;
const pick = (c: Record<string, unknown>) => Object.fromEntries(KEYS.map((k) => [k, c[k]]));

interface Shape { name: string; asset: (o?: Record<string, unknown>) => AssetForm; sub: "carryover" | "buildingCarryover"; wirePart: "landCarryoverPart" | "buildingCarryoverPart" }
const shapes: Shape[] = [
  { name: "토지만 이월과세", asset: landOnly, sub: "carryover", wirePart: "landCarryoverPart" },
  { name: "건물만 이월과세", asset: buildingOnly, sub: "buildingCarryover", wirePart: "buildingCarryoverPart" },
];

describe.each([["이력 편집 경로", restoreByHistory], ["세션 복원 경로", restoreBySession]] as const)("V-10 %s", (_n, restore) => {
  describe.each(shapes)("$name", (sh) => {
    it("채워진 옛 입력 — 토글·채무·증여세 두 칸 보존 · ⑧ 통과 · ④ 와이어에 채무", async () => {
      const f = formOf([sh.asset()]);
      const r = restore(f);
      expect(pick((r.assets[0] as unknown as Record<string, Record<string, unknown>>)[sh.sub])).toEqual(pick((f.assets[0] as unknown as Record<string, Record<string, unknown>>)[sh.sub]));
      expect(issuesOf(r)).toEqual([]);
      const body = await bodyOf(r);
      expect(body.generalBuildingValuation[sh.wirePart]).toMatchObject({ giftAssumedDebt: 100_000_000, giftDateAssetValue: 400_000_000 });
      expect(body.generalBuildingValuation.carryoverGiftEvent).toMatchObject({ giftTaxCalculated: 30_000_000, giftTaxBase: 1_000_000_000 });
    });

    it("증여세 두 칸이 비어 있던 옛 입력 — 값은 그대로 비어 있고 ⑧이 그 칸을 알려 준다(막다른 길 아님)", () => {
      const f = formOf([sh.asset({ giftTaxCalculated: "", giftTaxBase: "" })]);
      const r = restore(f);
      expect(pick((r.assets[0] as unknown as Record<string, Record<string, unknown>>)[sh.sub])).toEqual({ giftDebtAssumed: true, giftAssumedDebt: "100000000", giftTaxCalculated: "", giftTaxBase: "" });
      const fields = issuesOf(r).map((i) => i.field);
      expect(fields).toContain(`${sh.sub}.giftTaxBase`);
    });
  });

  it("분리 OFF(토지·건물 둘 다 이월과세) — 두 서브폼의 값 보존 · ⑧ 통과", () => {
    const f = formOf([unified()]);
    const a = restore(f).assets[0] as unknown as Record<string, Record<string, unknown>>;
    expect(pick(a.carryover)).toEqual(pick(unified().carryover as unknown as Record<string, unknown>));
    expect(issuesOf(restore(f))).toEqual([]);
  });
});
