/**
 * route anchor — 조특법 §99·§99의3 재개발 조합원 갈래 후속 (레인 L20 · L19 #2987이 남긴 「함께 양도 컴패니언 ⑫ 거울」).
 * 원조합원(승계 모드 OFF)의 종전 부동산 취득일이 관리처분계획 인가일보다 늦으면 승계조합원이다(소득세법 §88 9호 «그 조합원으로부터 취득한 것»).
 * 주 자산은 ⑧·⑫ 모두 막았으나 함께 양도 컴패니언 자산은 ⑧만 막고 ⑫가 없어, ⑧을 거치지 않는 API 직접 호출은 원조합원 산식으로 200이었다.
 *
 * 수정 전 같은 입력(컴패니언 · 주택 출자/토지만 출자 · 입주권/완공 APT): 인가 뒤 취득 = ⑧ 차단 · ⑫ 200 (입주권 303,963,000 · 완공 APT 271,623,000).
 * 이 파일은 ⑧(`collectStepIssues`)과 ⑫(route 응답)를 한 셀에서 같이 단언한다 — 한쪽만 막는 셀이 없어야 한다(⑧ 통과 ⇔ ⑫ 통과).
 * 세율: route 폴백 세율(`makeMockRates`). 주 자산 짝은 L19(#2987) 동작이 그대로임을 고정한다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

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
import { runCalc } from "../calc/_helpers/redev-one-house-route";
import { createDefaultTransferFormData, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import { withTestAddress } from "@/__tests__/fixtures/transfer-test-address";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import { rosterForDeclaredCount } from "@/__tests__/calc/_helpers/roster-for-declared-count";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

/** 원조합원 입주권 — 종전 부동산 2008-01-01 취득 · 인가 2016-06-01 · 양도 2024-06-01 (화면 입력 칸만) */
const ORIG_RIGHT = {
  assetKind: "right_to_move_in", isSuccessorRightToMoveIn: false, redevSubject: "right", acquisitionCause: "purchase", acquisitionDate: "2008-01-01",
  useEstimatedAcquisition: false, fixedAcquisitionPrice: "", actualSalePrice: "1000000000", standardPriceAtTransfer: "800000000",
  redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2016-06-01", redevOriginalAssetType: "housing", redevRightsValue: "900000000",
  redevSettlementDirection: "pay", redevSettlementAmount: "100000000", redevPreApprovalExpenses: "0", redevActualAcquisitionPrice: "400000000",
  redevExemptionEligibleAtApproval: "yes", redevPriorHouseHoldingMonths: "60", redevPriorHouseResidenceMonths: "36",
} as unknown as Partial<AssetForm>;
const ORIG_APT = { ...ORIG_RIGHT, assetKind: "redevelopment_apt", redevSubject: "apt", redevIsSuccessorMember: "no", redevExemptionEligibleAtApproval: "" } as unknown as Partial<AssetForm>;
const HOUSE = {
  assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "300000000", actualSalePrice: "600000000",
  standardPriceAtTransfer: "400000000", useEstimatedAcquisition: false,
} as unknown as Partial<AssetForm>;
const COMPANION_FORM = { contractTotalPrice: "1600000000", assetSplitMode: "companion", householdHousingCount: "1", isOneHousehold: false } as unknown as Partial<TransferFormData>;

function mkForm(assets: Partial<AssetForm>[]): TransferFormData {
  const form = withTestAddress(createDefaultTransferFormData());
  form.transferDate = "2024-06-01";
  form.filingDate = "2024-08-31";
  form.householdHousingCount = "0";
  form.isOneHousehold = true;
  form.bundledSaleMode = "actual";
  Object.assign(form, { householdRightCount: "1", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, residencePeriodMonths: "60" });
  form.assets = assets.map(
    (over, i) =>
      ({
        ...(i === 0 ? form.assets[0] : makeDefaultAsset(i + 1)),
        addressJibun: i === 0 ? form.assets[0].addressJibun : "제주특별자치도 강남구 테스트동 1-1",
        assetId: `a${i}`,
        ...over,
      }) as AssetForm,
  );
  Object.assign(form, COMPANION_FORM);
  return rosterForDeclaredCount(form);
}

