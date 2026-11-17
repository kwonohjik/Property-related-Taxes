/**
 * anchor — 겸용주택 × 부담부증여 × **함께 양도 묶음** 화면 경로 (PR-B 화면 단계 · ⑥⑧ + ⑤ 파생 값).
 *
 * route anchor(`transfer.route.mixed-use-bg-companion.anchor.test.ts` CP-1·CP-2·CP-8)는 귀속을 `unallocated`로 **넣어** 시드한다. 화면은 묶음 안 겸용의 귀속 선택지를 받지 않으므로
 * (귀속 카드가 읽기 전용) 사용자는 귀속을 **고르지 못한다** — 그 상태(미선택)로 ⑧이 막지 않아야 하고(막다른 길 금지), 계산 값은 route anchor와 같아야 한다.
 *
 * 축: ⑧ 0건(미선택) · 남은 주택·상가 선언 → MB-19 점프 칸 · 비보충 승 → MB-20 점프 칸 · 축 B → MB-6 · ⑥ 사이드바(계산 전 pending · 계산 후 = 엔진 echo = 카드 합) · ⑤ 재배분 채무 표시 값 = ④ 전송 값.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { allIssues, captureBody } from "./_one-house-pr3a-calc-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { rosterForDeclaredCount } from "@/__tests__/calc/_helpers/roster-for-declared-count";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import { mixedBgBundleMember, mixedBgIssueField } from "@/lib/calc/burdened-gift-mixed-use-preview";
import { mixedBgBundleAttrFixField } from "@/lib/calc/burdened-gift-mixed-use-scope";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const x = (o: Record<string, unknown>) => o as unknown as Partial<AssetForm>;

/** 부담부증여 주택(기준시가 모드) — 양도시 6억 · 취득시 3억 (route anchor와 같은 시료) */
const house = (id: number, debt: string, ...over: Partial<AssetForm>[]) => Object.assign({ ...makeDefaultAsset(id) }, x({
  assetId: `h${id}`, addressJibun: `제주특별자치도 강남구 테스트동 ${id}-${id}`, assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01",
  fixedAcquisitionPrice: "300000000", actualSalePrice: "", standardPriceAtTransfer: "600000000", standardPriceAtAcq: "300000000", useEstimatedAcquisition: false,
  transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", bgDonorRelation: "lineal_descendant",
  bgLendingDepositTotal: "0", bgMortgageDebtAmount: debt, bgMortgageSetAmount: debt,
}), ...over) as AssetForm;

/** 겸용(기준시가 모드) — 양도시 12억(주택 6억 + 상가 6억) · 취득시 6억. **귀속 미선택**(화면이 받지 않는다) */
const mixed = (id: number, debt: string, ...over: Partial<AssetForm>[]) => Object.assign({ ...makeDefaultAsset(id) }, x({
  assetId: `m${id}`, addressJibun: `제주특별자치도 강남구 테스트동 ${id}-${id}`, assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2010-03-15",
  isMixedUseHouse: true, mixedAcqPerPartMode: false, residentialFloorArea: "100", nonResidentialFloorArea: "100", mixedUseTotalLandArea: "200", buildingFootprintArea: "100",
  mixedTransferHousingPrice: "600000000", mixedTransferLandPricePerSqm: "5000000", mixedTransferCommercialBuildingPrice: "100000000",
  mixedAcqHousingPrice: "300000000", mixedAcqLandPricePerSqm: "2500000", mixedAcqCommercialBuildingPrice: "50000000",
  mixedAcqHousingBuildingStdPrice: "50000000", mixedTransferHousingBuildingStdPrice: "100000000", mixedIsMetropolitanArea: true,
  transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", bgDonorRelation: "lineal_descendant",
  bgLendingDepositTotal: "0", bgMortgageDebtAmount: debt, bgMortgageAttribution: "", bgMortgageSetAmount: debt,
}), ...over) as AssetForm;

const FORM = { transferDate: "2024-03-01", filingDate: "2024-05-31", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true };
const bundle = (assets: AssetForm[], extra: Record<string, unknown> = {}): TransferFormData =>
  rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), FORM, { assets, contractTotalPrice: "", assetSplitMode: "companion", bundledSaleMode: "actual" }, extra)) as TransferFormData;
