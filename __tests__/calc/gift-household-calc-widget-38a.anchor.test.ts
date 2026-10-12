/**
 * anchor(⑧·④·route) — 계산기 단건 일반 증여 화면의 「증여자와 계속 같은 세대」 사실 입력 (결정 #38-1)
 *
 * 종전에는 계산기 일반 증여(이월과세 밖) 화면에 이 칸이 없어, 판정 메뉴에서 넘어온 값만 ④에 실렸다. 직접 입력한 사용자는
 * 사실을 넣을 길이 없어 엔진이 증여일 기준으로 판정하고 확인 필요만 고지했다. 이제 주 자산(첫 자산) 증여 주택에서 같은 위젯으로
 * 묻고 ⑧이 판정 메뉴와 같은 규칙(`giftHouseholdFactErrors`)으로 필수 검증한다.
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | GC-1 | ⑧ | 주 자산 증여 주택은 관계·증여자 취득일·세대 답·시작일을 필수로 묻는다 · 답하면 풀린다 |
 * | GC-2 | ⑧ 게이트 | 함께 양도하는 자산(2번째 이후)·건물만 증여(D2)·토지는 묻지 않는다 |
 * | GC-3 | ④ | 화면 입력을 싣는다 · D2는 싣지 않는다(화면에 칸이 없다) |
 * | GC-4 | route | 직접 입력한 같은 세대(예) → 통산 비과세 / 아니오 → 증여일 기준 과세 |
 *
 * 부정형 단언에는 긍정 짝을 둔다.
 */
import { describe, it, expect } from "vitest";
import { createInitialOneHouseJudgmentForm, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import { validateAssetEntry } from "@/lib/calc/transfer-tax-validate-asset";
import { buildCalcGiftHouseholdPayload, calcGiftHouseholdFactVisible } from "@/lib/calc/gift-household-payload";
import { handoff } from "./_one-house-pr6a-routes";
import { runCalc, allIssues } from "./_one-house-pr3a-calc-route";

/** 그 밖의 친족(형제) · 계속 같은 세대 · 2010 취득 → 2025-06-01 증여 → 2026-02-16 양도(증여 8개월 뒤). 이월과세 대상이 아니다. */
const giftAsset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    residenceInputMode: "direct",
    residencePeriods: [],
    assetKind: "housing",
    addressJibun: "서울특별시 종로구 청운동 1-1",
    acquisitionCause: "gift",
    acquisitionDate: "2025-06-01",
    fixedAcquisitionPrice: "600000000",
    donorAcquisitionDate: "2010-03-01",
    giftDonorRelation: "other",
    giftSameHousehold: "yes",
    giftHouseholdHoldingStartDate: "2010-03-01",
    ...over,
  }) as AssetForm;

/** 판정 메뉴 폼을 거쳐 계산기 폼의 공통 바탕(양도일·가액·1세대)을 만든 뒤, 자산 사실은 **계산기 화면에서 직접 입력한 값**으로 덮는다. */
function calcForm(assetOver: Partial<AssetForm> = {}): TransferFormData {
  const j = {
    ...createInitialOneHouseJudgmentForm(),
    assets: [giftAsset()],
    transferDate: "2026-02-16",
    contractTotalPrice: "900000000",
    isOneHousehold: true,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    houses: [],
    presaleRights: [],
  } as unknown as OneHouseJudgmentFormData;
  const f = handoff(j);
  return { ...f, assets: [{ ...f.assets[0], ...assetOver } as AssetForm, ...f.assets.slice(1)] } as TransferFormData;
}

const fieldsOf = (f: TransferFormData) => allIssues(f).map((s) => s.split(":")[1]);

describe("GC-1 ⑧ — 주 자산 증여 주택은 사실을 필수로 묻는다", () => {
  it("[GC-1a] 세대 답이 없으면 막는다 · 답하면 풀린다(긍정 짝)", () => {
    expect(fieldsOf(calcForm({ giftSameHousehold: "" }))).toContain("giftSameHousehold");
    expect(fieldsOf(calcForm())).not.toContain("giftSameHousehold");
  });
  it("[GC-1b] 관계 · 증여자 취득일 · 시작일(예일 때) 필수와 순서(±1)", () => {
    expect(fieldsOf(calcForm({ giftDonorRelation: "" }))).toContain("giftDonorRelation");
    expect(fieldsOf(calcForm({ donorAcquisitionDate: "" }))).toContain("donorAcquisitionDate");
    expect(fieldsOf(calcForm({ giftHouseholdHoldingStartDate: "" }))).toContain("giftHouseholdHoldingStartDate");
    // 증여일과 같은 날은 불가, 하루 전은 가능
    expect(fieldsOf(calcForm({ giftHouseholdHoldingStartDate: "2025-06-01" }))).toContain("giftHouseholdHoldingStartDate");
    expect(fieldsOf(calcForm({ giftHouseholdHoldingStartDate: "2025-05-31" }))).not.toContain("giftHouseholdHoldingStartDate");
  });
  it("[GC-1c] 「아니오」면 시작일을 묻지 않는다", () => {
    expect(fieldsOf(calcForm({ giftSameHousehold: "no", giftHouseholdHoldingStartDate: "" }))).not.toContain(
      "giftHouseholdHoldingStartDate",
    );
  });
});