type Pos = "main" | "companion";
/** 재개발 자산 위치 — main: 주 자산(첫 카드) · companion: 함께 양도(둘째 카드) */
const place = (a: Partial<AssetForm>, pos: Pos) => mkForm(pos === "main" ? [a, HOUSE] : [HOUSE, a]);
const approvalPath = (pos: Pos) => (pos === "main" ? "redevelopment.approvalDate" : "companionAssets.0.redevelopment.approvalDate");

async function probe(a: Partial<AssetForm>, pos: Pos) {
  const r = await runCalc(place(a, pos));
  const order = r.issues.filter((i) => i.field === "redevApprovalDate" && /인가일은 취득일 이후여야 합니다/.test(i.message));
  const fieldErrors = (r.json?.error?.fieldErrors ?? {}) as Record<string, string[]>;
  const agg = r.json?.data?.aggregated as { totalTax: number } | undefined;
  return { status: r.status as number, allIssues: r.issues, order, fieldErrors, tax: (agg?.totalTax ?? r.result?.totalTax) as number | undefined };
}

const AFTER = { acquisitionDate: "2017-03-01" };
const SAME_DAY = { acquisitionDate: "2016-06-01" };
const LAND = { redevOriginalAssetType: "land" } as unknown as Partial<AssetForm>;
/** 측정값(수정 전후 동일) — 인가 전/같은 날 취득 총세액 */
const TAX = {
  right: { before: 267_003_000, sameDay: 303_963_000 },
  apt: { before: 234_663_000, sameDay: 267_003_000 },
} as const;

for (const pos of ["companion", "main"] as const) {
  describe(`원조합원 ${pos === "companion" ? "함께 양도 컴패니언" : "주 자산(L19 짝)"} — 종전 부동산 취득이 인가일(2016-06-01) 뒤`, () => {
    for (const [kn, base, kk] of [["입주권", ORIG_RIGHT, "right"], ["완공 APT", ORIG_APT, "apt"]] as const) {
      for (const [on, o] of [["주택 출자", {}], ["토지만 출자", LAND]] as const) {
        const ctx = `${kn} · ${on}`;
        it(`${ctx} (a) 인가 뒤 취득 → ⑧ 차단 1건 · ⑫ 400(${approvalPath(pos)})`, async () => {
          const x = await probe({ ...base, ...o, ...AFTER }, pos);
          expect(x.order).toHaveLength(1);
          expect(x.order[0].message).toMatch(/소득세법 §88 9호/);
          expect(x.status).toBe(400);
          expect(Object.keys(x.fieldErrors)).toContain(approvalPath(pos));
          expect(x.tax).toBeUndefined();
        });
        it(`${ctx} (c) 인가 전 취득 → ⑧ 통과 · 200 ${TAX[kk].before.toLocaleString()}`, async () => {
          const x = await probe({ ...base, ...o }, pos);
          expect(x.allIssues).toEqual([]);
          expect(x.status).toBe(200);
          expect(x.tax).toBe(TAX[kk].before);
        });
        it(`${ctx} (d) 취득일 = 인가일 같은 날 → 모순 아님: ⑧ 통과 · 200 ${TAX[kk].sameDay.toLocaleString()}`, async () => {
          const x = await probe({ ...base, ...o, ...SAME_DAY }, pos);
          expect(x.allIssues).toEqual([]);
          expect(x.status).toBe(200);
          expect(x.tax).toBe(TAX[kk].sameDay);
        });
      }
    }
    it("(e) 완공 APT · 승계조합원 모드 ON · 인가 뒤 취득 → ⑧ 통과 · 200 370,491,000 (주택·토지만 출자 모두)", async () => {
      const succ = { redevIsSuccessorMember: "yes", redevCompletionDate: "2020-01-01", fixedAcquisitionPrice: "300000000", redevSettlementAmount: "0", ...AFTER } as unknown as Partial<AssetForm>;
      for (const o of [{} as Partial<AssetForm>, LAND]) {
        const x = await probe({ ...ORIG_APT, ...o, ...succ }, pos);
        expect(x.allIssues).toEqual([]);
        expect(x.status).toBe(200);
        expect(x.tax).toBe(370_491_000);
      }
    });
    it("(e′) 승계 입주권(isSuccessorRightToMoveIn) · 인가(2018-05-01) 뒤 취득(2020-03-01) → ⑧ 통과 · 200 257,763,000 (⑫ 제외 대상)", async () => {
      const succRight = {
        ...ORIG_RIGHT, isSuccessorRightToMoveIn: true, acquisitionDate: "2020-03-01", redevApprovalDate: "2018-05-01",
        successorRightAcqPrice: "500000000", successorRightAddedContribution: "100000000", fixedAcquisitionPrice: "123000000",
      } as unknown as Partial<AssetForm>;
      const x = await probe(succRight, pos);
      expect(x.allIssues).toEqual([]);
      expect(x.status).toBe(200);
      expect(x.tax).toBe(257_763_000);
    });
  });
}

