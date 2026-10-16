/**
 * 첫 자산 삭제 안내(Q-5) — 묶음 leaf·마커·키 분류 가드 anchor.
 * 계획서 `docs/00-pm/first-asset-change-step4-facts-notice.plan.md` §1(실측)·§3·§4.
 *
 * 실측 근거: 주택 두 건 `[A, B]`에서 A를 지우면 폼 전역 «양도 주택 선언» 12묶음 중 11개가 새 첫 자산의 ④ 본문에 그대로 실린다
 * (거주기간은 자산 객체에 있어 새지 않는다). 이 파일은 «어떤 묶음을 알리는가»와 «새 폼 키가 생기면 분류를 강제하는가»를 고정한다.
 */
import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
import { captureBody } from "./_helpers/redev-one-house-route";
import { HOUSE, LAND, form } from "./_helpers/g1-reverse-appurtenant-fixtures";
import { assetRemovalPatch } from "@/lib/calc/asset-removal";
import {
  FIRST_ASSET_FACT_GROUPS,
  firstAssetChangeNoteOnRemoval,
  firstAssetFactGroups,
  readFirstAssetChangeNote,
  visibleFirstAssetChangeGroups,
} from "@/lib/calc/first-asset-facts";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";

type F = TransferFormData;
const A = () => ({ ...HOUSE(0), assetId: "a1", assetLabel: "자산 1" });
const B = (o: Record<string, unknown> = {}) => ({
  ...HOUSE(0), assetId: "b1", assetLabel: "자산 2", addressJibun: "서울 테스트동 2", acquisitionDate: "2019-05-02",
  residencePeriodMonthsAsset: "0", residenceInputMode: "direct", ...o,
});
const base = (over: Partial<F> = {}, ...assets: Record<string, unknown>[]): F =>
  ({ ...(form(...(assets.length ? assets : [A(), B()])) as object), ...over }) as F;
const removed = (f: F, idx = 0): F => ({ ...f, ...assetRemovalPatch(f, idx) }) as F;

/** 분류 가드의 «제외» 쪽 — 이유와 함께. 새 폼 키가 생기면 여기나 묶음 중 한 곳에 넣어야 테스트가 통과한다. */
const EXCLUDED: Record<string, readonly string[]> = {
  "세대·주택 수(첫 자산이 바뀌어도 의미가 같다)": [
    "isOneHousehold", "householdHousingCount", "householdNoOtherHousesConfirmed", "householdNoPresaleRightsConfirmed",
    "householdRightCount", "houses", "presaleRights", "specialHouseExclusions", "priorReductionUsage",
  ],
  "분양권 단서(분양권 첫 자산에서만 전송 · Step4 별도 effect가 범위 밖이면 지운다)": ["presaleRightNoOtherRight", "presaleRightAgeOrSpouseMet"],
  "거래·세액 값": ["contractTotalPrice", "totalTransferExpense", "bundledSaleMode", "transferDate", "filingDate", "annualBasicDeductionUsed"],
  "옛 폼 전역 취득·환산 값(자산 객체가 정본 — ④가 읽지 않는다)": [
    "acquisitionMethod", "appraisalValue", "isSelfBuilt", "buildingType", "constructionDate", "extensionFloorArea",
    "pre1990Enabled", "pre1990PricePerSqm_1990", "pre1990PricePerSqm_atTransfer", "pre1990Grade_current", "pre1990Grade_prev",
    "pre1990Grade_atAcq", "pre1990GradeMode",
  ],
  "이미 처리(#2223 미등기) · 자산 객체로 이동(거주기간)": ["isUnregistered", "residencePeriodMonths"],
  "UI 보조 플래그": ["isRegulatedAreaTouched", "wasRegulatedAtAcquisitionTouched", "ruralHouseLocationTouched"],
  "가산세·정정신고": [
    "enablePenalty", "filingType", "penaltyReason", "priorPaidTax", "originalFiledTax", "excessRefundAmount", "interestSurcharge",
    "fraudulentPortion", "lateFilingNotified", "unpaidTax", "paymentDeadline", "actualPaymentDate", "amendmentMode",
    "originalDeterminedTax", "amendmentSourceId", "statutoryFilingDeadline", "amendedFilingDate", "applyUnderReportingPenalty",
    "underReportingReason", "underReductionMode", "priorAssessmentNotified", "applyLatePaymentPenalty", "amendedPaymentDate",
    "correctionKind", "claimReasonType", "posteriorEventDate", "originalPaymentDate",
  ],
};

