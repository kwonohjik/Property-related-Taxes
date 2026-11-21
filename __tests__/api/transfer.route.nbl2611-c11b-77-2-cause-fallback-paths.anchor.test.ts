/**
 * anchor(route 실호출) — 조특법 §77의2(대토보상) 양도원인 «최상위 대체값»이 `calcReductions` 호출 4경로에 실제로 닿는다 (NBL2611-C11b).
 *
 * C11은 `calcReductions`에 입력 최상위 `transferCause`를 «감면 행에 값이 없을 때의 대체값»으로 새 positional 인자로 넘겼다.
 * 호출 5곳 중 route로 증명된 것은 `finalize`(토지 단건)뿐이었고 나머지 4곳의 배선은 tsc·코드 추적만 됐다 —
 * 인자 하나를 빠뜨려도(undefined) 타입이 통과하고, 화면 입력은 ④가 행에 값을 싣기 때문에 기존 anchor도 이를 못 본다.
 * 대체값은 «행에 transferCause가 없는 직접 API»에서만 쓰인다 — 그래서 ④ 캡처 body에서 **행의 transferCause만 지워** 직접 API body를 만든다.
 *
 *  경로                  호출부(lib/tax-engine/)                          최상위 대체값이 오는 칸
 *  다필지                 transfer-tax-multi-parcel-branch.ts              body.transferCause
 *  재개발(원조합원 입주권)  transfer-tax-redevelopment.ts                   body.transferCause
 *  거주주택 특례 §155⑳    transfer-tax-rental-housing-reductions.ts        body.transferCause
 *  겸용 합계              transfer-tax-mixed-use-totals.ts                 body.mixedUse.transferCause (엔진은 겸용 특례를 이 값으로 게이트한다)
 *
 *  (a) 행 없음 + 최상위 «공익수용» → 감면 성립(행에 값이 있는 ④ 본문과 같은 금액)  ← 대체 인자를 빼면 «확인 필요»로 떨어진다
 *  (b) 행 없음 + 최상위 «일반»   → 감면 0 + «시행자 양도 아님» 사유            ← 대체 인자를 빼면 «확인 필요» 사유로 바뀐다
 *  (c) 행·최상위 모두 없음       → 감면 0 + «확인 필요» 사유 (대체 인자와 무관 — 계약 고정)
 *  (d) 행 «일반» + 최상위 «공익수용» → 행 우선 불성립 (행이 있으면 대체 인자와 무관 — 계약 고정)
 *
 * 수치는 mock 세율표 실측값이지 정본 세액이 아니다. 시료는 단건 anchor(C11)와 같은 사실(양도 2024-06-03 · 대토보상 10억 · 고시일 2020-01-01).
 * 도달 불가 경로는 없다 — 4경로 모두 ④ 화면 입력으로 §77의2가 계산된다.
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
import { captureBody, allIssues } from "../calc/_one-house-pr3a-calc-route";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { withIdentityHousingBuildingStdOnForm } from "../tax-engine/_helpers/mixed-use-identity-std-form";
import { rosterForDeclaredCount } from "@/__tests__/calc/_helpers/roster-for-declared-count";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import {
  REPLACEMENT_LAND_CAUSE_UNKNOWN_REASON,
  REPLACEMENT_LAND_NOT_EXPROPRIATION_REASON,
} from "@/lib/tax-engine/replacement-land-reduction";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

/* eslint-disable @typescript-eslint/no-explicit-any */
type Loose = Record<string, any>;
type Cause = "general" | "public_expropriation";

async function post(body: Loose) {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
  const j = (await res.json()) as Loose;
  return { status: res.status, j, result: (j?.data?.result ?? {}) as Loose };
}
const rlRow = (land: string) => ({ type: "replacement_land_comp", rlCashComp: "0", rlLandComp: land });
const EXPR = { transferCause: "public_expropriation", expropriationNoticeDate: "2020-01-01" };
const ROSTER = { householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true };
const asForm = (f: unknown) => f as TransferFormData;

// ── 경로별 시료 — 전부 ④ 화면 입력(⑧ 통과)이다 ───────────────────────────────────────────────────────────
const parcel = (id: string) => ({ id, acquisitionDate: "2014-01-02", acquisitionMethod: "actual", acquisitionArea: "150", transferArea: "150", acquisitionPrice: "200000000", expenses: "0", capitalExpenditure: "0", transferExpense: "0" });
const multiParcelForm = () =>
  asForm({
    ...createDefaultTransferFormData(), transferDate: "2024-06-03", filingDate: "2024-08-31", contractTotalPrice: "1000000000",
    assets: [{
      ...makeDefaultAsset(1), assetKind: "land", acquisitionArea: "300", transferArea: "300", addressJibun: "서울 강남구 테스트동 1", acquisitionCause: "purchase", acquisitionDate: "2014-01-02",
      fixedAcquisitionPrice: "400000000", standardPriceAtTransfer: "500000000", actualSalePrice: "1000000000",
      ...EXPR, isNonBusinessLand: true, nblUseDetailedJudgment: true, nblLandType: "other_land", nblZoneType: "residential",
      parcelMode: true, parcels: [parcel("p1"), parcel("p2")], reductions: [rlRow("1000000000")],
    }],
  });