describe("이월과세(carryover_gift) 원조합원 — ⑧이 읽는 취득일 = ⑫ 와이어 취득일 (④ 공용 leaf `carryoverAcquisitionDateFallback`)", () => {
  const CAR = (giftRegistryDate: string) => ({
    giftRegistryDate, donorAcquisitionDate: "2000-01-01", donorAcquisitionCause: "purchase", donorAcquisitionPrice: "100000000", useEstimatedAcquisition: false,
    estimationMode: "", giftTaxAmount: "0", donorCapitalExpenditure: "0", giftDateValuation: "100000000", exclusionDeclared: {}, donorHouseholdHoldingStartDate: "2000-01-01",
    donorRelation: "spouse",
  });
  const carry = (acquisitionDate: string, giftRegistryDate: string) =>
    ({ ...ORIG_APT, acquisitionCause: "carryover_gift", acquisitionDate, fixedAcquisitionPrice: "", acquisitionPrice: "100000000", carryover: CAR(giftRegistryDate) }) as unknown as Partial<AssetForm>;
  const wire = (body: unknown, pos: Pos) =>
    pos === "main" ? (body as { acquisitionDate?: string }).acquisitionDate : (body as { companionAssets?: { acquisitionDate?: string }[] }).companionAssets?.[0]?.acquisitionDate;

  for (const pos of ["main", "companion"] as const) {
    it(`${pos} · 취득일 비움 + 증여 등기접수일 인가 뒤(2017-03-01) → ⑧ 차단 · ⑫ 400 (와이어 취득일 = 등기접수일)`, async () => {
      const r = await runCalc(place(carry("", "2017-03-01"), pos));
      expect(wire(r.body, pos)).toBe("2017-03-01");
      expect(r.issues.filter((i) => /인가일은 취득일 이후여야 합니다/.test(i.message))).toHaveLength(1);
      expect(r.status).toBe(400);
      expect(Object.keys(r.json?.error?.fieldErrors ?? {})).toContain(approvalPath(pos));
    });
    it(`${pos} · 취득일 비움 + 증여 등기접수일 인가 전(2012-03-01) → ⑧ 통과 · 200 (와이어 취득일 = 등기접수일)`, async () => {
      const r = await runCalc(place(carry("", "2012-03-01"), pos));
      expect(wire(r.body, pos)).toBe("2012-03-01");
      expect(r.issues).toEqual([]);
      expect(r.status).toBe(200);
    });
    it(`${pos} · 취득일 칸 값 인가 뒤(2017-03-01) + 등기접수일 인가 전 → 본문 취득일이 이긴다(⑧·⑫ 같은 값): ⑧ 차단 · ⑫ 400`, async () => {
      const r = await runCalc(place(carry("2017-03-01", "2012-03-01"), pos));
      expect(wire(r.body, pos)).toBe("2017-03-01");
      expect(r.issues.filter((i) => /인가일은 취득일 이후여야 합니다/.test(i.message))).toHaveLength(1);
      expect(r.status).toBe(400);
    });
  }
});
