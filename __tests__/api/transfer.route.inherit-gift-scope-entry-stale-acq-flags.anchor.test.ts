/**
 * anchor(route) — 상속·증여가 자산 종류 변경·겸용 OFF로 일반 범위에 들어올 때 남는 산정 방식 플래그
 * (계획서 `docs/02-design/features/inherit-gift-scope-entry-stale-acq-flags.plan.md` — #2594 V-1).
 *
 * 수정 전(전환 patch에 정리 없음): 상속 감정 ⑧ 통과 → 서버 400 · 매매사례 ⑧ 화면에 없는 칸 · 환산(취득 당시 기준시가 빈칸) ⑧ 막다른 길 ·
 *   증여 3종 ⑧ 차단(끌 라디오 없음) · 옛 형식 직접 필요경비가 있으면 상속 환산·감정·매매사례가 경비를 0으로 실어 280,530,000(대조 277,002,000).
 * 복원(저장 폼 재로드)은 종전에도 대조로 고친다. 수정: 화면 전환 patch에 복원과 같은 규칙(`genericScopeEntryClearPatch`)을 싣는다.
 * 화면 결합(버튼·토글이 실제로 싣는가)은 render anchor `__tests__/components/inherit-gift-scope-entry-stale-acq-flags.anchor.test.tsx`.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { allIssues } from "../calc/_helpers/redev-one-house-route";
import { captureBody } from "../calc/_helpers/redev-one-house-route";
import { postTransfer } from "../calc/_helpers/redev-one-house-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { migratePersistedTransferForm } from "@/lib/stores/calc-wizard-store";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { areaResetPatchForAssetKind } from "@/components/calc/transfer/asset-sections/AssetAreaSection";
import { redevSubjectPatchForAssetKind } from "@/components/calc/transfer/asset-sections/AssetAreaRedevelopment";
import { housingFlagResetPatchForAssetKind } from "@/components/calc/transfer/asset-sections/housing-flag-reset";
import { genericScopeEntryClearPatch } from "@/lib/calc/transfer-generic-scope-entry";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

/** route body·응답 탐색용 느슨한 타입(기존 anchor와 같은 관례) */
type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const HH = {
  transferDate: "2023-02-16", filingDate: "2023-04-30", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false,
  householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
};
/** 2015 상속 주택 · 평가액 3억 · 양도 12억 */
const INH: Loose = {
  addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "inheritance", acquisitionDate: "2015-01-01",
  decedentAcquisitionDate: "2005-01-01", actualSalePrice: "1,200,000,000", publishedValueAtInheritance: "300,000,000",
  inheritanceValuationMethod: "supplementary", fixedAcquisitionPrice: "", acquisitionArea: "100", transferArea: "100",
  standardPricePerSqmAtTransfer: "5600000", buildingStandardPriceAtTransfer: "840000000", standardPricePerSqmAtAcq: "2400000",
  standardPriceAtAcq: "480000000", buildingStandardPriceAtAcq: "360000000", standardPriceAtTransfer: "1400000000",
};
/** 같은 물건 · 증여(신고가액 3억 · 제3자) */
const GIFT: Loose = {
  ...INH, acquisitionCause: "gift", publishedValueAtInheritance: "", inheritanceValuationMethod: "", decedentAcquisitionDate: "",
  fixedAcquisitionPrice: "300,000,000", donorAcquisitionDate: "2005-01-01", giftDonorRelation: "other", giftSameHousehold: "no",
};
/** 취득 당시 기준시가 칸을 비운 상태 — 상속 일반 카드에는 그 칸이 없다(#2594 §1 화면 실측) */
const NO_ACQ_STD = { standardPricePerSqmAtAcq: "", standardPriceAtAcq: "", buildingStandardPriceAtAcq: "" };
const CONTROL = 280_530_000;

const asset = (a: Loose) => ({ ...makeDefaultAsset(1), ...a }) as AssetForm;
const form = (a: Loose): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), {
    ...HH, contractTotalPrice: String(a.actualSalePrice).replace(/,/g, ""), assets: [asset(a)],
  }) as TransferFormData;

