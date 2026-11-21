/**
 * anchor(화면 경로 ④⑤⑧⑫⑭) — 축 B(같은 물건 지분 분할) 공익수용 시 조특법 §77 감면을 둘째 이후 지분에도 일관되게 적용 (NBL2611-C9).
 *
 * 종전 결함 2개:
 *  ① 자동 추가 — 첫 카드가 「공익수용·협의매수」를 고르면 §77 기본행이 **그 카드에만** 생겼다(지분 카드는 ② 양도정보가 숨는다) → 둘째 이후 지분은 같은 수용인데 감면이 조용히 빠졌다.
 *  ② 고시일 — 지분 카드의 §77 행 고시일이 비면 ④가 지분 카드 «자기» 고시일(빈 칸)을 읽어 ⑧이 「사업인정고시일을 선택하세요」로 막았다 — 화면에 그 지분 카드가 고칠 수 있는 칸이
 *     있기는 하나 사실은 물건 단위(첫 카드 ② 칸)라 같은 값을 두 번 넣게 했다. 이제 ④·⑧·⑤가 같은 술어(`axis-b-reduction-notice-date.ts`)로 첫 카드 값을 읽는다.
 *
 * 정답(oracle) = 단건 100% §77(현금 10억) 47,985,100 · 지분 두 카드가 같은 보상을 1억/9억으로 나눠 받은 폼도 같다(현금·채권은 지분별 비율로만 쓰인다 — 실측).
 * 수정 전 수치는 같은 시료를 수정 없이 돌린 실측(2026-11-21)이다. 금액은 mock 세율표 실측값이지 정본 세액이 아니다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/tax-rates", async (io) => {
  const actual = await io<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", async (io) => {
  const actual = await io<typeof import("@/lib/api/rate-limit")>();
  return {
    ...actual,
    checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
    getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
    shouldBypassRateLimit: vi.fn().mockReturnValue(true),
  };
});

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { POST } from "@/app/api/calc/transfer/route";
import { captureBody } from "../calc/_one-house-pr3a-calc-route";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { mergePrimaryBasic } from "@/lib/calc/transfer-tax-api-helpers";
import { reductionNoticeDateOf } from "@/lib/calc/axis-b-reduction-notice-date";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

/* eslint-disable @typescript-eslint/no-explicit-any */
type Loose = Record<string, any>;
type Over = Record<string, unknown>;

async function run(f: TransferFormData) {
  const body = (await captureBody(f as never)) as Loose;
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
  const j = (await res.json()) as Loose;
  const agg = j?.data?.aggregated ?? {};
  return { status: res.status, body, j, total: (agg.totalTax ?? j?.data?.result?.totalTax) as number, props: (agg.properties ?? []) as Loose[] };
}
const issuesOf = (f: TransferFormData) =>
  [0, 1, 2, 3, 4, 5].flatMap((s) => collectStepIssues(s, f as never)).map((i) => `${i.assetIndex ?? "-"}:${i.field ?? ""}`);
const NOTICE_FIELD = "reduction.public_expropriation.expropriationApprovalDate";

// ── 주택 지분 (C6 시료 — G-2 별개취득 · 1세대1주택 · 지분 10% / 90% · 고시일 2021-03-01 · 양도 2024-09-01) ───────────────────────────────
const hShare = (n: number, o: Over = {}) =>
  ({
    ...makeDefaultAsset(n), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2010-03-01",
    landAcquisitionDate: "2014-01-01", hasSeperateLandAcquisitionDate: true, landAcqMode: "actual", buildingAcqMode: "actual",
    landAcquisitionPrice: "450,000,000", buildingAcquisitionPrice: "50,000,000", actualSalePrice: "1,000,000,000", saleSplitMode: "actual",
    landTransferPrice: "700,000,000", buildingTransferPrice: "300,000,000", landStandardPriceAtTransfer: "700,000,000",
    buildingStandardPriceAtTransfer: "300,000,000", ownershipNumerator: n === 1 ? "10" : "90", ownershipDenominator: "100",
    residenceInputMode: "direct", residencePeriodMonthsAsset: "0", ...o,
  }) as unknown as AssetForm;
