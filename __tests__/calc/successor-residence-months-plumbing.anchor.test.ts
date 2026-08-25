/**
 * anchor — E1-08 배관 : 승계조합원 「신축주택 거주기간」이 ⑤→④→⑫를 통과하는가.
 *
 * 엔진에 §159의4 축을 살려도 **입력 경로가 없으면 no-op**이다. 종전 승계조합원 화면에는
 * 거주기간 입력이 하나도 없었다 — 거주월수 분리 카드는 승계 모드에서 숨겨졌고
 * (`RedevelopmentBlock.tsx` `asset.redevIsSuccessorMember !== "yes"`), Step4의 거주기간
 * 섹션은 `primaryKind === "housing"`에서만 렌더된다.
 *
 * 필드 자체(`redevNewHouseResidenceMonths` → `newHouseResidenceMonths`)는 사례 45가 이미
 * 쓰고 있어 ①②③④⑫⑭가 갖춰져 있다. 여기서 고정하는 것은 **승계조합원 조합에서도 그 경로가
 * 열려 있는가**다 — ④의 `isApt` 게이트가 승계 모드를 막지 않는지.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

function captureBody() {
  const captured: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      captured.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }),
  );
  return captured;
}

afterEach(() => vi.unstubAllGlobals());

function makeForm(months: string) {
  return {
    transferDate: "2023-02-16",
    isOneHousehold: true,
    householdHousingCount: "1",
    houses: [],
    presaleRights: [],
    assets: [
      {
        ...makeDefaultAsset(1),
        assetKind: "redevelopment_apt" as const,
        acquisitionCause: "purchase" as const,
        acquisitionDate: "2010-05-01",
        fixedAcquisitionPrice: "500,000,000",
        actualSalePrice: "2,000,000,000",
        redevSubject: "apt" as const,
        redevApprovalDate: "2009-01-10",
        redevApprovalLawBasis: "urban_renovation_art_74" as const,
        redevOriginalAssetType: "housing" as const,
        redevSettlementDirection: "pay" as const,
        redevSettlementAmount: "0",
        redevIsSuccessorMember: "yes" as const,
        redevCompletionDate: "2011-03-01",
        redevNewHouseResidenceMonths: months,
      },
    ],
  } as unknown as TransferFormData;
}

const redevOf = (b: Record<string, unknown> | undefined) =>
  b?.redevelopment as Record<string, unknown> | undefined;

describe("E1-08 배관 — 승계조합원 신축주택 거주월수", () => {
  it("🔑 입력하면 body.redevelopment.newHouseResidenceMonths로 실린다", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm("132"));
    expect(redevOf(cap.body)).toBeDefined();
    expect(redevOf(cap.body)?.isSuccessorMember).toBe(true);
    expect(redevOf(cap.body)?.newHouseResidenceMonths).toBe(132);
  });

  it("미입력이면 undefined — 거주 사실을 지어내지 않는다", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm(""));
    expect(redevOf(cap.body)?.newHouseResidenceMonths).toBeUndefined();
  });
});
