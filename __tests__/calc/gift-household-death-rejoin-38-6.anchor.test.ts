/**
 * anchor(④·⑧·route·핸드오프) — 증여받은 주택의 증여자 사망·이혼 후 재결합 사실 (결정 #34 조건 · #38-6)
 *
 * 결정 기록(#34 조건): 이혼 후 같은 배우자와 재결합한 사안은 「아니오」로 계산하고 확인 필요를 고지한다. 증여자가 사망한 뒤 양도하면
 * 질문을 띄우지 않고 통산 없이 계산하며 확인 필요를 고지한다.
 *
 * 종전(#2122): 이월과세 폼은 사망 토글이 있었지만 판정 메뉴·계산기 일반 증여에는 사망·재결합 입력이 없어 화면 안내문만 있었고
 * 결과의 확인 필요 고지는 나오지 않았다. 재결합은 어느 경로에도 사실 입력이 없었다.
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | DR-1 | ④ | 사망이면 「계속 같은 세대」 답을 싣지 않는다 · 재결합(배우자)은 false + 재결합 사실을 싣는다 · 배우자가 아니면 싣지 않는다 |
 * | DR-2 | ⑧ | 사망이면 세대 답을 요구하지 않는다 · 재결합은 배우자에게만 고를 수 있다 |
 * | DR-3 | route(판정 메뉴) | 사망·재결합은 통산 없이 계산 + 통산하면 결론이 갈릴 때만 확인 필요 고지 |
 * | DR-4 | 핸드오프 | 사망·재결합이 이월과세 폼으로 같은 사실로 넘어간다 · 이월과세 배제(배우자 사별)는 일반 증여로 남는다 |
 * | DR-5 | route(계산기) | 이월과세 폼의 재결합 → 같은 판정·같은 고지 |
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
import { buildCalcGiftHouseholdPayload } from "@/lib/calc/gift-household-payload";
import { buildCarryoverPayload } from "@/lib/calc/transfer-tax-api-carryover";
import { runJudgment, handoff } from "./_one-house-pr6a-routes";
import { runCalc } from "./_one-house-pr3a-calc-route";
import { RH_ANSWERED_NO } from "./_helpers/phrp-154-10-answer";

const REJOINED = "gift-household-rejoined-unverified";
const DECEASED = "gift-household-donor-deceased-unverified";
const UNCONFIRMED = "gift-household-continuity-unconfirmed";
const DETAIL = "gift-household-consolidation-detail-unverified";

const asset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    rentalHousingException: RH_ANSWERED_NO,
    residenceInputMode: "direct",
    residencePeriods: [],
    assetKind: "housing",
    acquisitionCause: "gift",
    acquisitionDate: "2025-06-01",
    donorAcquisitionDate: "2010-03-01",
    giftDonorRelation: "spouse",
    giftSameHousehold: "rejoined",
    giftHouseholdHoldingStartDate: "",
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
const ids = (r: { data: { judgment: { undetermined: { id: string }[] } } }) => r.data.judgment.undetermined.map((u) => u.id);

describe("DR-1 ④ 전송", () => {
  it("[DR-1a] 재결합(배우자) → 계속 같은 세대 false + 재결합 사실, 시작일은 싣지 않는다", () => {
    const b = buildOneHouseExemptionApiBody(jForm({ giftHouseholdHoldingStartDate: "2010-03-01" }));
    expect(b.giftSameHouseholdContinuous).toBe(false);
    expect(b.giftRejoinedAfterDivorce).toBe(true);
    expect(b.giftHouseholdHoldingStartDate).toBeUndefined();
    expect(b.giftDonorDeceased).toBeUndefined();
  });
  it("[DR-1b] 부정 짝: 「아니오」는 재결합 사실을 싣지 않는다 · 배우자가 아닌 관계의 남은 재결합 값도 싣지 않는다", () => {
    const no = buildOneHouseExemptionApiBody(jForm({ giftSameHousehold: "no" }));
    expect(no.giftSameHouseholdContinuous).toBe(false);
    expect(no.giftRejoinedAfterDivorce).toBeUndefined();
    const stale = buildOneHouseExemptionApiBody(jForm({ giftDonorRelation: "lineal" }));
    expect(stale.giftRejoinedAfterDivorce).toBeUndefined();
    expect(stale.giftSameHouseholdContinuous).toBeUndefined();
  });
  it("[DR-1c] 사망 → 사망 사실만 싣는다 — 남은 「예」·시작일 답은 싣지 않는다(질문을 띄우지 않으므로)", () => {
    const b = buildOneHouseExemptionApiBody(
      jForm({ giftDonorDeceased: true, giftSameHousehold: "yes", giftHouseholdHoldingStartDate: "2010-03-01" }),
    );
    expect(b.acquisitionCause).toBe("gift");
    expect(b.giftDonorDeceased).toBe(true);
    expect(b.giftSameHouseholdContinuous).toBeUndefined();
    expect(b.giftHouseholdHoldingStartDate).toBeUndefined();
    // 긍정 짝: 사망이 아니면 「예」 답이 그대로 간다
    const alive = buildOneHouseExemptionApiBody(jForm({ giftSameHousehold: "yes", giftHouseholdHoldingStartDate: "2010-03-01" }));
    expect(alive.giftSameHouseholdContinuous).toBe(true);
    expect(alive.giftDonorDeceased).toBeUndefined();
  });
  it("[DR-1d] 계산기 단건 ④도 같은 조각이다 — 사망이면 세대 답이 비어 있어도 싣는다", () => {
    const p = buildCalcGiftHouseholdPayload(asset({ giftDonorRelation: "other", giftDonorDeceased: true, giftSameHousehold: "" }));
    expect(p.giftDonorDeceased).toBe(true);
    expect(p.giftSameHouseholdContinuous).toBeUndefined();
    const r = buildCalcGiftHouseholdPayload(asset());
    expect(r.giftRejoinedAfterDivorce).toBe(true);
    expect(r.giftSameHouseholdContinuous).toBe(false);
  });
});

describe("DR-2 ⑧", () => {
  it("[DR-2a] 사망이면 세대 답을 요구하지 않는다 · 사망이 아니고 답이 없으면 요구한다(긍정 짝)", () => {
    const fields = (o: Partial<AssetForm>) => errs3(jForm(o)).map((e) => e.field);
    expect(fields({ giftDonorDeceased: true, giftSameHousehold: "" })).not.toContain("giftSameHousehold");
    expect(fields({ giftDonorDeceased: false, giftSameHousehold: "" })).toContain("giftSameHousehold");
    // 사망이어도 관계·증여자 취득일은 묻는다(사망 문언이 관계별로 다르다)
    expect(fields({ giftDonorDeceased: true, giftSameHousehold: "", giftDonorRelation: "" })).toContain("giftDonorRelation");
    expect(fields({ giftDonorDeceased: true, giftSameHousehold: "", donorAcquisitionDate: "" })).toContain("donorAcquisitionDate");
  });
  it("[DR-2b] 재결합은 배우자에게만 — 배우자가 아니면 막고, 배우자면 시작일 없이 통과한다(긍정 짝)", () => {
    const fields = (o: Partial<AssetForm>) => errs3(jForm(o)).map((e) => e.field);
    expect(fields({ giftDonorRelation: "lineal" })).toContain("giftSameHousehold");
    expect(fields({ giftDonorRelation: "" })).toContain("giftSameHousehold");
    expect(fields({})).not.toContain("giftSameHousehold");
    expect(fields({})).not.toContain("giftHouseholdHoldingStartDate");
  });
});

describe("DR-3 route(판정 메뉴) — 통산 없이 계산 + 결론을 가를 때만 확인 필요", () => {
  it("[DR-3a] 배우자 재결합 · 증여 8개월 뒤 양도 → 증여일 기준 과세 + 재결합 확인 필요 고지(통산하면 비과세)", async () => {
    const r = await runJudgment(jForm());
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.ve.filter((v) => v.startsWith("error"))).toEqual([]);
    expect(r.data.judgment.isExempt).toBe(false);
    expect(r.data.judgment.pending.map((p: { id: string }) => p.id)).toEqual(["154-1-holding-years"]);
    expect(String(r.data.judgment.pending[0].deadline).slice(0, 10)).toBe("2027-05-31");
    expect(ids(r)).toContain(REJOINED);
    // 같은 사실을 「예」로 읽었을 때와 갈리는 결론이다 — 통산 입력(예)은 비과세
    const yes = await runJudgment(jForm({ giftSameHousehold: "yes", giftHouseholdHoldingStartDate: "2010-03-01" }));
    expect(yes.data.judgment.isExempt).toBe(true);
  });
  it("[DR-3b] 부정 짝: 「아니오」는 같은 과세지만 재결합 고지가 없다 · 통산해도 결론이 같은 사안(증여 3년 뒤)은 재결합이어도 고지하지 않는다", async () => {
    const no = await runJudgment(jForm({ giftSameHousehold: "no" }));
    expect(no.data.judgment.isExempt).toBe(false);
    expect(ids(no)).not.toContain(REJOINED);
    const later = await runJudgment(jForm({}, { transferDate: "2028-07-01" }));
    expect(later.data.judgment.isExempt).toBe(true);
    expect(ids(later)).not.toContain(REJOINED);
  });
  it("[DR-3c] 증여자 사망(그 밖의 친족) → 증여일 기준 과세 + 사망 확인 필요 고지 · 남은 「예」 답이 있어도 통산하지 않는다", async () => {
    const dead = await runJudgment(
      jForm({ giftDonorRelation: "other", giftDonorDeceased: true, giftSameHousehold: "yes", giftHouseholdHoldingStartDate: "2010-03-01" }),
    );
    expect(dead.status, JSON.stringify(dead.json)).toBe(200);
    expect(dead.data.judgment.isExempt).toBe(false);
    expect(ids(dead)).toContain(DECEASED);
    // 질문을 띄우지 않으므로 「입력되지 않아」 미확인 고지가 아니다
    expect(ids(dead)).not.toContain(UNCONFIRMED);
    expect(ids(dead)).not.toContain(DETAIL);
    // 긍정 짝: 사망이 아니면 같은 「예」 답은 통산 → 비과세
    const alive = await runJudgment(
      jForm({ giftDonorRelation: "other", giftSameHousehold: "yes", giftHouseholdHoldingStartDate: "2010-03-01" }),
    );
    expect(alive.data.judgment.isExempt).toBe(true);
    expect(ids(alive)).not.toContain(DECEASED);
  });
  it("[DR-3d] 증여자 사망이어도 통산이 결론을 가르지 않으면(증여 3년 뒤) 고지하지 않는다", async () => {
    const r = await runJudgment(jForm({ giftDonorRelation: "other", giftDonorDeceased: true, giftSameHousehold: "" }, { transferDate: "2028-07-01" }));
    expect(r.data.judgment.isExempt).toBe(true);
    expect(ids(r)).not.toContain(DECEASED);
  });
});

describe("DR-4 핸드오프 — 같은 사실로 이월과세 폼에 넘긴다", () => {
  it("[DR-4a] 배우자 재결합(10년 안 증여) → carryover_gift + 재결합 답을 그대로", () => {
    const a = toTransferFormPatch(jForm()).assets![0];
    expect(a.acquisitionCause).toBe("carryover_gift");
    expect(a.carryover?.donorSameHousehold).toBe("rejoined");
    expect(a.carryover?.donorHouseholdHoldingStartDate).toBe("");
  });
  it("[DR-4b] 배우자 사망 → 이월과세 배제(사별)라 일반 증여로 남고 사망 사실이 ④로 간다 · 직계 2025.1.1. 이후 증여 사망도 같다", async () => {
    const spouse = handoff(jForm({ giftDonorDeceased: true, giftSameHousehold: "" }));
    expect(spouse.assets[0].acquisitionCause).toBe("gift");
    expect(spouse.assets[0].giftDonorDeceased).toBe(true);
    const c = await runCalc(spouse);
    expect(c.status, c.err).toBe(200);
    expect(c.body.giftDonorDeceased).toBe(true);
    expect(c.body.giftSameHouseholdContinuous).toBeUndefined();
    expect(c.issues.filter((s) => /giftSameHousehold|donor/.test(s))).toEqual([]);
    expect((c.warnings ?? []).some((w: string) => w.includes("증여자가 양도 전에 사망한 경우"))).toBe(true);
    const lineal = toTransferFormPatch(jForm({ giftDonorRelation: "lineal", giftDonorDeceased: true, giftSameHousehold: "" })).assets![0];
    expect(lineal.acquisitionCause).toBe("gift");
  });
  it("[DR-4c] 부정 짝: 직계존비속 2025.1.1. 전 증여의 사망은 배제 대상이 아니라 이월과세로 넘어가고 사망·질문 숨김이 폼에 실린다", () => {
    const a = toTransferFormPatch(
      jForm({ giftDonorRelation: "lineal", acquisitionDate: "2024-06-01", giftDonorDeceased: true, giftSameHousehold: "yes", giftHouseholdHoldingStartDate: "2010-03-01" }),
    ).assets![0];
    expect(a.acquisitionCause).toBe("carryover_gift");
    expect(a.carryover?.donorDeceased).toBe(true);
    expect(a.carryover?.donorSameHousehold).toBe("");
    expect(a.carryover?.donorHouseholdHoldingStartDate).toBe("");
  });
});

/** 판정 메뉴가 묻지 않은 이월과세 금액 칸(증여자 취득가액·증여 당시 평가액·증여세 상당액)을 계산기에서 입력한 것으로 채운다. */
const filled = (f: ReturnType<typeof handoff>, over: Partial<NonNullable<AssetForm["carryover"]>> = {}) =>
  ({
    ...f,
    assets: [
      {
        ...f.assets[0],
        addressJibun: "서울특별시 종로구 청운동 1-1",
        carryover: { ...f.assets[0].carryover!, donorAcquisitionPrice: "300000000", giftDateValuation: "600000000", giftTaxAmount: "0", ...over },
      },
    ],
  }) as typeof f;

