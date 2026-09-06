/**
 * anchor: 토지 출자 상세명세서의 「② 인가후 분」이 zero-filled 슬롯을 읽지 않는다 — UI 리뷰 高.
 *
 * 토지 출자(originalAssetType="land" + subject="right" + settlementDirection="pay") 경로에서
 * 엔진은 `postApprovalExistingHouse`를 **전 필드 0으로 zero-fill**하고
 * (`lib/tax-engine/redevelopment.ts:267` 「항상 0」) 실제 인가후 분을 `settlement`에 담는다:
 *   양도가액 = 실지 양도가 **전액** · 취득가액 = 권리가액 · 필요경비 = 청산금 + 부대비용
 *
 * 같은 화면 신고서 양식은 이를 알고 `const post = r.settlement;`를 쓰며
 * `FilingFormTableRedevRows.ts:284`에 「zero-filled — **사용 금지**」라고 적어 두었다.
 * 상세명세서만 금지된 슬롯을 읽어 ② 행이 전부 **0**으로 떴고, 합계 행은 정상값이라
 * 「합계 ≠ 분할 합」이 됐다.
 *
 * ⭐ 픽스처를 손으로 만들지 않는다 — **엔진을 실제로 돌려** 얻은 결과를 쓴다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import { applyLandContribOverrides } from "@/components/calc/results/transfer/DetailedStatementRedevelopmentBuilders";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";
import type { StatementItem } from "@/components/calc/results/transfer/DetailedStatementHelpers";

const rates = makeMockRates();
const TRANSFER_PRICE = 1_500_000_000;

function landContribInput(): TransferTaxInput {
  // ⚠️ `landContribDetail`은 **환산 모드**에서만 만들어진다
  //    (`redevelopment.ts:188` — subject="right" && originalAssetType="land" && useEstimated).
  const redev: RedevelopmentInfo = {
    subject: "right",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2013-10-23"),
    rightsValue: 650_000_000,
    settlementDirection: "pay",
    settlementAmount: 300_000_000,
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "land",
    landStdPriceAtAcq: 200_000_000,
    landStdPriceAtApproval: 500_000_000,
  };
  return baseTransferInput({
    propertyType: "right_to_move_in",
    transferPrice: TRANSFER_PRICE,
    transferDate: new Date("2023-02-16"),
    acquisitionDate: new Date("2007-04-09"),
    acquisitionPrice: 0,
    expenses: 0,
    useEstimatedAcquisition: true,
    redevelopment: redev,
    isOneHousehold: false,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
  });
}

/** 명세서 items를 실제 엔진 결과로 만든다. */
function buildItems() {
  const result = calculateTransferTax(landContribInput(), rates);
  const redev = result.redevelopmentDetail!;
  const items = new Map<string, StatementItem>([
    ["transferPrice", { label: "전체 양도가액", value: 0 } as StatementItem],
    ["acquisitionPrice", { label: "취득가액", value: 0 } as StatementItem],
    ["transferGain", { label: "전체 양도차익", value: 0 } as StatementItem],
    ["incomeAmount", { label: "양도소득금액", value: 0 } as StatementItem],
  ]);
  applyLandContribOverrides(items, redev, TRANSFER_PRICE);
  return { items, redev };
}

/** ② 인가후 분 행을 꺼낸다. */
function postRow(items: Map<string, StatementItem>, key: string) {
  const per = items.get(key)?.perAsset;
  const row = per?.find((r) => r.label.startsWith("②"));
  if (!row) throw new Error(`${key}의 ② 행이 없다`);
  return row;
}

describe("토지 출자 명세서 — ② 인가후 분 슬롯", () => {
  it("🔑 L-1: 엔진이 zero-fill하는 슬롯과 실제 데이터가 다른 자리에 있다 (전제 확인)", () => {
    const { redev } = buildItems();
    expect(redev.postApprovalExistingHouse.apportionedTransfer).toBe(0);
    expect(redev.postApprovalExistingHouse.gain).toBe(0);
    expect(redev.settlement.apportionedTransfer).toBe(TRANSFER_PRICE);
    expect(redev.settlement.apportionedAcquisition).toBe(650_000_000);
  });

  it("🔑 L-2: ② 양도가액이 0이 아니라 실지 양도가액 전액이다", () => {
    const { items } = buildItems();
    expect(postRow(items, "transferPrice").value).toBe(TRANSFER_PRICE);
  });

  it("🔑 L-3: ② 취득가액·양도차익도 zero-filled가 아니다", () => {
    const { items, redev } = buildItems();
    expect(postRow(items, "acquisitionPrice").value).toBe(redev.settlement.apportionedAcquisition);
    expect(postRow(items, "transferGain").value).toBe(redev.settlement.gain);
    expect(redev.settlement.gain).toBeGreaterThan(0);
  });

  it("🔑 L-4: 양도차익 산식에 필요경비 항이 있어 좌변이 우변을 만든다", () => {
    const { items, redev } = buildItems();
    const s = redev.settlement;
    const f = postRow(items, "transferGain").formula ?? "";
    expect(f).toContain("필요경비");
    // 산식이 실제로 성립한다.
    expect(s.apportionedTransfer - s.apportionedAcquisition - (s.expenses ?? 0)).toBe(s.gain);
  });

  it("L-5: ② 양도가액 산식이 양도차익 산식을 가장하지 않는다", () => {
    const { items } = buildItems();
    const f = postRow(items, "transferPrice").formula ?? "";
    expect(f).toContain("실지 양도가액 전액");
    expect(f).not.toContain("청산금");
  });
});
