/**
 * anchor(④·⑧·⑫·route) — 증여 전 동일세대 거주기간(개월)의 §154① 비과세 거주요건 통산 (결정 #38-7) + 표2 대상 판정 통산·미답 확인 필요 고지 (결정 #38-8·#38-9)
 *
 * 결정: 증여자와 증여일부터 양도일까지 계속 같은 세대였다면(동일세대 증여), 증여 전 같은 세대로 그 주택에 거주한 기간을 개월로 받아
 * **소득세법 시행령 §154① 비과세 거주요건과 표2 대상 판정(거주 2년)**에 통산한다. 장기보유특별공제 **공제율**의 보유·거주기간은 본인 기간(증여일 기산)이라
 * 통산하지 않는다(결정 #38-9 — 사전-2025-법규재산-0506). 미답이면 통산하지 않고, 거주했다면 표2 대상이 되어 결론이 갈릴 때만 확인 필요를 고지한다(반사실 판정).
 * 비과세 쪽 근거 서면인터넷방문상담4팀-912는 2005년 배우자 지분 증여 사안이라 주택 전부 증여·현행 조정대상지역 거주요건의 정면 해석은 확인하지 못했다 — 고지에 그대로 적는다.
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | PR-1 | ④ | 「예」일 때만 싣는다 · 비면 미답(미전송) · 0은 명시 답(전송) · 비정수는 싣지 않는다 · 아니오·사망의 남은 값은 싣지 않는다 |
 * | PR-2 | ⑧·⑫ | 상한은 세대 보유 시작일~증여일 개월 수(±1) · 판정 메뉴·계산기·이월과세 폼·API가 같은 상한 |
 * | PR-3 | route(판정 메뉴) | 거주 24개월 경계 · 입력 없음은 통산하지 않고 거주했다면 결론이 갈릴 때만 확인 필요 · 입력 0은 고지 없음 |
 * | PR-4 | route(계산기) | 과세 → 부분 비과세(고가주택) 세액 · 표2 대상 판정에 통산(공제율 12%) · 공제율에는 통산하지 않음 · 미답 확인 필요 고지의 발동·불발동 |
 * | PR-5 | 거주 구간 오류 | 증여 전 거주 칸이 있으면 오류 문구가 그 칸을 안내한다 |
 *
 * 부정형 단언에는 긍정 짝을 둔다.
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { POST as POST_OH } from "@/app/api/calc/one-house-exemption/route";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { validateStep3 } from "@/lib/calc/one-house-exemption-validate";
import { collectResidenceIntervalErrors } from "@/lib/calc/residence-interval-validate";
import { buildCalcGiftHouseholdPayload, calcGiftPriorResidenceAsked, giftHouseholdFactErrors, giftPriorResidenceAsked } from "@/lib/calc/gift-household-payload";
import { buildCarryoverPayload } from "@/lib/calc/transfer-tax-api-carryover";
import { validateCarryoverHouseholdFact } from "@/lib/calc/transfer-tax-validate-carryover-household";
import { collectWithFields } from "@/lib/calc/transfer-tax-validate-field";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createInitialOneHouseJudgmentForm, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import { handoff, runJudgment } from "./_one-house-pr6a-routes";
import { runCalc } from "./_one-house-pr3a-calc-route";
import { RH_ANSWERED_NO } from "./_helpers/phrp-154-10-answer";

const PRIOR = "gift-household-prior-residence-unverified";
const DETAIL = "gift-household-consolidation-detail-unverified";

/**
 * 직계존비속이 2018-01-01 취득 → 2019-03-01 세대 보유 시작(합가) → 2022-06-01 증여 → 계속 같은 세대 · 조정대상지역 취득.
 * 세대 보유 시작일~증여일 = 39개월(2019-03-01 → 2022-06-01)이 증여 전 거주의 상한이다.
 */
const asset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    rentalHousingException: RH_ANSWERED_NO,
    residenceInputMode: "direct",
    residencePeriods: [],
    assetKind: "housing",
    acquisitionCause: "gift",
    acquisitionDate: "2022-06-01",
    donorAcquisitionDate: "2018-01-01",
    giftDonorRelation: "lineal",
    giftSameHousehold: "yes",
    giftHouseholdHoldingStartDate: "2019-03-01",
    ...over,
  }) as AssetForm;

