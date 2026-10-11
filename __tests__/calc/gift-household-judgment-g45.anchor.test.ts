/**
 * anchor(④·⑧·route·핸드오프) — 판정 메뉴의 「증여받은 주택」 증여자와 계속 같은 세대 사실 (결정 #38 G4-5)
 *
 * 취득일 한 칸으로는 같은 세대 증여(증여자 세대 보유기간 통산)와 별도세대 증여(증여일 기준)를 가를 수 없어 사실을 묻는다.
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | GJ-1 | ④ | 답한 사실만 싣는다 · 증여가 아니면 남은 값을 싣지 않는다 |
 * | GJ-2 | route | 계속 같은 세대 → 통산해 비과세 / 아니오 → 증여일 기준 과세 + 보유 기한 |
 * | GJ-3 | ⑧ | 관계·증여자 취득일·세대 답·시작일을 필수로 묻는다(결론이 아니라 사실) |
 * | GJ-4 | 핸드오프 | 배우자·직계존비속 10년(5년) 안 증여는 같은 사실로 「이월과세(증여)」로 넘긴다 |
 *
 * 부정형 단언에는 긍정 짝을 둔다.
 */
import { describe, it, expect } from "vitest";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { validateStep3 } from "@/lib/calc/one-house-exemption-validate";
import { toTransferFormPatch } from "@/lib/calc/one-house-judgment-handoff";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createInitialOneHouseJudgmentForm, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { runJudgment } from "./_one-house-pr6a-routes";

const asset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    residenceInputMode: "direct",
    residencePeriods: [],
    assetKind: "housing",
    acquisitionCause: "gift",
    acquisitionDate: "2025-06-01",
    donorAcquisitionDate: "2010-03-01",
    giftDonorRelation: "spouse",
    giftSameHousehold: "yes",
    giftHouseholdHoldingStartDate: "2010-03-01",
    ...over,
  }) as AssetForm;

const jForm = (assetOver: Partial<AssetForm> = {}, over: Record<string, unknown> = {}) =>
  ({
    ...createInitialOneHouseJudgmentForm(),
    assets: [asset(assetOver)],
    transferDate: "2026-02-16",
    contractTotalPrice: "900000000",
    isOneHousehold: true,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    houses: [],
    presaleRights: [],
    ...over,
  }) as unknown as OneHouseJudgmentFormData;

const errs3 = (f: OneHouseJudgmentFormData) => validateStep3(f).filter((e) => e.severity === "error");

describe("GJ-1 ④ 전송", () => {
  it("[GJ-1a] 같은 세대(예) → 원인 gift · 증여자 취득일 · 계속 같은 세대 · 시작일을 싣는다", () => {
    const b = buildOneHouseExemptionApiBody(jForm());
    expect(b.acquisitionCause).toBe("gift");
    expect(b.donorAcquisitionDate).toBe("2010-03-01");
    expect(b.giftSameHouseholdContinuous).toBe(true);
    expect(b.giftHouseholdHoldingStartDate).toBe("2010-03-01");
  });
  it("[GJ-1b] 아니오 → false만 싣고 시작일은 싣지 않는다(stale 차단)", () => {
    const b = buildOneHouseExemptionApiBody(jForm({ giftSameHousehold: "no", giftHouseholdHoldingStartDate: "2010-03-01" }));
    expect(b.giftSameHouseholdContinuous).toBe(false);
    expect(b.giftHouseholdHoldingStartDate).toBeUndefined();
  });
  it("[GJ-1c] 긍정 짝: 증여가 아니면 남은 세대 값을 싣지 않는다", () => {
    const b = buildOneHouseExemptionApiBody(jForm({ acquisitionCause: "purchase" }));
    expect(b.giftSameHouseholdContinuous).toBeUndefined();
    expect(b.giftHouseholdHoldingStartDate).toBeUndefined();
    expect(b.acquisitionCause).toBeUndefined();
  });
});

describe("GJ-2 route — 통산 vs 증여일 기준", () => {
  it("[GJ-2a] 배우자 · 계속 같은 세대(예) → 증여자 세대 보유 15년 통산 → 증여 8개월 뒤 양도라도 비과세", async () => {
    const r = await runJudgment(jForm());
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.data.judgment.isExempt).toBe(true);
  });
  it("[GJ-2b] 부정 짝: 아니오 → 증여일부터 센다 → 과세 · 보유 기한 2027-05-31", async () => {
    const r = await runJudgment(jForm({ giftSameHousehold: "no" }));
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.data.judgment.isExempt).toBe(false);
    expect(r.data.judgment.pending.map((p: { id: string }) => p.id)).toEqual(["154-1-holding-years"]);
    expect(String(r.data.judgment.pending[0].deadline).slice(0, 10)).toBe("2027-05-31");
    // 확정된 별도세대는 결론을 가르는 미확인이 아니다 — 확인 필요 고지가 없다
    expect(r.data.judgment.undetermined.map((u: { id: string }) => u.id)).not.toContain("gift-household-continuity-unconfirmed");
  });
  it("[GJ-2c] 시작일이 통산 길이를 정한다 — 증여 8개월 전 합가는 2년 미달 → 과세, 통산 적용은 확인 필요로 고지", async () => {
    const r = await runJudgment(jForm({ giftHouseholdHoldingStartDate: "2025-03-01" }));
    expect(r.data.judgment.isExempt).toBe(false);
    expect(r.data.judgment.pending[0].id).toBe("154-1-holding-years");
    // 11개월 통산 기한: 2027-02-28(2025-03-01 기산 2년 만료일)
    expect(String(r.data.judgment.pending[0].deadline).slice(0, 10)).toBe("2027-02-28");
  });
  it("[GJ-2d] 통산을 적용해 결론이 갈리면 정면 해석 없는 세부를 확인 필요로 고지한다 · 같아지는 짝은 고지하지 않는다", async () => {
    const decides = await runJudgment(jForm());
    expect(decides.data.judgment.undetermined.map((u: { id: string }) => u.id)).toContain(
      "gift-household-consolidation-detail-unverified",
    );
    // 증여 3년 뒤 양도 — 통산 없이도 2년 충족이라 통산이 결론을 가르지 않는다
    const same = await runJudgment(jForm({}, { transferDate: "2028-07-01" }));
    expect(same.data.judgment.isExempt).toBe(true);
    expect(same.data.judgment.undetermined.map((u: { id: string }) => u.id)).not.toContain(
      "gift-household-consolidation-detail-unverified",
    );
  });
});