const single = (a: AssetForm): TransferFormData =>
  rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), FORM, { assets: [a], contractTotalPrice: "" })) as TransferFormData;

async function calc(f: TransferFormData) {
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
  return { status: res.status, j: (await res.json()) as Loose, body: body as Loose };
}

describe("⑧ — 묶음 안 겸용은 귀속을 고르지 않아도 막지 않는다(귀속 카드가 읽기 전용)", () => {
  it("[SC-1] route CP-1과 같은 시료(주택 채무 2억 + 겸용 채무 6억) · 귀속 미선택 → ⑧ 0건 · 200 · 겸용 B_i 533,333,334 · 귀속 3칸은 body에 없다", async () => {
    const f = bundle([house(1, "200000000"), mixed(2, "600000000")]);
    expect(allIssues(f)).toEqual([]);
    const r = await calc(f);
    expect(r.status).toBe(200);
    expect(r.body.companionAssets[0].burdenedGiftInfo.assumedDebtOverride).toBe(533_333_334);
    expect(r.body.companionAssets[0].burdenedGiftInfo.debtAttribution).toBeUndefined();
    expect(r.j.data.aggregated.mixedUseBgDetailsByAsset.m2.debtAttribution).toMatchObject({ housing: 0, commercial: 0, unallocated: 533_333_334 });
  });

  it("[SC-2] route CP-2 — 주 자산이 겸용 · 귀속 미선택 → ⑧ 0건 · 200 · 명세 슬롯 키 primary", async () => {
    const f = bundle([mixed(1, "600000000"), house(2, "200000000")]);
    expect(allIssues(f)).toEqual([]);
    const r = await calc(f);
    expect(r.status).toBe(200);
    expect(r.j.data.aggregated.mixedUseBgDetailsByAsset.primary.assumedDebtAmount).toBe(533_333_333);
  });

  it("[SC-3] route CP-8 — 겸용 지분 50% · 귀속 미선택 → ⑧ 0건 · 200", async () => {
    const SH = x({ ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" });
    const f = bundle([house(1, "200000000"), mixed(2, "300000000", SH)]);
    expect(allIssues(f)).toEqual([]);
    expect((await calc(f)).status).toBe(200);
  });

  it("🔴 짝: 같은 겸용을 단건으로 두면 귀속 미선택이 ⑧에 막힌다(귀속 칸으로 이동) — 위 0건이 «귀속 요구 해제» 때문임을 구별", () => {
    const issues = allIssues(single(mixed(1, "600000000")));
    expect(issues.some((m) => m.includes(":bgMortgageAttribution:"))).toBe(true);
  });

  it("[SC-4] 남아 있는 주택 귀속 선언은 지우지 않고 ⑧이 막는다(MB-19) — 점프 칸은 그 항목의 귀속 라디오 · 짝: 구분 불분명이면 0건", async () => {
    const f = bundle([house(1, "200000000"), mixed(2, "600000000", x({ bgMortgageAttribution: "housing" }))]);
    const issues = allIssues(f);
    expect(issues.some((m) => m.includes(":bgMortgageAttribution:"))).toBe(true);
    expect(issues.join("\n")).toContain("구분 불분명");
    expect(mixedBgBundleAttrFixField(f.assets[1])).toBe("bgMortgageAttribution");
    // 임대보증금 귀속이 남은 경우는 임대보증금 칸
    const dep = bundle([house(1, "200000000"), mixed(2, "300000000", x({ bgLendingDepositTotal: "100000000", bgDepositAttribution: "commercial", bgMortgageAttribution: "unallocated" }))]);
    expect(allIssues(dep).some((m) => m.includes(":bgDepositAttribution:"))).toBe(true);
    // 짝 — 구분 불분명으로 바꾸면 0건
    const ok = bundle([house(1, "200000000"), mixed(2, "600000000", x({ bgMortgageAttribution: "unallocated" }))]);
    expect(allIssues(ok)).toEqual([]);
    expect(mixedBgBundleAttrFixField(ok.assets[1])).toBeUndefined();
  });

  it("[SC-5] 비보충 승(담보 승 — 근저당 13억 > 보충 12억)은 ⑧이 막고 점프 칸은 담보차입금(MB-20)", () => {
    const f = bundle([house(1, "200000000"), mixed(2, "1300000000")]);
    const issues = allIssues(f);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((m) => m.includes(":bgMortgageDebtAmount:"))).toBe(true);
    // 묶음 승자 게이트(`validate.ts` · 자산 카드 단위 이슈)도 같은 칸을 가리킨다 — 종전에는 field가 없어 카드 맨 위로만 갔다
    expect(issues.some((m) => m.includes("담보평가(상증법 §66)") && m.includes(":bgMortgageDebtAmount:"))).toBe(true);
  });

  it("[SC-6] 지분 분할 취득(축 B) 겸용 부담부증여는 계속 막는다(MB-6) — 점프 칸 transferType", () => {
    const f = rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), FORM, {
      assets: [mixed(1, "600000000", x({ ownershipNumerator: "60", ownershipDenominator: "100" })), mixed(2, "600000000", x({ ownershipNumerator: "40", ownershipDenominator: "100" }))],
      contractTotalPrice: "", assetSplitMode: "fractional",
    })) as TransferFormData;
    const issues = allIssues(f);
    expect(issues.some((m) => m.includes(":transferType:") && m.includes("지분 분할 취득"))).toBe(true);
  });
});