describe("GC-2 ⑧ 게이트 — 화면에 칸이 없는 자산은 묻지 않는다", () => {
  const blank = { giftDonorRelation: "", giftSameHousehold: "", giftHouseholdHoldingStartDate: "" } as const;
  it("[GC-2a] 함께 양도하는 2번째 자산의 증여 주택은 묻지 않는다 · 같은 자산이 첫 자산이면 묻는다(짝)", () => {
    const f = calcForm();
    const second = giftAsset({ ...blank, assetId: "a2", standardPriceAtTransfer: "300000000" } as Partial<AssetForm>);
    expect(validateAssetEntry(second, 1, { ...f, assets: [f.assets[0], second] } as TransferFormData)).toBeNull();
    expect(validateAssetEntry(second, 0, { ...f, assets: [second] } as TransferFormData) ?? "").toMatch(/증여자와의 관계/);
  });
  it("[GC-2b] 건물만 증여받고 토지는 매수한 주택(D2)은 묻지 않는다", () => {
    const d2 = calcForm({
      ...blank,
      hasSeperateLandAcquisitionDate: true,
      landAcquisitionCause: "purchase",
      landCauseHost: "gift",
    });
    expect(fieldsOf(d2)).not.toContain("giftSameHousehold");
    // 술어로도 확인한다 — 다른 칸의 오류가 앞서 「없음」이 공허하게 통과하지 않게
    expect(calcGiftHouseholdFactVisible(d2.assets[0])).toBe(false);
    expect(calcGiftHouseholdFactVisible(calcForm({ ...blank }).assets[0])).toBe(true);
    // 부담부증여로 양도해도 D2가 성립하지 않으므로(증여 블록이 마운트된다) 묻는다
    expect(calcGiftHouseholdFactVisible({ ...d2.assets[0], transferType: "burdened_gift" })).toBe(true);
  });
  it("[GC-2c] 증여받은 토지는 묻지 않는다", () => {
    expect(fieldsOf(calcForm({ ...blank, assetKind: "land" }))).not.toContain("giftSameHousehold");
    expect(calcGiftHouseholdFactVisible(calcForm({ ...blank, assetKind: "land" }).assets[0])).toBe(false);
  });
});

describe("GC-3 ④ — 화면 입력을 싣는다", () => {
  it("[GC-3a] 직접 입력한 「예」와 시작일을 싣는다", () => {
    const p = buildCalcGiftHouseholdPayload(calcForm().assets[0]);
    expect(p.giftSameHouseholdContinuous).toBe(true);
    expect(p.giftHouseholdHoldingStartDate).toBe("2010-03-01");
  });
  it("[GC-3b] D2(건물만 증여)는 화면에 칸이 없으므로 남은 값을 싣지 않는다 · D2가 아니면 싣는다(짝)", () => {
    const d2 = calcForm({ hasSeperateLandAcquisitionDate: true, landAcquisitionCause: "purchase", landCauseHost: "gift" });
    expect(buildCalcGiftHouseholdPayload(d2.assets[0])).toEqual({});
    expect(buildCalcGiftHouseholdPayload(calcForm().assets[0]).giftSameHouseholdContinuous).toBe(true);
  });
});

describe("GC-4 route — 계산기에서 직접 입력한 사실로 판정한다", () => {
  it("[GC-4a] 계속 같은 세대(예) → 증여자 세대 보유 통산 → 비과세", async () => {
    const c = await runCalc(calcForm());
    expect(c.status, c.err).toBe(200);
    expect(c.issues.filter((s) => /gift|donor/.test(s))).toEqual([]);
    expect(c.isExempt).toBe(true);
    expect(c.totalTax).toBe(0);
    expect(c.body.giftSameHouseholdContinuous).toBe(true);
    expect(c.body.giftHouseholdHoldingStartDate).toBe("2010-03-01");
  });
  it("[GC-4b] 부정 짝: 아니오 → 증여일부터 센다 → 과세 (보유 1년 미만 70% — (3억 − 250만) × 70% + 지방소득세 10%)", async () => {
    const c = await runCalc(calcForm({ giftSameHousehold: "no", giftHouseholdHoldingStartDate: "" }));
    expect(c.status, c.err).toBe(200);
    expect(c.body.giftSameHouseholdContinuous).toBe(false);
    expect(c.isExempt).toBe(false);
    expect(c.totalTax).toBe(229_075_000);
    // 확정된 별도세대 — 「입력받지 않아」 고지가 없다
    expect((c.warnings ?? []).some((w: string) => w.includes("세대 관계를 입력받지 않아"))).toBe(false);
  });
});