const redevForm = () =>
  rosterForDeclaredCount({
    ...createDefaultTransferFormData(), transferDate: "2024-06-03", filingDate: "2024-08-31", contractTotalPrice: "1000000000", householdHousingCount: "2", ...ROSTER,
    assets: [{
      ...makeDefaultAsset(1), assetKind: "right_to_move_in", redevSubject: "right", addressJibun: "서울 강남구 테스트동 3", acquisitionCause: "purchase", acquisitionDate: "2010-03-01",
      useEstimatedAcquisition: false, fixedAcquisitionPrice: "", redevActualAcquisitionPrice: "400000000", redevApprovalDate: "2018-05-01", redevRightsValue: "600000000",
      redevSettlementDirection: "pay", redevSettlementAmount: "100000000", redevPreApprovalExpenses: "20000000", redevOriginalAssetType: "housing",
      capitalExpenditure: "30000000", transferExpense: "10000000", actualSalePrice: "1000000000", ...EXPR, reductions: [rlRow("1000000000")],
    }],
  } as never) as TransferFormData;

const rentalForm = () => {
  const f = createDefaultTransferFormData() as Loose;
  f.assets = [{
    ...makeDefaultAsset(1), assetKind: "housing", addressJibun: "서울 강남구 테스트동 2", acquisitionCause: "purchase", acquisitionDate: "2002-09-01",
    actualSalePrice: "2,000,000,000", fixedAcquisitionPrice: "400,000,000", standardPriceAtAcq: "100,000,000", standardPriceAtTransfer: "400,000,000", assetContractDate: "",
    ...EXPR, reductions: [rlRow("2000000000")], residenceInputMode: "direct", residencePeriodMonthsAsset: "60",
    rentalHousingException: {
      applyException: true, scenario: "A",
      rentalUnits: [{ ...makeDefaultRentalUnit(), businessRegistrationDate: "2015-06-01", rentalRegistrationDate: "2015-06-01", rentalRegisteredDate: "2015-06-01", standardPriceAtRentalStart: "250,000,000", rentalInputMode: "direct", rentalMonths: "120", requirementsConfirmed: true }],
    },
  }];
  return asForm(Object.assign(f, { transferDate: "2025-08-01", contractTotalPrice: "2,000,000,000", isOneHousehold: true, householdHousingCount: "1", residencePeriodMonths: "60", ...ROSTER }));
};

const mixedUseForm = () => {
  const f = createDefaultTransferFormData() as Loose;
  f.assets[0] = {
    ...f.assets[0], residenceInputMode: "direct", residencePeriods: [],
    assetKind: "housing", isMixedUseHouse: true, acquisitionCause: "purchase", acquisitionDate: "2009-03-01", useEstimatedAcquisition: true, addressRoad: "서울 강남구 테헤란로 1",
    residentialFloorArea: "60", nonResidentialFloorArea: "40", buildingFootprintArea: "50", mixedUseTotalLandArea: "600", mixedZoneType: "general_residential", mixedIsMetropolitanArea: true,
    mixedTransferHousingPrice: "900000000", mixedTransferCommercialBuildingPrice: "300000000", mixedTransferLandPricePerSqm: "2000000",
    mixedAcqHousingPrice: "300000000", mixedAcqCommercialBuildingPrice: "100000000", mixedAcqLandPricePerSqm: "1000000",
    ...EXPR, housingCompensationTotal: "700000000", housingCompensationBasisTotal: "750000000",
    mixedCommercialLandCompensationTotal: "300000000", mixedCommercialLandCompensationBasisTotal: "350000000", reductions: [rlRow("1000000000")],
  };
  Object.assign(f, { transferDate: "2024-06-01", filingDate: "2024-08-31", contractTotalPrice: "1,200,000,000", householdHousingCount: "2", residencePeriodMonths: "0", ...ROSTER });
  return rosterForDeclaredCount(withIdentityHousingBuildingStdOnForm(asForm(f), { acqN: 90_000_000 } as never)) as TransferFormData;
};