describe("DR-5 route(계산기) — 이월과세 폼의 재결합도 같은 판정·같은 고지", () => {
  it("[DR-5a] 배우자 재결합 → 계산기에서 통산 없이 계산하고 재결합 확인 필요를 고지한다 · 「아니오」는 고지가 없다(긍정 짝)", async () => {
    const f = filled(handoff(jForm()));
    expect(f.assets[0].acquisitionCause).toBe("carryover_gift");
    const c = await runCalc(f);
    expect(c.status, c.err).toBe(200);
    expect(c.issues.filter((s) => /carryover/.test(s))).toEqual([]);
    const carry = c.body.carryoverTaxation as Record<string, unknown>;
    expect(carry.donorSameHouseholdContinuous).toBe(false);
    expect(carry.donorRejoinedAfterDivorce).toBe(true);
    expect((c.warnings ?? []).some((w: string) => w.includes("이혼했다가 같은 사람과 재결합"))).toBe(true);

    const no = await runCalc(filled(handoff(jForm({ giftSameHousehold: "no" }))));
    expect(no.status, no.err).toBe(200);
    expect((no.body.carryoverTaxation as Record<string, unknown>).donorRejoinedAfterDivorce).toBeUndefined();
    expect((no.warnings ?? []).some((w: string) => w.includes("이혼했다가 같은 사람과 재결합"))).toBe(false);
    // 같은 과세 결론 — 재결합은 「아니오」로 계산한다
    expect(c.totalTax).toBe(no.totalTax);
  });
  it("[DR-5c] ④ 이월과세 — 배우자만 재결합을 싣는다 · 관계가 바뀌어 남은 값(⑧ 앞단)은 싣지 않는다 · 배우자면 싣는다(긍정 짝)", () => {
    const f = filled(handoff(jForm())).assets[0];
    const carry = (rel: "spouse" | "lineal") =>
      buildCarryoverPayload({ ...f, carryover: { ...f.carryover!, donorRelation: rel } } as AssetForm, "2026-02-16", 1)!.carryoverTaxation as Record<string, unknown>;
    expect(carry("spouse").donorRejoinedAfterDivorce).toBe(true);
    expect(carry("spouse").donorSameHouseholdContinuous).toBe(false);
    expect(carry("lineal").donorRejoinedAfterDivorce).toBeUndefined();
    expect(carry("lineal").donorSameHouseholdContinuous).toBeUndefined();
  });
  it("[DR-5b] 이월과세 폼 ⑧ — 재결합은 배우자에게만 · 관계를 바꿔 남은 값은 막는다", async () => {
    const f = filled(handoff(jForm()));
    const lineal = filled(f, { donorRelation: "lineal" });
    const issues = (await runCalc(lineal)).issues;
    expect(issues.some((s) => s.includes("carryover.donorSameHousehold"))).toBe(true);
    const ok = (await runCalc(f)).issues;
    expect(ok.some((s) => s.includes("carryover.donorSameHousehold"))).toBe(false);
  });
});