const H_OBJECT = { acquisitionArea: "3000", buildingFootprintArea: "100", appurtenantLandZone: "metropolitan_residential" };
const ZONE = { appurtenantLandZone: "metropolitan_residential" };
const H_EXPRO = { transferCause: "public_expropriation", expropriationNoticeDate: "2021-03-01" };
const row77 = (cash: string, approval = "") => ({
  type: "public_expropriation", expropriationCash: cash, expropriationBond: "0", expropriationBondHoldingYears: "none", expropriationApprovalDate: approval,
});
const BASE = {
  transferDate: "2024-09-01", filingDate: "2024-11-30", contractTotalPrice: "1000000000", isOneHousehold: true, householdHousingCount: "1",
  householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, residencePeriodMonths: "0", bundledSaleMode: "actual",
};
const hForm = (first: Over, second: Over = ZONE) =>
  ({ ...createDefaultTransferFormData(), ...BASE, assetSplitMode: "fractional", assets: [hShare(1, { ...H_OBJECT, ...first }), hShare(2, second)] }) as unknown as TransferFormData;
/** 단건 100% — 정답 */
const single = (rows: unknown[]) =>
  ({
    ...createDefaultTransferFormData(), ...BASE,
    assets: [hShare(1, { ...H_OBJECT, ...H_EXPRO, ownershipNumerator: "100", ownershipDenominator: "100", reductions: rows })],
  }) as unknown as TransferFormData;

const SINGLE_TOTAL = 47_985_100;
const rowsOf = (body: Loose) => body.companionAssets?.[0]?.reductions as Loose[] | undefined;

