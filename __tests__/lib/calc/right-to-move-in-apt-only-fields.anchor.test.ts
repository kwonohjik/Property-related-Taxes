/**
 * 입주권(`right_to_move_in`)에 **완공 APT 전용 필드**가 새지 않는지 봉인 (2026-08-14).
 *
 * 두 필드는 신축 APT가 존재해야 성립하는 사실이라 완공 전 권리 양도인 입주권에는 없다:
 *   `redevReceiveOnlyMode`          — 청산금 수령분 단독 신고 (사례 46)
 *   `redevNewHouseResidenceMonths`  — 신축 APT 거주월수 (사례 45)
 *
 * 종전 결함(실측):
 *   - receiveOnly: `transfer-tax-api.ts`가 **양도가액을 청산금 수령액으로 교체**했다.
 *     엔진의 receiveOnly 구현은 `computeAptReceive` 안에만 있어 입주권 분기에는
 *     「양도차익 0 강제」가 걸리지 않는다 ⇒ 양도차익만 사라졌다(4.2억 → 청산금 분 1.7억 소실).
 *   - newHouseResidenceMonths: 입주권 LTHD가 14% → 68%로 부풀었다.
 *
 * 방어선은 3층이다 — 이 파일은 **API 변환층**을 본다:
 *   ① UI 카드 숨김 (`RedevelopmentBlock`)  ② 저장값 정규화 (`calc-wizard-asset-migrate`)
 *   ③ API 미송신 (본 anchor)               ④ 엔진 가드 (`redevelopment-lthd` — 별도 anchor)
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { buildRedevelopmentPayload } from "@/lib/calc/transfer-tax-api-redev";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

const TRANSFER_PRICE = "420000000";
const SETTLEMENT_AMOUNT = "50000000";

function asset(assetKind: "right_to_move_in" | "redevelopment_apt"): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind,
    redevSubject: assetKind === "right_to_move_in" ? "right" : "apt",
    acquisitionCause: "purchase",
    acquisitionDate: "2009-04-09",
    fixedAcquisitionPrice: "180000000",
    useEstimatedAcquisition: false,
    redevApprovalLawBasis: "urban_renovation_art_74",
    redevOriginalAssetType: "housing",
    redevSettlementDirection: "receive",
    redevApprovalDate: "2016-10-23",
    redevRightsValue: "300000000",
    redevSettlementAmount: SETTLEMENT_AMOUNT,
    redevPreApprovalExpenses: "0",
    redevPostApprovalExpenses: "0",
    redevActualAcquisitionPrice: "180000000",
    // ⚠️ stale 저장값 재현 — UI에서는 입주권에 노출되지 않지만 sessionStorage에는 남을 수 있다.
    redevReceiveOnlyMode: "yes",
    redevNewHouseResidenceMonths: "120",
    redevPriorHouseResidenceMonths: "0",
  } as AssetForm;
}

function form(assetKind: "right_to_move_in" | "redevelopment_apt") {
  return {
    ...createDefaultTransferFormData(),
    transferDate: "2026-03-02",
    filingDate: "2026-04-30",
    contractTotalPrice: TRANSFER_PRICE,
    householdHousingCount: "1",
    assets: [asset(assetKind)],
  };
}

/** fetch를 가로채 엔진에 보내는 request body만 회수한다 */
async function captureBody(f: unknown): Promise<Record<string, unknown>> {
  let captured: Record<string, unknown> = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      captured = JSON.parse(init.body);
      return { ok: true, json: async () => ({ result: {} }) } as unknown as Response;
    }),
  );
  try {
    await callTransferTaxAPI(f as never);
  } catch {
    /* 응답 형태는 관심 밖 — body만 본다 */
  }
  return captured;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("입주권 — 완공 APT 전용 필드 차단 (API 변환층)", () => {
  it("R-1: 입주권 + stale receiveOnly=yes → 양도가액이 청산금액으로 교체되지 않는다", async () => {
    const body = await captureBody(form("right_to_move_in"));

    expect(body.propertyType).toBe("right_to_move_in");
    // 종전 결함: 50,000,000 (청산금 수령액)으로 교체됐다.
    expect(body.transferPrice).toBe(420_000_000);
  });

  it("R-2: 입주권 payload에 receiveOnlyMode·newHouseResidenceMonths가 실리지 않는다", () => {
    const payload = buildRedevelopmentPayload(asset("right_to_move_in"));

    expect(payload.subject).toBe("right");
    expect(payload.receiveOnlyMode).toBeUndefined();
    expect(payload.newHouseResidenceMonths).toBeUndefined();
  });

  it("R-3: 완공 APT는 종전 그대로 — 두 필드가 살아 있다 (사례 45·46 회귀 방지)", async () => {
    const payload = buildRedevelopmentPayload(asset("redevelopment_apt"));
    expect(payload.subject).toBe("apt");
    expect(payload.receiveOnlyMode).toBe(true);
    expect(payload.newHouseResidenceMonths).toBe(120);

    // APT에서는 receiveOnly 미러링(양도가액 = 청산금 수령액)이 유지돼야 한다.
    const body = await captureBody(form("redevelopment_apt"));
    expect(body.transferPrice).toBe(50_000_000);
  });
});