describe("⑤ 표시 값 = ④ 전송 값 — 재배분 채무", () => {
  it("[SC-7] mixedBgBundleMember: 묶음 안 겸용은 ④가 body에 싣는 값과 같은 B_i, 묶음 밖·겸용 아님·축 B는 undefined", async () => {
    const f = bundle([house(1, "200000000"), mixed(2, "600000000")]);
    const body = await captureBody(f);
    const sent = (body as Loose).companionAssets[0].burdenedGiftInfo.assumedDebtOverride;
    expect(mixedBgBundleMember(f.assets, "companion", "m2")).toEqual({ debt: sent });
    expect(sent).toBe(533_333_334);
    // 겸용이 아닌 자산 · 단건 · 축 B는 묶음 겸용이 아니다
    expect(mixedBgBundleMember(f.assets, "companion", "h1")).toBeUndefined();
    expect(mixedBgBundleMember([f.assets[1]], undefined, "m2")).toBeUndefined();
    const axisB = [mixed(1, "600000000", x({ ownershipNumerator: "60", ownershipDenominator: "100" })), mixed(2, "600000000", x({ ownershipNumerator: "40", ownershipDenominator: "100" }))];
    expect(mixedBgBundleMember(axisB, "fractional", "m1")).toBeUndefined();
  });

  it("[SC-8] 배분 근거(자산별 증여가액 합)가 0이면 debt가 undefined — 0원으로 메우지 않는다 · 짝: 채무만 있으면 그 채무가 증여가액이라 값이 나온다(⑧은 평가액·승자로 따로 막는다)", () => {
    const noStd = (debt: string) => [
      house(1, debt, x({ standardPriceAtTransfer: "" })),
      mixed(2, debt, x({ mixedTransferHousingPrice: "", mixedTransferLandPricePerSqm: "", mixedTransferCommercialBuildingPrice: "" })),
    ];
    expect(mixedBgBundleMember(noStd(""), "companion", "m2")).toEqual({ debt: undefined });
    expect(mixedBgBundleMember(noStd("600000000"), "companion", "m2")?.debt).toBe(600_000_000);
  });

  it("[SC-9] mixedBgIssueField: MB-19는 남은 귀속 항목 · MB-20은 담보 칸(담보가 없고 보증금만 있으면 보증금 칸)", () => {
    const stale = mixed(2, "600000000", x({ bgMortgageAttribution: "commercial" }));
    const iss = (code: "MB-19" | "MB-20") => ({ code, message: "", path: ["burdenedGiftInfo"] }) as never;
    expect(mixedBgIssueField(iss("MB-19"), stale)).toBe("bgMortgageAttribution");
    expect(mixedBgIssueField(iss("MB-20"), stale)).toBe("bgMortgageDebtAmount");
    expect(mixedBgIssueField(iss("MB-20"), mixed(2, "", x({ bgLendingDepositTotal: "300000000" })))).toBe("bgLendingDepositTotal");
  });
});