describe("키 분류 가드 — 폼 전역 키 전수가 «묶음 / 제외» 중 정확히 한 곳", () => {
  const all = Object.keys(createDefaultTransferFormData()).filter((k) => k !== "assets");
  const grouped = FIRST_ASSET_FACT_GROUPS.flatMap((g) => g.keys as readonly string[]);
  const excluded = Object.values(EXCLUDED).flat();

  it("G-1: 분류되지 않은 키가 없다(새 키는 묶음이나 제외 목록에 넣어야 한다)", () => {
    const placed = new Set([...grouped, ...excluded]);
    expect(all.filter((k) => !placed.has(k))).toEqual([]);
  });
  it("G-2: 한 키가 두 곳에 있지 않다", () => {
    const seen = [...grouped, ...excluded];
    expect(seen.filter((k, i) => seen.indexOf(k) !== i)).toEqual([]);
  });
  it("G-3: 목록의 키가 실제 폼 키다(오타·삭제된 키 없음)", () => {
    const keys = new Set(all);
    expect([...grouped, ...excluded].filter((k) => !keys.has(k))).toEqual([]);
  });
  it("G-4: declaredBy는 keys의 부분집합이다", () => {
    for (const g of FIRST_ASSET_FACT_GROUPS) {
      expect((g.declaredBy as readonly string[]).filter((k) => !(g.keys as readonly string[]).includes(k))).toEqual([]);
    }
  });
});

describe("묶음 leaf — 삭제 후 폼에서 값이 있는 묶음", () => {
  it("L-0: 기본 폼은 빈 목록", () => {
    expect(firstAssetFactGroups(removed(base()))).toEqual([]);
  });
  const CASES: [string, Partial<F>, string][] = [
    ["조정대상지역", { wasRegulatedAtAcquisition: true }, "regulated"],
    ["조정대상지역(양도 당시)", { isRegulatedArea: true }, "regulated"],
    ["§154① 단서", { provisoReason: "expropriation", provisoExpropriationDate: "2025-01-01" }, "proviso"],
    ["합가(혼인)", { marriageDate: "2020-01-01" }, "merge"],
    ["합가(동거봉양)", { parentalCareMergeDate: "2020-01-01" }, "merge"],
    ["상속 일반주택", { generalHouseGiftedFromDecedentWithin2yr: true }, "inheritGeneral"],
    ["상속 입주권 선택", { inheritedRightChoiceWhenBothHeld: "presale_right" }, "inheritGeneral"],
    ["일시적 2주택 선언", { newHouseAcquisitionDate: "2025-05-01" }, "declared"],
    ["대체주택", { replacementHouseSpecial: true }, "declared"],
    ["농어촌주택", { ruralHouseSpecial: true }, "declared"],
    ["문화유산주택", { culturalHeritageHouseSpecial: true }, "declared"],
    ["입주권 예외", { rightThreeYearExceptionKind: "new_house" }, "declared"],
    ["합가 먼저 양도", { isFirstTransferredInMerge: true }, "declared"],
  ];
  it.each(CASES)("L-1: %s → %s", (_n, over, id) => {
    expect(firstAssetFactGroups(removed(base(over)))).toContain(id);
  });
  it("L-2: 최종 1주택 재기산은 범위(양도일 2021-01-01~2022-05-09) 안에서만", () => {
    expect(firstAssetFactGroups(removed(base({ transferDate: "2021-12-01", finalHouseRestartHistory: "yes" })))).toContain("finalRestart");
    expect(firstAssetFactGroups(removed(base({ transferDate: "2026-02-16", finalHouseRestartHistory: "yes" })))).not.toContain("finalRestart");
  });
  it("L-3: 「해당 없음」(none)·빈 값은 선언이 아니다", () => {
    expect(firstAssetFactGroups(removed(base({ rightThreeYearExceptionKind: "none", mergedHouseholdFirstHouseKind: "none" })))).toEqual([]);
  });
  it("L-4: 새 첫 자산에 소재지 코드가 있으면 조정대상지역은 제외(④는 주소 판정값을 싣는다 — 실측 diff 빈 값)", () => {
    const f = removed(base({ wasRegulatedAtAcquisition: true }, A(), B({ regionCode: "1168010100" })));
    expect(firstAssetFactGroups(f)).not.toContain("regulated");
  });
  it("L-5: 폼 전역 소재지 코드 폴백도 같다", () => {
    const f = { ...removed(base({ wasRegulatedAtAcquisition: true })), regionCode: "1168010100" } as F;
    expect(firstAssetFactGroups(f)).not.toContain("regulated");
  });
  it("L-6: 새 첫 자산이 토지면 빈 목록(주택 사실이 아니다)", () => {
    const f = removed(base({ wasRegulatedAtAcquisition: true, marriageDate: "2020-01-01" }, A(), LAND("l1", 300)));
    expect(firstAssetFactGroups(f)).toEqual([]);
  });
  it("L-7: gates.proviso=false면 단서 묶음을 뺀다(Step4 노출 맥락 밖)", () => {
    const f = removed(base({ provisoReason: "expropriation" }));
    expect(firstAssetFactGroups(f, { proviso: false })).not.toContain("proviso");
  });
});

