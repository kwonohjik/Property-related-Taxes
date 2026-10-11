/**
 * G2-2 anchor — §104⑤ 크로스 「다시 계산」은 다건 ⑧이 막는 자산을 우회하지 못한다.
 *
 * 종전 결함: `checkRealEstateRecalc`가 `mixed-use`만 거르고 단건 폼을 PropertyItem 하나로 감싸 다건 ④→⑫→⑭로 돌렸다.
 * 다건 ④는 재개발 §166 서브객체를 만들지 않고 propertyType만 보내므로 완공APT·조합원입주권이 **일반 양도**로 계산됐다
 * (원조합원 완공APT 1주택: 단건 비과세 0원 → 재계산 107,646,000 · 입주권 0원 → 186,846,000). 성공 배지가 붙고
 * 단건 이력은 prevClause2가 null이라 차이 고지도 뜨지 않았다.
 *
 * 처방(차단): 크로스 합산은 다건 엔진의 호별 echo가 목적이고 다건 엔진은 §166을 계산하지 않는다 — 「단건과 같은 결과」로 가려면
 * 다건 경로에 §166(5개 날짜 변환·청산금·분자 P 등)을 새로 옮겨야 해 범위가 다르다. 화면 ⑧(`validateMultiSupportedMode`)과
 * **같은 술어**로 막고, 서버 ⑫도 같은 모드를 거부한다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as POST_SINGLE } from "@/app/api/calc/transfer/route";
import { POST as POST_MULTI } from "@/app/api/calc/transfer/multi/route";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { checkRealEstateRecalc, recalcRealEstate } from "@/lib/calc/cross-104-5-recalc";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { validateMultiSupportedMode } from "@/lib/calc/multi-transfer-tax-validate";
import { buildMultiBody } from "./_helpers/single-multi-route-parity";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { CalculationRecord } from "@/lib/storage/types";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

type Asset = ReturnType<typeof makeDefaultAsset>;
const MAPO = "1144010100";

function routeFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (u: string, init?: RequestInit) => {
      const req = new NextRequest(`http://localhost${u}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
        body: String(init?.body),
      });
      return u.endsWith("/multi") ? POST_MULTI(req) : POST_SINGLE(req);
    }),
  );
}

function form(asset: Partial<Asset>, td: string, over: Partial<TransferFormData> = {}): TransferFormData {
  const d = createDefaultTransferFormData();
  const a = { ...makeDefaultAsset(1), regionCode: MAPO, addressJibun: "서울특별시 마포구 아현동 1", ...asset } as Asset;
  return {
    ...d, transferDate: td, contractTotalPrice: a.actualSalePrice, assets: [a], houses: [], presaleRights: [],
    isOneHousehold: true, householdHousingCount: "1", householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true, annualBasicDeductionUsed: "0", ...over,
  } as TransferFormData;
}
const RES = (from: string, to: string) =>
  ({ residenceInputMode: "interval", residencePeriods: [{ moveInDate: from, moveOutDate: to }] }) as Partial<Asset>;
const APT = (): Partial<Asset> => ({
  assetKind: "redevelopment_apt", redevSubject: "apt", acquisitionCause: "purchase", acquisitionDate: "2018-01-10",
  actualSalePrice: "1,000,000,000", fixedAcquisitionPrice: "400,000,000", redevActualAcquisitionPrice: "400,000,000",
  redevApprovalDate: "2019-06-01", redevRightsValue: "600,000,000", redevSettlementDirection: "pay",
  redevSettlementAmount: "100,000,000", redevIsSuccessorMember: "no", ...RES("2018-01-10", "2024-03-01"),
});
const RIGHT = (): Partial<Asset> => ({
  assetKind: "right_to_move_in", redevSubject: "right", acquisitionCause: "purchase", acquisitionDate: "2015-01-10",
  actualSalePrice: "900,000,000", fixedAcquisitionPrice: "300,000,000", redevActualAcquisitionPrice: "300,000,000",
  redevApprovalDate: "2021-06-01", redevRightsValue: "500,000,000", redevSettlementDirection: "pay",
  redevSettlementAmount: "50,000,000", redevIsSuccessorMember: "no", redevExemptionEligibleAtApproval: "yes",
  ...RES("2015-01-10", "2021-06-01"),
});
const HOUSING = (): Partial<Asset> => ({
  assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2018-01-10", actualSalePrice: "1,000,000,000",
  fixedAcquisitionPrice: "400,000,000", ...RES("2018-01-10", "2024-03-01"),
});

const CASES: [string, TransferFormData][] = [
  ["원조합원 완공APT 1주택", form(APT(), "2024-03-01")],
  ["원조합원 입주권", form(RIGHT(), "2024-03-01", { householdHousingCount: "0" })],
];

function singleRecord(f: TransferFormData, resultData: unknown): CalculationRecord {
  return {
    id: "r", userId: "u", taxType: "transfer", title: "t", inputData: f, resultData, taxLawVersion: f.transferDate,
    linkedCalculationId: null, clientId: null, createdAt: "2026-03-02T00:00:00.000Z", updatedAt: "2026-03-02T00:00:00.000Z",
  } as unknown as CalculationRecord;
}
function multiRecord(f: TransferFormData): CalculationRecord {
  return singleRecord(
    { __multiTransfer: true, taxYear: 2024, properties: [{ propertyId: "p1", propertyLabel: "마포 아파트", form: f, completionPercent: 100 }] } as unknown as TransferFormData,
    { mode: "multi" },
  );
}
async function singleResult(f: TransferFormData) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-11T03:00:00Z"));
  routeFetch();
  try {
    return (await callTransferTaxAPI(f)) as unknown as { mode: string; result: { isExempt: boolean; totalTax: number } };
  } finally {
    vi.useRealTimers();
  }
}

describe("G2-2 — 크로스 재계산 게이트", () => {
  for (const [name, f] of CASES) {
    it(`${name}: 전제(단건 ⑧ 통과 · 단건 비과세 0원) → 재계산은 차단된다`, async () => {
      for (let s = 0; s <= 5; s++) expect(collectStepIssues(s, f)).toEqual([]);
      const single = await singleResult(f);
      expect([single.mode, single.result.isExempt, single.result.totalTax]).toEqual(["single", true, 0]);

      const rec = singleRecord(f, single);
      const elig = checkRealEstateRecalc(rec);
      expect(elig.ok).toBe(false);
      // 화면 ⑧과 같은 술어·같은 문구(단일 소스)
      const gate = validateMultiSupportedMode(f)!;
      expect(gate).toBeTruthy();
      expect(!elig.ok && elig.reason).toContain(gate);
      // 직접 호출해도 일반 양도로 계산하지 않는다
      await expect(recalcRealEstate(rec)).rejects.toThrow(gate);
    });
  }

  it("다건 이력 — 한 건이라도 ⑧이 막는 자산이면 막고, 사유에 건 이름을 단다", () => {
    const elig = checkRealEstateRecalc(multiRecord(CASES[0][1]));
    expect(elig.ok).toBe(false);
    expect(!elig.ok && elig.reason).toContain("마포 아파트");
    expect(!elig.ok && elig.reason).toContain(validateMultiSupportedMode(CASES[0][1])!);
  });

  it("긍정 짝 — 같은 날짜·가액의 일반 주택은 재계산 가능하고 단건과 같이 비과세 0원", async () => {
    const f = form(HOUSING(), "2024-03-01");
    const single = await singleResult(f);
    expect(single.result).toMatchObject({ isExempt: true, totalTax: 0 });
    const rec = singleRecord(f, single);
    expect(checkRealEstateRecalc(rec)).toEqual({ ok: true, kind: "single" });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-11T03:00:00Z"));
    routeFetch();
    const agg = await recalcRealEstate(rec);
    expect([agg.properties[0]?.isExempt, agg.totalTax]).toEqual([true, 0]);
  });

  it("긍정 짝 — 다건 이력의 일반 주택은 막지 않는다", () => {
    expect(checkRealEstateRecalc(multiRecord(form(HOUSING(), "2024-03-01")))).toEqual({ ok: true, kind: "multi" });
  });
});

describe("G2-2 ⑫ — 다건 route는 §166 자산을 서버에서도 거부한다", () => {
  for (const [name, f] of CASES) {
    it(`${name}: propertyType만 실린 본문도 400`, async () => {
      const body = await buildMultiBody([f]);
      const props = body.properties as Record<string, unknown>[];
      expect(["redevelopment_apt", "right_to_move_in"]).toContain(props[0].propertyType);
      const res = await POST_MULTI(
        new NextRequest("http://l/api/calc/transfer/multi", {
          method: "POST",
          headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
          body: JSON.stringify(body),
        }),
      );
      expect(res.status).toBe(400);
      expect(JSON.stringify(await res.json())).toContain("단건 계산기에서만 지원");
    });
  }
});
