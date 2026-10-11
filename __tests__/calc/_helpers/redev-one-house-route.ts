/**
 * 재개발 완공APT × 1세대1주택 anchor 공용 harness — 폼 → ④ callTransferTaxAPI 본문 가로채기 →
 * 계산기 route(⑫⑭) → 엔진, 그리고 ⑧ 전 단계 이슈.
 *
 * ⚠️ `vi.mock("@/lib/db/tax-rates")`·`vi.mock("@/lib/api/rate-limit")`은 vitest 호이스팅 때문에
 *    **각 테스트 파일에서** 선언해야 한다(helper 안에 두면 적용되지 않는다).
 */
import { vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/transfer/route";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

export function allIssues(form: TransferFormData) {
  const out: { step: number; field?: string; message: string }[] = [];
  for (let s = 0; s <= 5; s++) {
    for (const i of collectStepIssues(s, form)) out.push({ step: s, field: i.field, message: i.message });
  }
  return out;
}

export async function captureBody(form: TransferFormData): Promise<Record<string, unknown>> {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as unknown as Response;
    }),
  );
  try {
    await callTransferTaxAPI(form);
  } catch {
    /* body만 필요하다 */
  }
  vi.unstubAllGlobals();
  return cap.body!;
}

export async function postTransfer(body: Record<string, unknown>) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = (await res.json()) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, json, result: json?.data?.result as any };
}

export async function runCalc(form: TransferFormData) {
  const issues = allIssues(form);
  const body = await captureBody(form);
  const r = await postTransfer(body);
  return { issues, body, status: r.status, result: r.result, json: r.json };
}

export const houseRow = (id: string, acq: string, over: Partial<HouseEntry> = {}): HouseEntry =>
  ({
    id,
    region: "capital",
    acquisitionDate: acq,
    officialPrice: "300000000",
    isInherited: false,
    isLongTermRental: false,
    isApartment: true,
    isOfficetel: false,
    isUnsoldHousing: false,
    ...over,
  }) as unknown as HouseEntry;

/**
 * 원조합원 완공APT(종전주택 2008-01-01 · 인가 2016-06-01 · 청산금 1억 납부 · 거주 60개월 · 양도 2024-06-01).
 * `price`는 물건 **전체** 계약가, `shareNum/shareDen`을 주면 지분 모드(⑤ 지분 분할)다.
 */
export function redevAptForm(opts: {
  kind?: "redevelopment_apt" | "housing";
  houses?: HouseEntry[];
  count?: string;
  price?: string;
  share?: [string, string];
  assetOver?: Record<string, unknown>;
  formOver?: Partial<TransferFormData>;
} = {}): TransferFormData {
  const { kind = "redevelopment_apt", houses = [], count = "1", price = "2000000000", share, assetOver = {}, formOver = {} } = opts;
  const f = createDefaultTransferFormData();
  const shareFields = share
    ? {
        ownershipNumerator: share[0],
        ownershipDenominator: share[1],
        ownershipRemainderThirdParty: share[0] === share[1] ? "" : "yes",
      }
    : {};
  const asset =
    kind === "redevelopment_apt"
      ? ({
          ...makeDefaultAsset(1),
          assetKind: "redevelopment_apt",
          acquisitionCause: "purchase",
          acquisitionDate: "2008-01-01",
          fixedAcquisitionPrice: "400000000",
          actualSalePrice: price,
          redevSubject: "apt",
          redevApprovalDate: "2016-06-01",
          redevApprovalLawBasis: "urban_renovation_art_74",
          redevOriginalAssetType: "housing",
          redevSettlementDirection: "pay",
          redevSettlementAmount: "100000000",
          redevRightsValue: "900000000",
          redevIsSuccessorMember: "no",
          redevActualAcquisitionPrice: "400000000",
          addressJibun: "서울 테스트동 1",
          residenceInputMode: "interval",
          residencePeriods: [{ moveInDate: "2019-06-01", moveOutDate: "2024-06-01" }],
          ...shareFields,
          ...assetOver,
        } as unknown as AssetForm)
      : ({
          ...makeDefaultAsset(1),
          assetKind: "housing",
          acquisitionCause: "purchase",
          acquisitionDate: "2008-01-01",
          // 재개발 경로의 총 취득가액 = 종전주택 4억 + 납부 청산금 1억 = 5억과 같은 양도차익이 되게 맞춘다.
          fixedAcquisitionPrice: "500000000",
          actualSalePrice: price,
          addressJibun: "서울 테스트동 1",
          residenceInputMode: "interval",
          residencePeriods: [{ moveInDate: "2019-06-01", moveOutDate: "2024-06-01" }],
          ...shareFields,
          ...assetOver,
        } as unknown as AssetForm);
  return {
    ...f,
    transferDate: "2024-06-01",
    filingDate: "2024-08-31",
    contractTotalPrice: price,
    householdHousingCount: count,
    isOneHousehold: true,
    isRegulatedArea: false,
    residencePeriodMonths: "60",
    assets: [asset],
    houses,
    householdNoOtherHousesConfirmed: houses.length === 0,
    householdNoPresaleRightsConfirmed: true,
    ...formOver,
  } as TransferFormData;
}