describe("마커 — 삭제 시점 스냅샷", () => {
  const f = base({ wasRegulatedAtAcquisition: true, marriageDate: "2020-01-01" });
  it("N-1: 첫 자산 삭제 + 선언 있음 → 마커(새 첫 자산 id·묶음)", () => {
    const patch = assetRemovalPatch(f, 0);
    expect(firstAssetChangeNoteOnRemoval(f, 0, patch)).toEqual({ newFirstAssetId: "b1", groups: ["regulated", "merge"] });
  });
  it("N-2: 선언이 없으면 마커 없음(undefined — 이전 마커도 지운다)", () => {
    const g = base();
    expect(firstAssetChangeNoteOnRemoval(g, 0, assetRemovalPatch(g, 0))).toBeUndefined();
  });
  it("N-3: 새 첫 자산이 소재지 코드를 가지면 조정대상지역 줄은 스냅샷에 없다", () => {
    const g = base({ wasRegulatedAtAcquisition: true, marriageDate: "2020-01-01" }, A(), B({ regionCode: "1168010100" }));
    expect(firstAssetChangeNoteOnRemoval(g, 0, assetRemovalPatch(g, 0))?.groups).toEqual(["merge"]);
  });
  it("N-4: 읽기 가드 — 모양이 틀리거나 알 수 없는 묶음만 있으면 undefined", () => {
    expect(readFirstAssetChangeNote(undefined)).toBeUndefined();
    expect(readFirstAssetChangeNote({ newFirstAssetId: "b1", groups: ["nope"] })).toBeUndefined();
    expect(readFirstAssetChangeNote({ newFirstAssetId: "b1", groups: ["merge", "nope"] })?.groups).toEqual(["merge"]);
    expect(readFirstAssetChangeNote({ newFirstAssetId: 1, groups: ["merge"] })).toBeUndefined();
  });
});