const jForm = (assetOver: Partial<AssetForm> = {}, over: Record<string, unknown> = {}) =>
  ({
    ...createInitialOneHouseJudgmentForm(),
    assets: [asset(assetOver)],
    transferDate: "2025-02-16",
    contractTotalPrice: "900000000",
    isOneHousehold: true,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: true,
    houses: [],
    presaleRights: [],
    ...over,
  }) as unknown as OneHouseJudgmentFormData;

const ids = (r: { data: { judgment: { undetermined: { id: string }[] } } }) => r.data.judgment.undetermined.map((u) => u.id);
const reasonOf = (r: { data: { judgment: { undetermined: { id: string; reason: string }[] } } }, id: string) =>
  r.data.judgment.undetermined.find((u) => u.id === id)?.reason ?? "";
const errs3 = (f: OneHouseJudgmentFormData) => validateStep3(f).filter((e) => e.severity === "error");

/** 판정 메뉴 route를 본문 그대로 호출한다 — ④를 거치지 않는 API 직접 호출(⑫) 검증용. */
async function postJudgment(body: Record<string, unknown>) {
  const res = await POST_OH(
    new NextRequest("http://localhost/api/calc/one-house-exemption", {
      method: "POST",
      headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(body),
    }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, json: (await res.json()) as any };
}

describe("PR-1 ④ 전송", () => {
  it("[PR-1a] 「예」 + 개월 → 숫자로 싣는다 · 0은 명시 답이라 싣는다 · 비면 미전송(미답)", () => {
    expect(buildOneHouseExemptionApiBody(jForm({ giftPriorHouseholdResidenceMonths: "12" })).giftPriorHouseholdResidenceMonths).toBe(12);
    expect(buildOneHouseExemptionApiBody(jForm({ giftPriorHouseholdResidenceMonths: "0" })).giftPriorHouseholdResidenceMonths).toBe(0);
    expect(buildOneHouseExemptionApiBody(jForm({ giftPriorHouseholdResidenceMonths: "" })).giftPriorHouseholdResidenceMonths).toBeUndefined();
  });
  it("[PR-1b] 부정 짝: 아니오·사망·재결합이면 남은 값을 싣지 않는다 · 정수가 아니면 싣지 않는다(⑧이 막는다)", () => {
    for (const o of [
      { giftSameHousehold: "no" },
      { giftSameHousehold: "" },
      { giftDonorDeceased: true },
      { giftSameHousehold: "rejoined", giftDonorRelation: "spouse" },
    ] as Partial<AssetForm>[]) {
      expect(buildOneHouseExemptionApiBody(jForm({ giftPriorHouseholdResidenceMonths: "12", ...o })).giftPriorHouseholdResidenceMonths, JSON.stringify(o)).toBeUndefined();
    }
    for (const bad of ["abc", "-3", "1.5"]) {
      expect(buildOneHouseExemptionApiBody(jForm({ giftPriorHouseholdResidenceMonths: bad })).giftPriorHouseholdResidenceMonths, bad).toBeUndefined();
    }
  });
  it("[PR-1c] 계산기 단건 ④(`buildCalcGiftHouseholdPayload`)도 같은 조각이다", () => {
    expect(buildCalcGiftHouseholdPayload(asset({ giftPriorHouseholdResidenceMonths: "12" })).giftPriorHouseholdResidenceMonths).toBe(12);
    expect(buildCalcGiftHouseholdPayload(asset({ giftPriorHouseholdResidenceMonths: "" })).giftPriorHouseholdResidenceMonths).toBeUndefined();
    expect(buildCalcGiftHouseholdPayload(asset({ giftPriorHouseholdResidenceMonths: "12", giftSameHousehold: "no" })).giftPriorHouseholdResidenceMonths).toBeUndefined();
  });
  it("[PR-1d] 이월과세 폼 ④ — 「예」일 때만 싣는다 · 판정 메뉴 핸드오프가 같은 사실로 넘긴다", () => {
    const f = handoff(jForm({ giftPriorHouseholdResidenceMonths: "12", giftDonorRelation: "spouse", acquisitionDate: "2022-06-01" })).assets[0];
    expect(f.acquisitionCause).toBe("carryover_gift");
    expect(f.carryover?.donorPriorHouseholdResidenceMonths).toBe("12");
    const ct = (a: AssetForm) => buildCarryoverPayload(a, "2025-02-16", 1)!.carryoverTaxation as Record<string, unknown>;
    expect(ct(f as AssetForm).donorPriorHouseholdResidenceMonths).toBe(12);
    const no = { ...f, carryover: { ...f.carryover!, donorSameHousehold: "no" as const } } as AssetForm;
    expect(ct(no).donorPriorHouseholdResidenceMonths).toBeUndefined();
    const blank = { ...f, carryover: { ...f.carryover!, donorPriorHouseholdResidenceMonths: "" } } as AssetForm;
    expect(ct(blank).donorPriorHouseholdResidenceMonths).toBeUndefined();
  });
  it("[PR-1e] 판정 메뉴에서 「아니오」인 핸드오프는 개월을 비운다", () => {
    const f = handoff(jForm({ giftPriorHouseholdResidenceMonths: "12", giftSameHousehold: "no", giftDonorRelation: "spouse" })).assets[0];
    expect(f.carryover?.donorPriorHouseholdResidenceMonths).toBe("");
  });
});

describe("PR-2 ⑧·⑫ — 상한은 세대 보유 시작일부터 증여일까지의 개월 수", () => {
  const fields = (o: Partial<AssetForm>) => errs3(jForm(o)).map((e) => e.field);
  it("[PR-2a] 판정 메뉴 ⑧ — 39개월은 통과 · 40개월은 막는다 · 비면 통과(필수가 아니다)", () => {
    expect(fields({ giftPriorHouseholdResidenceMonths: "39" })).not.toContain("giftPriorHouseholdResidenceMonths");
    expect(fields({ giftPriorHouseholdResidenceMonths: "40" })).toContain("giftPriorHouseholdResidenceMonths");
    expect(fields({ giftPriorHouseholdResidenceMonths: "" })).not.toContain("giftPriorHouseholdResidenceMonths");
    expect(fields({ giftPriorHouseholdResidenceMonths: "0" })).not.toContain("giftPriorHouseholdResidenceMonths");
    for (const bad of ["abc", "-3", "1.5"]) expect(fields({ giftPriorHouseholdResidenceMonths: bad }), bad).toContain("giftPriorHouseholdResidenceMonths");
  });
  it("[PR-2b] 시작일이 하루 늦으면 상한이 줄어든다 — 2019-03-02 → 2022-06-01은 38개월", () => {
    const err = (m: string) =>
      giftHouseholdFactErrors(asset({ giftHouseholdHoldingStartDate: "2019-03-02", giftPriorHouseholdResidenceMonths: m })).map((e) => e.field);
    expect(err("38")).not.toContain("giftPriorHouseholdResidenceMonths");
    expect(err("39")).toContain("giftPriorHouseholdResidenceMonths");
  });
  it("[PR-2c] 이월과세 폼 ⑧ — 같은 상한(증여 등기접수일 기준) · 비면 통과", () => {
    const c = (m: string) =>
      collectWithFields(() => validateCarryoverHouseholdFact(
        { ...asset(), acquisitionCause: "carryover_gift", carryover: { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2022-06-01", donorAcquisitionDate: "2018-01-01", donorRelation: "lineal", donorSameHousehold: "yes", donorHouseholdHoldingStartDate: "2019-03-01", donorPriorHouseholdResidenceMonths: m } } as AssetForm,
        { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2022-06-01", donorAcquisitionDate: "2018-01-01", donorRelation: "lineal", donorSameHousehold: "yes", donorHouseholdHoldingStartDate: "2019-03-01", donorPriorHouseholdResidenceMonths: m },
        "자산",
      ));
    expect(c("39").result).toBeNull();
    expect(c("").result).toBeNull();
    const over = c("40");
    expect(over.result).toContain("증여 전 동일세대 거주기간");
    expect(over.fieldOf(over.result!)).toBe("carryover.donorPriorHouseholdResidenceMonths");
  });
  it("[PR-2d] ⑫ API 직접 호출 — 상한 초과 400 · 「예」가 아닌데 개월을 보내도 400(조용히 무시되는 입력을 만들지 않는다) · 상한 이내는 200", async () => {
    const base = buildOneHouseExemptionApiBody(jForm({ giftPriorHouseholdResidenceMonths: "12" }));
    const ok = await postJudgment({ ...base });
    expect(ok.status, JSON.stringify(ok.json)).toBe(200);
    const over = await postJudgment({ ...base, giftPriorHouseholdResidenceMonths: 40 });
    expect(over.status).toBe(400);
    expect(JSON.stringify(over.json)).toContain("giftPriorHouseholdResidenceMonths");
    const edge = await postJudgment({ ...base, giftPriorHouseholdResidenceMonths: 39 });
    expect(edge.status).toBe(200);
    const notSame = await postJudgment({ ...base, giftSameHouseholdContinuous: false, giftHouseholdHoldingStartDate: undefined, giftPriorHouseholdResidenceMonths: 12 });
    expect(notSame.status).toBe(400);
    expect(JSON.stringify(notSame.json)).toContain("giftPriorHouseholdResidenceMonths");
  });
  it("[PR-2e] 게이트 술어 — 「예」인 증여·이월과세 주택만 묻는다(사망·아니오·비주택은 묻지 않는다)", () => {
    expect(giftPriorResidenceAsked(asset())).toBe(true);
    expect(giftPriorResidenceAsked(asset({ giftSameHousehold: "no" }))).toBe(false);
    expect(giftPriorResidenceAsked(asset({ giftDonorDeceased: true }))).toBe(false);
    expect(giftPriorResidenceAsked(asset({ assetKind: "land" }))).toBe(false);
    const carry = { ...asset(), acquisitionCause: "carryover_gift", carryover: { ...CARRYOVER_DEFAULTS, donorSameHousehold: "yes" } } as AssetForm;
    expect(giftPriorResidenceAsked(carry)).toBe(true);
    expect(giftPriorResidenceAsked({ ...carry, carryover: { ...carry.carryover!, donorSameHousehold: "no" } })).toBe(false);
  });
});

describe("PR-3 route(판정 메뉴) — 거주 24개월 경계 · 입력 없음은 통산하지 않고 결론을 가를 때만 확인 필요", () => {
  it("[PR-3a] 24개월은 비과세 · 23개월은 과세(경계 ±1) — 같은 사실, 개월만 다르다", async () => {
    const at = async (m: string) => (await runJudgment(jForm({ giftPriorHouseholdResidenceMonths: m }))).data.judgment.isExempt;
    expect(await at("23")).toBe(false);
    expect(await at("24")).toBe(true);
    expect(await at("39")).toBe(true);
  });
  it("[PR-3b] 증여 후 본인 거주와 합산한다 — 증여 후 12개월 + 증여 전 12개월 = 24개월이면 비과세, 11개월이면 과세", async () => {
    const at = async (m: string) =>
      (await runJudgment(jForm({ giftPriorHouseholdResidenceMonths: m, residencePeriodMonthsAsset: "12" }))).data.judgment.isExempt;
    expect(await at("11")).toBe(false);
    expect(await at("12")).toBe(true);
  });
  it("[PR-3c] 통산을 적용해 결론이 갈리면 확인 필요 — 국세청·법원 입장을 단정하지 않고 정면 해석 미확보를 적는다", async () => {
    const r = await runJudgment(jForm({ giftPriorHouseholdResidenceMonths: "24" }));
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.ve.filter((v) => v.startsWith("error"))).toEqual([]);
    expect(ids(r)).toContain(PRIOR);
    const reason = reasonOf(r, PRIOR);
    expect(reason).toContain("증여 전 동일세대 거주기간 24개월");
    expect(reason).toContain("서면인터넷방문상담4팀-912");
    expect(reason).toContain("정면으로 다룬 해석은 확인하지 못했습니다");
    expect(reason).toContain("표2 대상 판정(거주 2년)");
    expect(reason).toContain("공제율의 보유·거주기간에는 쓰지 않았습니다");
    // 비과세 쪽은 단정하지 않는다 — 확보하지 못한 인용을 쓰지 않는다
    expect(reason).not.toMatch(/서울고법|조심 2025서|인정한다|부정한다/);
  });
  it("[PR-3d] 입력이 없으면 통산하지 않고(과세) 「거주했다면 달라진다」를 고지한다 · 입력 0은 고지가 없다(긍정 짝)", async () => {
    const blank = await runJudgment(jForm({ giftPriorHouseholdResidenceMonths: "" }));
    expect(blank.data.judgment.isExempt).toBe(false);
    expect(ids(blank)).toContain(PRIOR);
    expect(reasonOf(blank, PRIOR)).toContain("입력되지 않아");
    const zero = await runJudgment(jForm({ giftPriorHouseholdResidenceMonths: "0" }));
    expect(zero.data.judgment.isExempt).toBe(false);
    expect(ids(zero)).not.toContain(PRIOR);
  });
  it("[PR-3e] 결론을 가르지 않으면 고지하지 않는다 — 비조정지역(거주요건 없음) · 이미 거주 24개월 · 증여 후 개월이 이미 충분", async () => {
    const nonReg = await runJudgment(jForm({ giftPriorHouseholdResidenceMonths: "" }, { wasRegulatedAtAcquisition: false }));
    expect(nonReg.data.judgment.isExempt).toBe(true);
    expect(ids(nonReg)).not.toContain(PRIOR);
    const enough = await runJudgment(jForm({ giftPriorHouseholdResidenceMonths: "12", residencePeriodMonthsAsset: "24" }));
    expect(enough.data.judgment.isExempt).toBe(true);
    expect(ids(enough)).not.toContain(PRIOR);
    const noneWithEnough = await runJudgment(jForm({ giftPriorHouseholdResidenceMonths: "", residencePeriodMonthsAsset: "24" }));
    expect(ids(noneWithEnough)).not.toContain(PRIOR);
  });
  it("[PR-3f] 계속 같은 세대가 아니면(아니오) 개월은 통산에 쓰이지 않는다 — 남은 값이 있어도 과세 · 고지 없음", async () => {
    const r = await runJudgment(jForm({ giftSameHousehold: "no", giftHouseholdHoldingStartDate: "", giftPriorHouseholdResidenceMonths: "24" }));
    expect(r.data.judgment.isExempt).toBe(false);
    expect(ids(r)).not.toContain(PRIOR);
    expect(r.body.giftPriorHouseholdResidenceMonths).toBeUndefined();
    // 긍정 짝: 「예」면 같은 개월이 통산된다
    const yes = await runJudgment(jForm({ giftPriorHouseholdResidenceMonths: "24" }));
    expect(yes.data.judgment.isExempt).toBe(true);
  });
  it("[PR-3g] 통산 세부 고지(DETAIL)와 별개다 — 개월 때문에 결론이 갈릴 때만 PRIOR가 나고, 둘은 서로의 게이트를 막지 않는다", async () => {
    const r = await runJudgment(jForm({ giftPriorHouseholdResidenceMonths: "24" }));
    expect(ids(r)).toContain(DETAIL); // 별도세대로 읽으면 과세 — 통산 자체가 결론을 가른다
    expect(ids(r)).toContain(PRIOR);
  });
});

/** 계산기: 직계존비속 증여 · 취득가액(증여 신고가액) 6억 · 양도가 18억(12억 초과) · 증여 후 본인 거주 12개월 · 증여일 3년 뒤 양도(장기보유특별공제 3년). */
const calcAsset = (over: Partial<AssetForm> = {}) =>
  asset({ giftDonorRelation: "other", addressJibun: "서울특별시 종로구 청운동 1-1", fixedAcquisitionPrice: "600000000", residencePeriodMonthsAsset: "12", ...over });
function calcForm(assetOver: Partial<AssetForm> = {}, over: Record<string, unknown> = {}): TransferFormData {
  const f = handoff(
    jForm({}, { assets: [calcAsset()], transferDate: "2025-07-01", contractTotalPrice: "1800000000", ...over }),
  );
  return { ...f, assets: [{ ...f.assets[0], ...assetOver } as AssetForm, ...f.assets.slice(1)] } as TransferFormData;
}
const has = (warnings: string[] | undefined, needle: string) => (warnings ?? []).some((w) => w.includes(needle));
const TABLE2_NOTICE = "표2(1세대1주택) 대상 판정";

describe("PR-4 route(계산기) — 고가주택 세액 방향과 표2 대상 판정 통산(#38-9) · 미답 확인 필요 고지(#38-8)", () => {
  it("[PR-4a] 증여 전 12개월을 통산하면 거주 24개월 → 과세에서 고가주택 부분 비과세로 바뀐다 (484,588,500 → 125,246,000 — 표2 대상이라 공제율 12%)", async () => {
    const none = await runCalc(calcForm({ giftPriorHouseholdResidenceMonths: "" }));
    expect(none.status, none.err).toBe(200);
    expect(none.issues).toEqual([]);
    expect(none.r.isPartialExempt).toBe(false);
    expect(none.totalTax).toBe(484_588_500);
    const eleven = await runCalc(calcForm({ giftPriorHouseholdResidenceMonths: "11" }));
    expect(eleven.totalTax).toBe(484_588_500); // 23개월 — 경계 −1
    const twelve = await runCalc(calcForm({ giftPriorHouseholdResidenceMonths: "12" }));
    expect(twelve.status, twelve.err).toBe(200);
    expect(twelve.r.isPartialExempt).toBe(true);
    expect(twelve.totalTax).toBe(125_246_000);
  });
  it("[PR-4b] 표2 대상 판정에 통산한다 — 증여 전 12개월 + 증여 후 12개월 = 거주 2년 → 표2 · 공제율은 보유 3년 × 4% = 12%만이다(본인 거주 12개월은 거주분 0)", async () => {
    const twelve = await runCalc(calcForm({ giftPriorHouseholdResidenceMonths: "12" }));
    expect(twelve.r.longTermHoldingRate).toBe(0.12); // 표1(6%)이 아니라 표2 보유분
    expect(twelve.r.longTermHoldingDeduction).toBe(48_000_000); // 과세 양도차익 4억 × 12%
    expect(has(twelve.warnings, TABLE2_NOTICE)).toBe(false); // 통산을 적용했으므로 해석이 갈린다는 고지는 없다
    // 경계 −1 — 통산 23개월이면 표1
    const eleven = await runCalc(calcForm({ giftPriorHouseholdResidenceMonths: "11" }));
    expect(eleven.r.longTermHoldingRate).toBe(0.06);
    // 증여 후 실거주 24개월을 직접 입력한 같은 사실은 거주분(8%)이 더해진 20% — 통산한 증여 전 거주는 거주분 공제율이 되지 않는다
    const direct = await runCalc(calcForm({ giftPriorHouseholdResidenceMonths: "", residencePeriodMonthsAsset: "24" }));
    expect(direct.r.longTermHoldingRate).toBe(0.2);
    expect(has(direct.warnings, TABLE2_NOTICE)).toBe(false);
  });
  it("[PR-4e] 공제율에는 통산하지 않는다 — 증여 전 거주를 상한 가까이(36개월) 넣어도 공제율은 12%로 같다(거주분은 본인 거주 12개월 기준 0)", async () => {
    const t36 = await runCalc(calcForm({ giftPriorHouseholdResidenceMonths: "36" }));
    expect(t36.status, t36.err).toBe(200);
    expect(t36.r.longTermHoldingRate).toBe(0.12);
    const t12 = await runCalc(calcForm({ giftPriorHouseholdResidenceMonths: "12" }));
    expect(t36.totalTax).toBe(t12.totalTax); // 통산 개월이 늘어도 공제율·세액이 같다
  });
  it("[PR-4c] 불발동 — 12억 이하(전액 비과세) · 입력 0 · 계속 같은 세대 아님 · 보유 3년 미만 · 이미 표2 대상", async () => {
    const small = await runCalc(calcForm({ giftPriorHouseholdResidenceMonths: "12" }, { contractTotalPrice: "1000000000" }));
    expect(small.status, small.err).toBe(200);
    expect(small.totalTax).toBe(0);
    expect(has(small.warnings, TABLE2_NOTICE)).toBe(false);
    const zero = await runCalc(calcForm({ giftPriorHouseholdResidenceMonths: "0" }));
    expect(has(zero.warnings, TABLE2_NOTICE)).toBe(false);
    const separate = await runCalc(calcForm({ giftSameHousehold: "no", giftHouseholdHoldingStartDate: "", giftPriorHouseholdResidenceMonths: "12" }));
    expect(has(separate.warnings, TABLE2_NOTICE)).toBe(false);
    const short = await runCalc(calcForm({ giftPriorHouseholdResidenceMonths: "12" }, { transferDate: "2025-05-01" }));
    expect(has(short.warnings, TABLE2_NOTICE)).toBe(false);
    const already = await runCalc(calcForm({ giftPriorHouseholdResidenceMonths: "12", residencePeriodMonthsAsset: "24" }));
    expect(has(already.warnings, TABLE2_NOTICE)).toBe(false);
  });
  it("[PR-4d] 입력이 없으면 비과세 거주요건 고지만 난다 — 요건 미충족(과세)이면 표2 고지는 나지 않는다 · 비조정지역에서는 입력이 없어도 표2 고지가 난다(상한 가정)", async () => {
    const none = await runCalc(calcForm({ giftPriorHouseholdResidenceMonths: "" }));
    expect(has(none.warnings, "입력되지 않아")).toBe(true);
    expect(has(none.warnings, TABLE2_NOTICE)).toBe(false);
    // 비조정지역 — 거주요건이 없어 고가주택 부분 비과세이고, 표2 대상 판정의 거주 2년은 별개다
    const nonReg = await runCalc(calcForm({ giftPriorHouseholdResidenceMonths: "" }, { wasRegulatedAtAcquisition: false }));
    expect(nonReg.r.isPartialExempt).toBe(true);
    expect(has(nonReg.warnings, TABLE2_NOTICE)).toBe(true);
    const t2 = (nonReg.warnings ?? []).find((x: string) => x.includes(TABLE2_NOTICE)) as string;
    expect(t2).toContain("입력되지 않았기에 통산하지 못했고"); // 비과세 쪽 고지(「입력되지 않아」)와 문구가 겹치지 않는다
    expect(t2).toContain("사전-2025-법규재산-0506"); // 표2 대상 판정의 통산은 정면 해석이 있다 — 「해석이 갈린다」고 쓰지 않는다
    expect(t2).not.toContain("해석이 갈립니다");
    expect(t2).toContain("공제율의 보유·거주기간은 증여일부터 센 본인의 기간");
    expect(has(nonReg.warnings, "입력되지 않아")).toBe(false); // 비과세 결론은 가르지 않는다
    expect(nonReg.r.longTermHoldingRate).toBe(0.06);
    // 입력 0이면 고지 없음(긍정 짝)
    const zero = await runCalc(calcForm({ giftPriorHouseholdResidenceMonths: "0" }, { wasRegulatedAtAcquisition: false }));
    expect(has(zero.warnings, TABLE2_NOTICE)).toBe(false);
  });
});

describe("PR-5 거주 구간 오류가 증여 전 거주 칸을 안내한다", () => {
  it("[PR-5a] 증여 전 거주 칸이 있는 입력이면 취득 전 입주 오류에 칸을 안내한다 · 아니면 종전 문구(긍정 짝)", () => {
    const args = { periods: [{ moveInDate: "2021-01-01", moveOutDate: "2023-01-01" }], acquisitionDate: "2022-06-01", transferDate: "2025-02-16" };
    const withHint = collectResidenceIntervalErrors({ ...args, giftPriorHint: true });
    expect(withHint.join("\n")).toContain("증여 전 동일세대 거주기간");
    const plain = collectResidenceIntervalErrors(args);
    expect(plain.join("\n")).not.toContain("증여 전 동일세대 거주기간");
    expect(plain.join("\n")).toContain("취득 전 임차 거주는 제외하고 입력하세요");
  });
  it("[PR-5c] 계산기 안내는 칸이 열리는 위치(첫 자산·D2 아님)에서만 — 건물만 증여받고 토지는 매수한 주택(D2)은 칸이 없어 안내하지 않는다", () => {
    const gift: AssetForm = { ...makeDefaultAsset(), assetKind: "housing", acquisitionCause: "gift", giftSameHousehold: "yes" };
    expect(calcGiftPriorResidenceAsked(gift)).toBe(true);
    const d2: AssetForm = { ...gift, hasSeperateLandAcquisitionDate: true, landCauseHost: "gift", landAcquisitionCause: "purchase" };
    expect(giftPriorResidenceAsked(d2)).toBe(true); // 판정 메뉴 술어는 D2를 모른다
    expect(calcGiftPriorResidenceAsked(d2)).toBe(false);
    // 이월과세 폼의 칸은 D2 게이트와 무관하게 열린다
    const carry: AssetForm = { ...makeDefaultAsset(), assetKind: "housing", acquisitionCause: "carryover_gift", carryover: { ...CARRYOVER_DEFAULTS, donorSameHousehold: "yes" } };
    expect(calcGiftPriorResidenceAsked(carry)).toBe(true);
  });
  it("[PR-5b] 판정 메뉴 ⑧이 칸이 있는 증여 주택(예)에서만 안내를 붙인다", () => {
    const interval = { residenceInputMode: "interval" as const, residencePeriods: [{ moveInDate: "2021-01-01", moveOutDate: "2023-01-01" }] };
    const msg = (o: Partial<AssetForm>) => errs3(jForm({ ...interval, ...o })).map((e) => e.message).join("\n");
    expect(msg({})).toContain("증여 전 동일세대 거주기간");
    expect(msg({ giftSameHousehold: "no" })).not.toContain("증여 전 동일세대 거주기간");
  });
});