/** 자산 종류 버튼과 같은 합성(`AssetSectionBasic.tsx`) — `fix`면 진입 정리까지 */
function kindSwitch(start: Loose, kind: AssetForm["assetKind"], fix: boolean): Loose {
  const prev = asset(start);
  const next = { assetKind: kind, ...areaResetPatchForAssetKind(prev, kind), ...redevSubjectPatchForAssetKind(kind), ...housingFlagResetPatchForAssetKind(kind) };
  return { ...start, ...next, ...(fix ? genericScopeEntryClearPatch(prev, { ...prev, ...next }) : {}) };
}
/** 겸용 토글 OFF와 같은 합성(`MixedUseSection.tsx`) */
function mixedOff(start: Loose, fix: boolean): Loose {
  const prev = asset(start);
  return { ...start, isMixedUseHouse: false, ...(fix ? genericScopeEntryClearPatch(prev, { ...prev, isMixedUseHouse: false }) : {}) };
}

async function run(a: Loose) {
  const f = form(a);
  const r = await postTransfer((await captureBody(f)) as Loose);
  const fe = (r as Loose).json?.error?.fieldErrors as Record<string, unknown> | undefined;
  return {
    messages: allIssues(f).map((i) => i.message),
    status: r.status,
    tax: (r.result as Loose | undefined)?.calculatedTax as number | undefined,
    serverFields: fe ? Object.keys(fe).sort() : [],
  };
}
const restored = (a: Loose): Loose => migratePersistedTransferForm(form(a)).assets[0] as unknown as Loose;

const EST = { useEstimatedAcquisition: true };
const APPR = { isAppraisalAcquisition: true };
const SALES = { isSalesCaseAcquisition: true };

describe("상속 — 수정 전 계약(막다른 길)과 수정 후 대조", () => {
  it("대조: 플래그 없는 상속 주택·토지 = 280,530,000", async () => {
    for (const kind of ["housing", "land"] as const) {
      expect(await run(kindSwitch({ ...INH, assetKind: "redevelopment_apt" }, kind, false))).toMatchObject({ messages: [], status: 200, tax: CONTROL });
    }
  });

  it("수정 전: 감정 → ⑧ 통과 · 서버 400 appraisalValue / 매매사례 → ⑧ 「매매사례가액」 / 환산(기준시가 빈칸) → ⑧ 「취득 당시 기준시가」", async () => {
    const appr = await run(kindSwitch({ ...INH, assetKind: "right_to_move_in", ...APPR }, "housing", false));
    expect([appr.messages, appr.status, appr.serverFields]).toEqual([[], 400, ["appraisalValue"]]);
    const sales = await run(kindSwitch({ ...INH, assetKind: "right_to_move_in", ...SALES }, "housing", false));
    expect(sales.messages.join()).toContain("매매사례가액을 입력하세요");
    const est = await run(kindSwitch({ ...INH, ...NO_ACQ_STD, assetKind: "redevelopment_apt", ...EST }, "housing", false));
    expect(est.messages.join()).toContain("취득 당시 기준시가를 입력하세요");
    const mixed = await run(mixedOff({ ...INH, ...NO_ACQ_STD, isMixedUseHouse: true, ...EST, usePreHousingDisclosure: true }, false));
    expect(mixed.messages.join()).toContain("취득 당시 기준시가를 입력하세요");
  });

  describe.each([["redevelopment_apt"], ["right_to_move_in"]] as const)("수정 후 — %s에서", (from) => {
    it.each([["환산", EST], ["감정", APPR], ["매매사례", SALES]] as const)("%s → 주택·토지 × 기준시가 칸 채움·비움: ⑧ 통과 · 200 · 대조", async (_n, fl) => {
      for (const kind of ["housing", "land"] as const) {
        for (const std of [{}, NO_ACQ_STD]) {
          expect(await run(kindSwitch({ ...INH, ...std, assetKind: from, ...fl }, kind, true))).toMatchObject({ messages: [], status: 200, tax: CONTROL });
        }
      }
    });
  });

  it("수정 후 — 겸용 「개별주택가격 미공시」 → 겸용 OFF · 겸용 → 단순토지: 대조", async () => {
    const mixed = { ...INH, ...NO_ACQ_STD, isMixedUseHouse: true, hasSeperateLandAcquisitionDate: true, landAcquisitionDate: INH.acquisitionDate, ...EST, usePreHousingDisclosure: true };
    expect(await run(mixedOff(mixed, true))).toMatchObject({ messages: [], status: 200, tax: CONTROL });
    expect(await run(kindSwitch(mixed, "land", true))).toMatchObject({ messages: [], status: 200, tax: CONTROL });
  });

  it("수정 후 = 복원 후 — 화면 세션의 전환 결과가 저장 폼을 다시 연 결과와 같다(플래그 3종 false)", async () => {
    const before = kindSwitch({ ...INH, assetKind: "right_to_move_in", ...APPR }, "housing", false);
    const after = kindSwitch({ ...INH, assetKind: "right_to_move_in", ...APPR }, "housing", true);
    const r = restored(before);
    expect([after.useEstimatedAcquisition, after.isAppraisalAcquisition, after.isSalesCaseAcquisition]).toEqual([false, false, false]);
    expect([r.useEstimatedAcquisition, r.isAppraisalAcquisition, r.isSalesCaseAcquisition]).toEqual([false, false, false]);
    expect((await run(r)).tax).toBe(CONTROL);
  });

  it("옛 형식 직접 필요경비 1천만 — 수정 전 남은 환산이 경비를 0으로 실어 280,530,000 · 수정 후 대조 277,002,000(조용한 오계산 바로잡힘)", async () => {
    const start = { ...INH, assetKind: "redevelopment_apt", ...EST, directExpenses: "10,000,000" };
    expect((await run(kindSwitch(start, "housing", false))).tax).toBe(280_530_000);
    expect((await run(kindSwitch(start, "housing", true))).tax).toBe(277_002_000);
    expect((await run({ ...INH, directExpenses: "10,000,000" })).tax).toBe(277_002_000);
  });
});