describe("카드가 그릴 묶음 — 스냅샷 ∩ 지금도 값이 있는 묶음", () => {
  const note = { newFirstAssetId: "b1", groups: ["regulated", "merge"] as const };
  const after = (over: Partial<F> = {}): F =>
    ({ ...removed(base({ wasRegulatedAtAcquisition: true, marriageDate: "2020-01-01" })), firstAssetChangeNote: { ...note, groups: [...note.groups] }, ...over }) as F;

  it("V-1: 둘 다 남아 있으면 둘 다", () => {
    expect(visibleFirstAssetChangeGroups(after())?.groups).toEqual(["regulated", "merge"]);
  });
  it("V-2: 사용자가 한 묶음을 비우면 그 줄만 사라진다", () => {
    expect(visibleFirstAssetChangeGroups(after({ marriageDate: "" }))?.groups).toEqual(["regulated"]);
  });
  it("V-3: 전부 비우면 카드가 없다", () => {
    expect(visibleFirstAssetChangeGroups(after({ marriageDate: "", wasRegulatedAtAcquisition: false }))).toBeNull();
  });
  it("V-4: 스냅샷에 없던 묶음을 삭제 뒤에 채워도 뜨지 않는다", () => {
    expect(visibleFirstAssetChangeGroups(after({ culturalHeritageHouseSpecial: true }))?.groups).toEqual(["regulated", "merge"]);
  });
  it("V-5: 마커가 가리키는 새 첫 자산이 지금 첫 자산이 아니면 숨긴다", () => {
    const f = after();
    expect(visibleFirstAssetChangeGroups({ ...f, assets: [{ ...f.assets[0], assetId: "zz" }] })).toBeNull();
  });
  it("V-6: 마커가 없으면 null", () => {
    expect(visibleFirstAssetChangeGroups(removed(base({ marriageDate: "2020-01-01" })))).toBeNull();
  });
});

describe("④ 비전송 — 마커가 있어도 본문이 바이트 동일", () => {
  it("T-1: firstAssetChangeNote는 ④ 본문에 실리지 않는다", async () => {
    const f = removed(base({ wasRegulatedAtAcquisition: true }));
    const withNote = { ...f, firstAssetChangeNote: { newFirstAssetId: "b1", groups: ["regulated"] } } as F;
    expect(JSON.stringify(await captureBody(withNote))).toBe(JSON.stringify(await captureBody(f)));
  });
});

describe("실측 연결 — 묶음에 오른 선언은 실제로 새 첫 자산의 ④ 본문을 바꾼다(거짓 경보 방지)", () => {
  const LEAK: [string, Partial<F>][] = [
    ["regulated", { wasRegulatedAtAcquisition: true }],
    ["proviso", { provisoReason: "expropriation", provisoExpropriationDate: "2025-01-01" }],
    ["finalRestart", { transferDate: "2021-12-01", finalHouseRestartHistory: "yes" }],
    ["merge", { marriageDate: "2020-01-01" }],
    ["inheritGeneral", { generalHouseGiftedFromDecedentWithin2yr: true, generalHouseGiftDate: "2020-01-01" }],
    ["declared:일시적 2주택", { temporaryTwoHouseSpecial: true, newHouseAcquisitionDate: "2025-05-01" }],
    ["declared:대체주택", { householdHousingCount: "2", replacementHouseSpecial: true, replBusinessApprovalDate: "2015-01-01", replCompletionDate: "2019-01-01", replResidenceMonths: "12", replWillResideNewHouse: true }],
    ["declared:농어촌", { ruralHouseSpecial: true, ruralHouseKind: "inherited", ruralHouseDecedentResidenceYears: "10" }],
    ["declared:문화유산", { culturalHeritageHouseSpecial: true }],
    ["declared:입주권 예외", { rightThreeYearExceptionKind: "new_house", rightNewHouseCompletionDate: "2020-01-01", rightMovedInWithin3Years: true, rightResidedOneYearOrMore: true }],
    ["declared:합가 먼저 양도", { isFirstTransferredInMerge: true }],
  ];
  it.each(LEAK)("T-2: %s", async (_n, over) => {
    const canonOver: Partial<F> = {
      ...(over.transferDate ? { transferDate: over.transferDate } : {}),
      ...(over.householdHousingCount ? { householdHousingCount: over.householdHousingCount } : {}),
    };
    const canon = await captureBody(base(canonOver, B()));
    const got = await captureBody(removed(base(over)));
    expect(JSON.stringify(got)).not.toBe(JSON.stringify(canon));
  });
});