describe("⑥ 사이드바 — 묶음 안 겸용 부담부증여는 자산마다 엔진 echo를 읽는다", () => {
  const parts = (d: Loose) => Object.values(d.perPart) as Loose[];
  const sum = (d: Loose, k: string) => parts(d).reduce((n, p) => n + p[k], 0);

  it("[SC-10] 계산 전: 겸용 두 자산(주·컴패니언)의 양도가액·취득가액·필요경비는 «계산 후 표시» — 귀속 입력으로 «양도 없음» 문구를 만들지 않는다", () => {
    const f = bundle([mixed(1, "300000000", x({ bgMortgageAttribution: "commercial" })), mixed(2, "600000000")]);
    for (const row of computeTransferPerAssetSummary(f, null).rows) {
      expect(row.salePending).toBe(true);
      expect(row.acqPending).toBe(true);
      expect(row.expensePending).toBe(true);
      expect(row.saleTransferNote).toBeUndefined();
    }
  });

  it("[SC-11] 계산 후(컴패니언 겸용): 양도가액 = B_i 4부분 합 533,333,334 · 취득가액·필요경비 = 엔진 echo = 파트 카드 합", async () => {
    const f = bundle([house(1, "200000000"), mixed(2, "600000000")]);
    const r = await calc(f);
    const agg = r.j.data.aggregated;
    const d = agg.mixedUseBgDetailsByAsset.m2;
    const row = computeTransferPerAssetSummary(f, { mode: "bundled", ...r.j.data } as never).rows[1];
    expect(row.salePending || row.acqPending || row.expensePending).toBe(false);
    expect(row.salePrice).toBe(533_333_334);
    expect(row.salePrice).toBe(sum(d, "transferPrice"));
    expect(row.acqPrice).toBe(sum(d, "acquisitionPrice"));
    expect(row.expense).toBe(sum(d, "estimatedDeduction"));
    // 사이드바 값 = 결과에서 이 자산 카드(`mu-*#m2`)가 실제 차감한 값 — 엔진 echo와 카드 합이 갈리면 여기서 드러난다
    const cards = agg.properties.filter((p: Loose) => String(p.propertyId).endsWith("#m2"));
    expect(cards.length).toBe(4);
    expect(row.acqPrice).toBe(cards.reduce((n: number, p: Loose) => n + p.acquisitionPrice, 0));
    expect(row.expense).toBe(cards.reduce((n: number, p: Loose) => n + p.necessaryExpense, 0));
    expect(row.saleTransferNote).toBeUndefined();
  });

  it("[SC-12] 계산 후(주 자산 겸용 — 종전에는 «계산 후 표시»에 갇혔다): 양도가액 = B_i 합 533,333,333 · 취득가액·필요경비는 echo 합", async () => {
    const f = bundle([mixed(1, "600000000"), house(2, "200000000")]);
    const r = await calc(f);
    const d = r.j.data.aggregated.mixedUseBgDetailsByAsset.primary;
    const row = computeTransferPerAssetSummary(f, { mode: "bundled", ...r.j.data } as never).rows[0];
    expect(row.salePending || row.acqPending || row.expensePending).toBe(false);
    expect(row.salePrice).toBe(533_333_333);
    expect(row.acqPrice).toBe(sum(d, "acquisitionPrice"));
    expect(row.expense).toBe(sum(d, "estimatedDeduction"));
    // 짝: 함께 양도하는 일반 주택 컴패니언 행은 종전 경로(안분 행)를 그대로 탄다
    const h = computeTransferPerAssetSummary(f, { mode: "bundled", ...r.j.data } as never).rows[1];
    expect(h.salePrice).toBe(r.j.data.apportionment.apportioned.find((a: Loose) => a.assetId === "h2").allocatedSalePrice);
  });
});