describe("증여 — 수정 전 ⑧ 차단 · 수정 후 대조", () => {
  it.each([["환산", EST], ["감정", APPR], ["매매사례", SALES]] as const)("%s", async (_n, fl) => {
    const before = await run(kindSwitch({ ...GIFT, assetKind: "right_to_move_in", ...fl }, "housing", false));
    expect(before.messages.join()).toContain("증여 취득 자산은 환산취득가·감정가액·매매사례가액을 지원하지 않습니다");
    for (const from of ["redevelopment_apt", "right_to_move_in"] as const) {
      for (const kind of ["housing", "land"] as const) {
        expect(await run(kindSwitch({ ...GIFT, assetKind: from, ...fl }, kind, true))).toMatchObject({ messages: [], status: 200, tax: CONTROL });
      }
    }
  });

  it("겸용 「개별주택가격 미공시」 → 겸용 OFF: 수정 전 ⑧ 차단 · 수정 후 대조", async () => {
    const mixed = { ...GIFT, isMixedUseHouse: true, ...EST, usePreHousingDisclosure: true };
    expect((await run(mixedOff(mixed, false))).messages.join()).toContain("증여 취득 자산은");
    expect(await run(mixedOff(mixed, true))).toMatchObject({ messages: [], status: 200, tax: CONTROL });
  });
});

describe("범위 — 복원과 같은 경계", () => {
  const prev = (a: Loose) => asset(a);
  it("범위 안 → 범위 안(주택 → 토지)·매매·부담부증여는 빈 patch", () => {
    expect(genericScopeEntryClearPatch(prev({ ...INH, ...EST }), prev({ ...INH, ...EST, assetKind: "land" }))).toEqual({});
    expect(genericScopeEntryClearPatch(prev({ ...INH, acquisitionCause: "purchase", assetKind: "redevelopment_apt", ...EST }), prev({ ...INH, acquisitionCause: "purchase", ...EST }))).toEqual({});
    const bg = { ...GIFT, transferType: "burdened_gift", ...EST };
    expect(genericScopeEntryClearPatch(prev({ ...bg, assetKind: "redevelopment_apt" }), prev(bg))).toEqual({});
  });
  it("범위 밖에 머무는 전환(재개발 → 입주권)은 빈 patch — §166③ 라디오가 그 카드에 그대로 있다", () => {
    expect(genericScopeEntryClearPatch(prev({ ...INH, assetKind: "redevelopment_apt", ...EST }), prev({ ...INH, assetKind: "right_to_move_in", ...EST }))).toEqual({});
  });
  it("D2(건물 상속 + 토지 매매)는 빈 patch — 복원(`clearInheritedStaleAcqInputs`)도 건너뛴다", () => {
    const d2 = { ...INH, hasSeperateLandAcquisitionDate: true, landCauseHost: "inheritance", landAcquisitionCause: "purchase", ...EST };
    expect(genericScopeEntryClearPatch(prev({ ...d2, isMixedUseHouse: true }), prev(d2))).toEqual({});
  });
});