describe("C9 — 주택 지분(G-2) · §77 감면 일관 적용", () => {
  it("정답 확인 — 단건 100% §77(현금 10억): 47,985,100 · §77 없이 일반 지분 §77 없음은 더 크다", async () => {
    const r = await run(single([row77("1000000000", "2021-03-01")]));
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    expect(r.total).toBe(SINGLE_TOTAL);
  });

  it("🔑 두 지분 카드 §77(1억/9억) · 행 고시일 공란 → 첫 카드 고시일을 읽는다: ⑧ 0건 · 47,985,100 = 단건 (수정 전 ⑧ 차단 `1:reduction…expropriationApprovalDate` · 400)", async () => {
    const f = hForm({ ...H_EXPRO, reductions: [row77("100000000")] }, { ...ZONE, reductions: [row77("900000000")] });
    expect(issuesOf(f)).toEqual([]);
    const r = await run(f);
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    expect(rowsOf(r.body)?.[0]?.businessApprovalDate).toBe("2021-03-01");
    expect(r.total).toBe(SINGLE_TOTAL);
    // 정답: 지분 카드 행에 고시일을 직접 넣은 폼과 같다
    const oracle = await run(hForm({ ...H_EXPRO, reductions: [row77("100000000", "2021-03-01")] }, { ...ZONE, reductions: [row77("900000000", "2021-03-01")] }));
    expect(oracle.total).toBe(SINGLE_TOTAL);
  });

  it("판별력 — 첫 카드만 §77(둘째 지분 행 없음): 51,827,387 — 둘째 지분 감면이 빠진 종전 결과(자동 추가가 막는 상태)", async () => {
    const f = hForm({ ...H_EXPRO, reductions: [row77("100000000")] }, ZONE);
    expect(issuesOf(f)).toEqual([]);
    const r = await run(f);
    expect(r.total).toBe(51_827_387);
  });

  it("🔑 첫 카드 고시일도 공란이면 ⑧이 막는다 — 지분 카드 행도 «첫 카드 값이 없다»로 막힌다(첫 카드 행에는 직접 넣어 첫 카드 오류를 치운다)", () => {
    // 첫 카드: 자산 고시일 없음 + 행에 직접 입력 → 통과. 지분 카드: 행 공란 + 첫 카드 자산 고시일 없음 → 차단.
    const f = hForm({ transferCause: "public_expropriation", reductions: [row77("100000000", "2021-03-01")] }, { ...ZONE, reductions: [row77("900000000")] });
    expect(reductionNoticeDateOf(f, 1)).toBe("");
    expect(issuesOf(f)).toEqual([`1:${NOTICE_FIELD}`]);
    // 첫 카드 행도 공란이면 첫 카드가 먼저 막힌다(⑧은 단계마다 첫 오류 1건)
    const g = hForm({ transferCause: "public_expropriation", reductions: [row77("100000000")] }, { ...ZONE, reductions: [row77("900000000")] });
    expect(issuesOf(g)).toEqual([`0:${NOTICE_FIELD}`]);
  });

  it("🔑 지분 카드가 행에 직접 넣은 고시일이 첫 카드 값보다 우선한다 — 지분 2 취득(토지 2014-01-01)이 고시일 2014-06-01 부터 2년 이내면 감면 불성립", async () => {
    const mine = await run(hForm({ ...H_EXPRO, reductions: [row77("100000000")] }, { ...ZONE, reductions: [row77("900000000", "2014-06-01")] }));
    expect(mine.status, JSON.stringify(mine.j).slice(0, 300)).toBe(200);
    expect(rowsOf(mine.body)?.[0]?.businessApprovalDate).toBe("2014-06-01");
    expect(mine.total).not.toBe(SINGLE_TOTAL);
    expect(mine.total).toBeGreaterThan(SINGLE_TOTAL);
  });

  it("지분 카드 자신의 숨은 고시일(1999-01-01)은 읽지 않는다 — 첫 카드 값이 이긴다", async () => {
    const r = await run(hForm({ ...H_EXPRO, reductions: [row77("100000000")] }, { ...ZONE, expropriationNoticeDate: "1999-01-01", reductions: [row77("900000000")] }));
    expect(rowsOf(r.body)?.[0]?.businessApprovalDate).toBe("2021-03-01");
    expect(r.total).toBe(SINGLE_TOTAL);
  });

  it("mergePrimaryBasic은 여전히 고시일을 병합하지 않는다(C6 비채택 유지) — 첫 카드 값은 전용 술어가 읽는다", () => {
    const f = hForm({ ...H_EXPRO }, ZONE);
    expect(mergePrimaryBasic(f.assets[1], f.assets[0]).expropriationNoticeDate ?? "").toBe("");
    expect(reductionNoticeDateOf(f, 1)).toBe("2021-03-01");
    expect(reductionNoticeDateOf(f, 0)).toBe("2021-03-01");
  });
});

describe("C9 — 축 B가 아니면 불변 (컴패니언·단건)", () => {
  it("함께 양도(다른 물건 · assetSplitMode=companion): 컴패니언 행 고시일 공란은 자기 고시일(빈 칸)을 읽어 ⑧이 막는다 — 첫 카드 값으로 채우지 않는다", async () => {
    const f = {
      ...hForm({ ...H_EXPRO, reductions: [row77("100000000")] }, { ...ZONE, reductions: [row77("900000000")] }),
      assetSplitMode: "companion",
    } as unknown as TransferFormData;
    expect(reductionNoticeDateOf(f, 1)).toBe("");
    expect(issuesOf(f)).toContain(`1:${NOTICE_FIELD}`);
    const body = (await captureBody(f as never)) as Loose;
    expect(rowsOf(body)?.[0]?.businessApprovalDate).toBe("");
  });

  it("함께 양도 컴패니언이 자기 고시일을 가지면 그 값을 쓴다(②가 있다)", async () => {
    const f = {
      ...hForm({ ...H_EXPRO, reductions: [row77("100000000")] }, { ...ZONE, ...H_EXPRO, expropriationNoticeDate: "2019-05-01", reductions: [row77("900000000")] }),
      assetSplitMode: "companion",
    } as unknown as TransferFormData;
    expect(issuesOf(f)).not.toContain(`1:${NOTICE_FIELD}`);
    const body = (await captureBody(f as never)) as Loose;
    expect(rowsOf(body)?.[0]?.businessApprovalDate).toBe("2019-05-01");
  });

  it("단건: 행 고시일 공란이면 자기 고시일 fallback(종전과 같다) — 47,985,100", async () => {
    const f = single([row77("1000000000")]);
    expect(reductionNoticeDateOf(f, 0)).toBe("2021-03-01");
    expect(issuesOf(f)).toEqual([]);
    const r = await run(f);
    expect(r.total).toBe(SINGLE_TOTAL);
  });
});