interface PathCase {
  name: string;
  form: () => TransferFormData;
  /** 직접 API의 «최상위 양도원인» 칸 — 겸용은 엔진이 겸용 특례를 `mixedUse.transferCause`로 게이트한다(④는 둘 다 싣는다) */
  setTop: (body: Loose, v: Cause | undefined) => void;
  detail: (result: Loose) => Loose | undefined;
  amount: (result: Loose) => number;
  /** 이 경로의 엔진이 실제로 돌았다는 표지 */
  onPath: (result: Loose) => boolean;
  baseline: number;
}
const setPlain = (b: Loose, v: Cause | undefined) => { if (v === undefined) delete b.transferCause; else b.transferCause = v; };
const PATHS: PathCase[] = [
  { name: "다필지(multi-parcel)", form: multiParcelForm, setTop: setPlain, detail: (r) => r.replacementLandDetail, amount: (r) => r.reductionAmount ?? 0,
    onPath: (r) => (r.steps as Loose[]).some((s) => /\[필지 1\] 양도차익/.test(s.label)), baseline: 66_024_000 },
  { name: "재개발(redevelopment · 원조합원 입주권)", form: redevForm, setTop: setPlain, detail: (r) => r.replacementLandDetail, amount: (r) => r.reductionAmount ?? 0,
    onPath: (r) => r.redevelopmentDetail !== undefined, baseline: 55_169_600 },
  { name: "거주주택 특례(rental-housing · §155⑳)", form: rentalForm, setTop: setPlain, detail: (r) => r.replacementLandDetail, amount: (r) => r.reductionAmount ?? 0,
    onPath: (r) => r.rentalHousingExceptionDetail?.applied === true, baseline: 30_556_000 },
  { name: "겸용 합계(mixed-use-totals)", form: mixedUseForm,
    setTop: (b, v) => { setPlain(b, v); if (v === undefined) delete b.mixedUse.transferCause; else b.mixedUse.transferCause = v; },
    detail: (r) => r.total?.reductionDetails?.replacementLandDetail, amount: (r) => r.total?.reductionAmount ?? 0,
    onPath: (r) => r.calculationRoute !== undefined && r.total !== undefined && r.splitMode !== undefined, baseline: 55_256_457 },
];

describe.each(PATHS)("C11b — $name: 최상위 대체값이 route 실호출로 §77의2 판정에 닿는다", (p) => {
  const direct = async (rowCause: Cause | undefined, top: Cause | undefined) => {
    const body = (await captureBody(p.form() as never)) as Loose;
    if (rowCause === undefined) delete body.reductions[0].transferCause;
    else body.reductions[0].transferCause = rowCause;
    p.setTop(body, top);
    return post(body);
  };

  it("전제 — ④ 본문(행·최상위 모두 «공익수용»)은 ⑧ 통과 · 이 경로 엔진을 타고 §77의2가 성립한다", async () => {
    const f = p.form();
    expect(allIssues(f as never)).toEqual([]);
    const body = (await captureBody(f as never)) as Loose;
    expect(body.reductions[0].transferCause).toBe("public_expropriation"); // 화면은 대체값에 의존하지 않는다 — ④가 행에 싣는다
    const r = await post(body);
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    expect(p.onPath(r.result)).toBe(true);
    expect(p.detail(r.result)?.isEligible).toBe(true);
    expect(p.amount(r.result)).toBe(p.baseline);
  });

  it("🔑 (a) 행 없음 + 최상위 «공익수용» → 성립 — 행 값이 있는 ④ 본문과 같은 감면액(대체 인자를 빼면 «확인 필요»로 떨어진다)", async () => {
    const r = await direct(undefined, "public_expropriation");
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    expect(p.onPath(r.result)).toBe(true);
    expect(p.detail(r.result)?.notEligibleReason).toBeUndefined();
    expect(p.detail(r.result)?.isEligible).toBe(true);
    expect(p.amount(r.result)).toBe(p.baseline);
  });

  it("🔑 (b) 행 없음 + 최상위 «일반» → 감면 0 + «시행자 양도 아님» 사유(대체 인자를 빼면 «확인 필요» 사유로 바뀐다)", async () => {
    const r = await direct(undefined, "general");
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    expect(p.onPath(r.result)).toBe(true);
    expect(p.detail(r.result)?.isEligible).toBe(false);
    expect(p.detail(r.result)?.notEligibleReason).toBe(REPLACEMENT_LAND_NOT_EXPROPRIATION_REASON);
    expect(p.amount(r.result)).toBe(0);
  });

  it("(c) 행·최상위 모두 없음 → 감면 0 + «확인 필요» 사유 — 「모름」은 혜택 불성립", async () => {
    const r = await direct(undefined, undefined);
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    expect(p.onPath(r.result)).toBe(true);
    expect(p.detail(r.result)?.isEligible).toBe(false);
    expect(p.detail(r.result)?.notEligibleReason).toBe(REPLACEMENT_LAND_CAUSE_UNKNOWN_REASON);
    expect(p.amount(r.result)).toBe(0);
  });

  it("(d) 행 «일반» + 최상위 «공익수용» → 행 우선 불성립", async () => {
    const r = await direct("general", "public_expropriation");
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    expect(p.onPath(r.result)).toBe(true);
    expect(p.detail(r.result)?.isEligible).toBe(false);
    expect(p.detail(r.result)?.notEligibleReason).toBe(REPLACEMENT_LAND_NOT_EXPROPRIATION_REASON);
    expect(p.amount(r.result)).toBe(0);
  });
});
