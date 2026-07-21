/**
 * anchor: 표준·상가 자산 증여취득 §163⑨ 추계모드 차단 (block)
 *
 * 계획: docs/02-design/features/transfer-standard-commercial-gift-163-9-block.plan.md
 *
 * 버그(probe 실측): 증여로 취득한 표준(주택·토지·건물)·상가건물에서 추계모드(환산·감정·매매사례,
 * 또는 토지 pre1990 토지등급 래치)를 선택하면 §163⑨상 취득가액으로 써야 할 증여 신고가액이
 * 무시되고 추계값 + 개산공제(§163⑥)가 적용된다(환산 657,666,667 / 감정 491,000,000 /
 * 매매사례 541,000,000 vs 정답 500,000,000).
 *
 * §163⑨: 증여받은 자산은 증여일 §60~66 평가액(신고가액)을 취득당시 실지거래가액으로 의제 →
 * 취득가액 항상 확인 가능 → 추계(§176의2) 불필요. post-1985 증여는 실거래가 모드를 강제한다.
 * pre-1985 증여는 의제취득(§176의2④) 영역이라 제외.
 *
 * 검증 전략(가드 격리): "차단" 케이스는 §163⑨ 차단 메시지 포함, "통과(가드 미발동)" 케이스는
 * 그 메시지 미포함으로 확인(다른 validation 필드 충족 여부와 독립).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-asset";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

const BLOCK_MSG = "환산취득가·감정가액·매매사례가액";

function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "building",
    acquisitionCause: "gift",
    acquisitionDate: "2018-06-01",
    donorAcquisitionDate: "2010-06-01",
    fixedAcquisitionPrice: "500,000,000",
    standardPriceAtAcq: "300,000,000",
    standardPriceAtTransfer: "900,000,000",
    useEstimatedAcquisition: false,
    isAppraisalAcquisition: false,
    isSalesCaseAcquisition: false,
    ...over,
  } as AssetForm;
}
const V = (a: AssetForm) => validateAssetAcquisition(a, "자산 1", "2026-06-01");

describe("표준·상가 gift §163⑨ 추계모드 차단 (validation)", () => {
  // ── 차단 케이스 ──
  it("A1 표준 건물 gift(2018) + 환산 → 차단", () => {
    expect(V(asset({ useEstimatedAcquisition: true }))).toContain(BLOCK_MSG);
  });
  it("A2 표준 토지 gift(2018) + 환산 → 차단", () => {
    expect(V(asset({ assetKind: "land", useEstimatedAcquisition: true }))).toContain(BLOCK_MSG);
  });
  it("A3 표준 건물 gift(2018) + 감정가액 → 차단", () => {
    expect(V(asset({ isAppraisalAcquisition: true }))).toContain(BLOCK_MSG);
  });
  it("A4 표준 건물 gift(2018) + 매매사례 → 차단", () => {
    expect(V(asset({ isSalesCaseAcquisition: true, similarSalesValue: "450,000,000" }))).toContain(
      BLOCK_MSG,
    );
  });
  it("A7 상가 gift(2018) + 환산 → 차단", () => {
    expect(V(asset({ assetKind: "commercial_building", useEstimatedAcquisition: true }))).toContain(
      BLOCK_MSG,
    );
  });
  it("A8 상가 gift(2018) + 감정가액 → 차단", () => {
    expect(V(asset({ assetKind: "commercial_building", isAppraisalAcquisition: true }))).toContain(
      BLOCK_MSG,
    );
  });

  // ── 통과(가드 미발동) 케이스 ──
  it("A5 표준 건물 gift + 실거래가 + 신고가액 → 가드 미발동", () => {
    expect(V(asset()) ?? "").not.toContain(BLOCK_MSG);
  });
  it("A6 표준 건물 gift(1983, pre-1985) + 환산 → 가드 미발동(의제취득)", () => {
    expect(V(asset({ acquisitionDate: "1983-06-01", useEstimatedAcquisition: true })) ?? "").not.toContain(
      BLOCK_MSG,
    );
  });
  it("A9 상가 gift + 실거래가 + 신고가액 → 가드 미발동", () => {
    expect(V(asset({ assetKind: "commercial_building" })) ?? "").not.toContain(BLOCK_MSG);
  });
  it("A10 표준 건물 상속 + 환산 → 가드 미발동(무변경)", () => {
    expect(
      V(asset({ acquisitionCause: "inheritance", useEstimatedAcquisition: true })) ?? "",
    ).not.toContain(BLOCK_MSG);
  });
  it("A11 부담부증여(transferType) + 환산 → gift 추계 가드 미발동", () => {
    expect(
      V(asset({ transferType: "burdened_gift", useEstimatedAcquisition: true })) ?? "",
    ).not.toContain(BLOCK_MSG);
  });
});

// ─────────────────────────────────────────────────────────
// B: pre1990 토지등급 uncleaable 래치 게이트 (hasPre1990: gift post-1985 → false)
//    API body의 acquisitionPrice가 신고가액(≠0)이어야 §163⑨ 정합.
// ─────────────────────────────────────────────────────────
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
function landForm(over: Partial<AssetForm> = {}): TransferFormData {
  const a = {
    ...makeDefaultAsset(1),
    assetKind: "land" as const,
    acquisitionCause: "gift" as const,
    acquisitionDate: "1987-06-01",
    donorAcquisitionDate: "1980-06-01",
    fixedAcquisitionPrice: "500,000,000",
    pre1990Enabled: true, // 환산→실거래가 전환 후 stale 래치
    useEstimatedAcquisition: false,
    ...over,
  };
  return {
    transferDate: "2026-06-01",
    assets: [a],
    houses: [],
    presaleRights: [],
    sellingHouseRegion: "non_regulated",
    contractTotalPrice: "1,000,000,000",
  } as unknown as TransferFormData;
}

describe("pre1990 토지등급 래치 게이트 (API hasPre1990)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("B1 land gift(1987) + pre1990 stale + 실거래가 → acquisitionPrice=신고가액(≠0)", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(landForm());
    expect(cap.body?.acquisitionPrice).toBe(500_000_000);
    expect(cap.body?.pre1990Land).toBeUndefined();
  });

  it("B3 land purchase(1987) + pre1990 → hasPre1990 유지(비-gift 무변경·회귀)", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(
      landForm({ acquisitionCause: "purchase", useEstimatedAcquisition: true }),
    );
    // 비-gift는 게이트 미적용 → 환산 경로(acquisitionPrice=0) 유지
    expect(cap.body?.acquisitionPrice).toBe(0);
  });
});