// ── 토지 지분 (C6 시료 — 50% / 50% · 첫 지분 2014-01-02 취득 · 고시일 2020-01-01 · 양도 2024-06-03) ───────────────────────────────────
describe("C9 — 토지 지분 · §77 «고시일부터 2년 이전 취득» 요건은 지분별 취득일로 판정된다", () => {
  const LAND = {
    assetKind: "land", acquisitionArea: "300", transferArea: "300", addressJibun: "서울 강남구 테스트동 1", acquisitionCause: "purchase", acquisitionDate: "2014-01-02",
    fixedAcquisitionPrice: "400000000", standardPriceAtTransfer: "500000000", isNonBusinessLand: true, nblUseDetailedJudgment: true, nblLandType: "other_land",
    nblZoneType: "residential", transferCause: "public_expropriation", expropriationNoticeDate: "2020-01-01",
  };
  const landForm = (first: Over, second: Over) =>
    ({
      ...createDefaultTransferFormData(), transferDate: "2024-06-03", filingDate: "2024-08-31", contractTotalPrice: "1000000000", assetSplitMode: "fractional",
      assets: [
        { ...makeDefaultAsset(1), ...LAND, ownershipNumerator: "50", ownershipDenominator: "100", ...first },
        { ...makeDefaultAsset(2), acquisitionCause: "purchase", acquisitionDate: "2019-06-03", fixedAcquisitionPrice: "400000000", ownershipNumerator: "50", ownershipDenominator: "100", ...second },
      ],
    }) as unknown as TransferFormData;
  const first = { reductions: [row77("500000000")] };

  it("🔑 지분 2를 고시일(2020-01-01) 2년 이내(2019-06-03)에 취득하면 지분 2의 §77 감면은 0 — 행이 있어도 없는 것과 같다(191,278,600)", async () => {
    const withRow = landForm(first, { reductions: [row77("500000000")] });
    expect(issuesOf(withRow)).toEqual([]); // 행 고시일 공란 → 첫 카드 고시일 fallback
    const a = await run(withRow);
    expect(a.status, JSON.stringify(a.j).slice(0, 300)).toBe(200);
    expect(a.props.map((p) => p.reductionAmount)).toEqual([7_126_000, 0]);
    expect(a.total).toBe(191_278_600);
    expect((await run(landForm(first, {}))).total).toBe(191_278_600);
  });

  it("🔑 짝 — 지분 2를 요건 안(2015-06-03)에 취득하면 같은 행이 감면 7,354,000을 만든다(행 없음 176,724,850 → 169,134,600)", async () => {
    const early = { acquisitionDate: "2015-06-03" };
    const a = await run(landForm(first, { ...early, reductions: [row77("500000000")] }));
    expect(a.props.map((p) => p.reductionAmount)).toEqual([7_126_000, 7_354_000]);
    expect(a.total).toBe(169_134_600);
    expect((await run(landForm(first, early))).total).toBe(176_724_850);
  });
});