describe("GJ-3 ⑧ — 사실 필수", () => {
  it("[GJ-3a] 세대 답을 하지 않으면 막는다 · 답하면 풀린다(긍정 짝)", () => {
    const blocked = errs3(jForm({ giftSameHousehold: "" }));
    expect(blocked.map((e) => e.field)).toContain("giftSameHousehold");
    expect(errs3(jForm()).map((e) => e.field)).not.toContain("giftSameHousehold");
  });
  it("[GJ-3b] 관계 · 증여자 취득일 · 시작일(예일 때) 필수와 순서(±1)", () => {
    expect(errs3(jForm({ giftDonorRelation: "" })).map((e) => e.field)).toContain("giftDonorRelation");
    expect(errs3(jForm({ donorAcquisitionDate: "" })).map((e) => e.field)).toContain("donorAcquisitionDate");
    expect(errs3(jForm({ giftHouseholdHoldingStartDate: "" })).map((e) => e.field)).toContain("giftHouseholdHoldingStartDate");
    // 증여일과 같은 날은 불가, 하루 전은 가능
    expect(errs3(jForm({ giftHouseholdHoldingStartDate: "2025-06-01" })).map((e) => e.field)).toContain("giftHouseholdHoldingStartDate");
    expect(errs3(jForm({ giftHouseholdHoldingStartDate: "2025-05-31" })).map((e) => e.field)).not.toContain("giftHouseholdHoldingStartDate");
    // 증여자 취득일 전은 불가
    expect(errs3(jForm({ giftHouseholdHoldingStartDate: "2010-02-28" })).map((e) => e.field)).toContain("giftHouseholdHoldingStartDate");
  });
  it("[GJ-3c] 증여가 아니면 묻지 않는다", () => {
    const fields = errs3(jForm({ acquisitionCause: "purchase", giftSameHousehold: "" })).map((e) => e.field);
    expect(fields).not.toContain("giftSameHousehold");
  });
});

describe("GJ-4 핸드오프 — 같은 사실로 이월과세 원인을 정해 넘긴다", () => {
  it("[GJ-4a] 배우자 · 증여 8개월 뒤 양도(10년 안) → carryover_gift + 같은 사실", () => {
    const patch = toTransferFormPatch(jForm());
    const a = patch.assets![0];
    expect(a.acquisitionCause).toBe("carryover_gift");
    expect(a.carryover?.donorRelation).toBe("spouse");
    expect(a.carryover?.giftRegistryDate).toBe("2025-06-01");
    expect(a.carryover?.donorAcquisitionDate).toBe("2010-03-01");
    expect(a.carryover?.donorSameHousehold).toBe("yes");
    expect(a.carryover?.donorHouseholdHoldingStartDate).toBe("2010-03-01");
  });
  it("[GJ-4b] 부정 짝: 그 밖의 친족 · 기간(10년) 밖 증여는 일반 증여 그대로", () => {
    expect(toTransferFormPatch(jForm({ giftDonorRelation: "other" })).assets![0].acquisitionCause).toBe("gift");
    const far = toTransferFormPatch(
      jForm({ acquisitionDate: "2010-06-01", donorAcquisitionDate: "2000-01-01", giftHouseholdHoldingStartDate: "2005-01-01" }),
    ).assets![0];
    expect(far.acquisitionCause).toBe("gift");
  });
  it("[GJ-4c] 5년 규칙 경계: 2022-12-31 증여는 5년, 2023-01-01 증여는 10년", () => {
    const at = (gift: string, transfer: string) =>
      toTransferFormPatch(
        jForm({ acquisitionDate: gift, donorAcquisitionDate: "2000-01-01", giftHouseholdHoldingStartDate: "2005-01-01" }, { transferDate: transfer }),
      ).assets![0].acquisitionCause;
    expect(at("2022-12-31", "2027-12-31")).toBe("carryover_gift"); // 정확히 5년째
    expect(at("2022-12-31", "2028-01-02")).toBe("gift"); // 5년 초과
    expect(at("2023-01-01", "2028-01-02")).toBe("carryover_gift"); // 10년
  });
});
