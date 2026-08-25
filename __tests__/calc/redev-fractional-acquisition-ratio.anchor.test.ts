/**
 * Pre-Do anchor — **입주권·§166 재개발 취득가액에 공유 지분율 미적용** (U2-03)
 *
 * ## 무엇이 깨져 있었나
 *
 * 화면 규약은 「지분 모드 — 모든 금액을 **100% 기준**으로 입력하세요. 시스템이 지분율을 자동으로
 * 적용합니다」다(`components/calc/transfer/OwnershipRatioInput.tsx:13`). `transferPrice`는 그 규약대로
 * `applyRatio(totalContractPrice, primaryRatio)`로 안분되는데, `acquisitionPrice` 삼항은
 * `primaryFractional ? applyRatio(...)` 분기가 **가장 마지막 갈래에만** 붙어 있었다:
 *
 * | 갈래 | 종전 | 지분 1/2 실측 |
 * |---|---|---|
 * | 승계조합원 입주권 `successorRightAcquisitionTotal` | 지분 미적용 | 500,000,000 |
 * | §166 원조합원 `redevActualAcquisitionPrice` | 지분 미적용 | 500,000,000 |
 * | §166 승계 완공APT `fixedAcquisitionPrice` | 지분 미적용 | 500,000,000 |
 * | 일반주택(대조군) `fixedAcquisitionPrice` | 적용 | **250,000,000** |
 *
 * 양도가액만 반으로 줄고 취득가액이 100%로 남으므로 **양도차익이 지분율만큼 과소**하다.
 * 위 픽스처에서 차익 250,000,000원이 0원이 된다.
 *
 * ## 조문
 *
 * · 「소득세법」 §100① — 양도차익 = 양도가액 − 취득가액. 두 항이 **같은 지분 스케일**이어야 성립한다.
 * · 같은 법 §97①1호 가목 — 취득가액은 「그 자산의 취득에 든 실지거래가액」.
 *
 * ## 안전망 실측 (수정 전)
 *
 * 마지막 갈래의 `applyRatio`를 제거하는 뮤테이션으로 `__tests__/calc/` + `__tests__/lib/calc/`
 * 전건을 돌린 결과 **0/2620 실패**. ④ 층에서 이 규칙을 보는 테스트가 하나도 없었다.
 */
import { describe, it, expect, vi } from "vitest";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

const TOTAL_TRANSFER = "1000000000";
const TOTAL_ACQUISITION = "500000000";
const HALF_ACQUISITION = 250_000_000;

/** ④ 변환이 실제로 fetch에 실은 body를 그대로 잡는다 — 재구성하지 않는다. */
async function buildBody(form: TransferFormData): Promise<Record<string, unknown>> {
  const captured: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      captured.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }),
  );
  await callTransferTaxAPI(form);
  vi.unstubAllGlobals();
  return captured.body!;
}

function makeForm(assets: AssetForm[]): TransferFormData {
  return {
    transferDate: "2026-06-01",
    assets,
    houses: [],
    presaleRights: [],
    contractTotalPrice: TOTAL_TRANSFER,
    totalTransferExpense: "0",
  } as unknown as TransferFormData;
}

/** 지분 1/2 공통 축 — 금액은 전부 100% 기준. */
function halfShare(over: Partial<AssetForm>): AssetForm {
  return {
    ...makeDefaultAsset(1),
    acquisitionDate: "2015-01-10",
    ownershipNumerator: "1",
    ownershipDenominator: "2",
    actualSalePrice: TOTAL_TRANSFER,
    ...over,
  } as AssetForm;
}

describe("U2-03 · 지분 모드 취득가액 안분", () => {
  it("U2-03-00: 대조군 — 일반주택 1/2 지분은 이미 안분된다 (회귀 가드)", async () => {
    const body = await buildBody(
      makeForm([halfShare({ assetKind: "housing", fixedAcquisitionPrice: TOTAL_ACQUISITION })]),
    );
    expect(body.transferPrice).toBe(500_000_000);
    expect(body.acquisitionPrice).toBe(HALF_ACQUISITION);
  });

  it("U2-03-01: 승계조합원 입주권 — 승계취득가 + 추가분담금도 안분된다", async () => {
    const body = await buildBody(
      makeForm([
        halfShare({
          assetKind: "right_to_move_in",
          isSuccessorRightToMoveIn: true,
          successorRightAcqPrice: "400000000",
          successorRightAddedContribution: "100000000",
        }),
      ]),
    );
    expect(body.transferPrice).toBe(500_000_000);
    // 종전: 500,000,000 (100% 그대로) → 양도차익 0
    expect(body.acquisitionPrice).toBe(HALF_ACQUISITION);
  });

  it("U2-03-02: §166 원조합원 — redevActualAcquisitionPrice도 안분된다", async () => {
    const body = await buildBody(
      makeForm([
        halfShare({
          assetKind: "right_to_move_in",
          isSuccessorRightToMoveIn: false,
          redevSubject: "right",
          redevApprovalDate: "2018-05-01",
          redevActualAcquisitionPrice: TOTAL_ACQUISITION,
          redevRightsValue: "600000000",
          redevSettlementDirection: "pay",
          redevSettlementAmount: "0",
        }),
      ]),
    );
    expect(body.transferPrice).toBe(500_000_000);
    expect(body.acquisitionPrice).toBe(HALF_ACQUISITION);
  });

  it("U2-03-03: §166 승계 완공APT — fixedAcquisitionPrice도 안분된다", async () => {
    const body = await buildBody(
      makeForm([
        halfShare({
          assetKind: "redevelopment_apt",
          redevSubject: "apt",
          redevIsSuccessorMember: "yes",
          redevApprovalDate: "2018-05-01",
          fixedAcquisitionPrice: TOTAL_ACQUISITION,
          redevSettlementDirection: "pay",
          redevSettlementAmount: "0",
        }),
      ]),
    );
    expect(body.transferPrice).toBe(500_000_000);
    expect(body.acquisitionPrice).toBe(HALF_ACQUISITION);
  });

  it("U2-03-04: 지분 100%면 어느 갈래도 원값 그대로다 (과안분 방지)", async () => {
    const full = (over: Partial<AssetForm>): AssetForm =>
      ({ ...halfShare(over), ownershipNumerator: "1", ownershipDenominator: "1" }) as AssetForm;

    const successor = await buildBody(
      makeForm([
        full({
          assetKind: "right_to_move_in",
          isSuccessorRightToMoveIn: true,
          successorRightAcqPrice: "400000000",
          successorRightAddedContribution: "100000000",
        }),
      ]),
    );
    expect(successor.acquisitionPrice).toBe(500_000_000);

    const redev = await buildBody(
      makeForm([
        full({
          assetKind: "right_to_move_in",
          redevSubject: "right",
          redevApprovalDate: "2018-05-01",
          redevActualAcquisitionPrice: TOTAL_ACQUISITION,
          redevRightsValue: "600000000",
          redevSettlementDirection: "pay",
          redevSettlementAmount: "0",
        }),
      ]),
    );
    expect(redev.acquisitionPrice).toBe(500_000_000);
  });
});
