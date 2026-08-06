/**
 * Pre-Do anchor — **주택 별개취득**도 취득시 기준시가를 파트별 독립 산정한다.
 *
 * 사용자 보고 2026-07-30(이미지 9): 토지 2025-1-8 · 건물 2025-8-29 취득(신축 패턴)에서
 * 상단 결합 총액(개별·공동주택가격) 입력을 요구하고 건물분을 역산하고 있었다.
 *
 * ## 법령 근거 (KoreanLaw MCP 실측)
 * 소득세법 시행령 §163⑥2호가목: "§99①1호 **다목**의 건물(그 부수토지 포함) 및 동호 **라목**의 주택
 * **취득당시**의 다목 또는 라목의 가액 × 3/100". 즉 **취득 당시에 라목 주택으로서의 가액이 존재**해야
 * 이 호가 적용된다. 토지를 먼저 취득하고 건물을 나중에 신축·취득했다면 **토지 취득 당시에는 주택이
 * 없으므로** 라목 결합 공시 자체가 존재하지 않는다 → §163⑥1호(토지: 취득당시 §99①1호 가목
 * 개별공시지가 × 3/100)와 2호(건물)가 **각각** 적용된다.
 *
 * 결합 총액에서 역산하면 건물분에 **토지 취득시점**이 섞인다(§164③ 직전 고시분 위반).
 * 종전 구현은 이 파트 독립 경로를 `propertyType === "building"` 전용으로 막아,
 * 주택 별개취득에서 법령과 다른 base가 쓰였다.
 *
 * ⚠️ **동시 취득 주택은 종전 그대로**다 — 그 경우 라목 결합 공시가 실재하고 역산이 정본이다.
 */
import { describe, it, expect } from "vitest";
import { calcSplitGain } from "@/lib/tax-engine/transfer-tax-split-gain";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

/** 토지 2025-01-08 · 건물 2025-08-29 취득 → 2026-03-06 양도. 건물만 환산. */
function housingSeparateAcq(over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return {
    propertyType: "housing",
    transferDate: new Date("2026-03-06"),
    acquisitionDate: new Date("2025-08-29"),
    landAcquisitionDate: new Date("2025-01-08"),
    isSeparateAcquisition: true,
    transferPrice: 1_000_000_000,
    // ⚠️ **§100③ 정합** (2026-08-06 Phase 1-C). 종전 값(토지 6억 / 건물 4억)은 아래 양도시
    //    기준시가 비율(3억 : 1억 = 75:25 → 안분 7.5억 / 2.5억)에서 **건물이 60% 벗어난다**.
    //    「소득세법」 §100③이 「안분계산한 가액과 100분의 30 이상 차이」를 「불분명한 때로 본다」고
    //    의제하므로 그 조합은 애초에 성립하지 않는 신고였다(가드 도입 후 안분값으로 되돌려진다).
    //    이 anchor의 주제는 **취득시 기준시가 축**이므로 양도가액은 안분값과 일치시켜 두 축의
    //    간섭을 없앤다 — 우발적 조합이 anchor의 의미를 흐리지 않게 한다.
    landTransferPrice: 750_000_000,
    buildingTransferPrice: 250_000_000,
    saleSplitMode: "actual",
    landAcqMode: "actual",
    buildingAcqMode: "estimated",
    landAcquisitionPrice: 150_000_000,
    // 파트별 취득시 기준시가 — 각자 자기 취득일 직전 고시분
    standardPricePerSqmAtAcquisition: 1_000_000,
    acquisitionArea: 200, // 토지분 200,000,000 (2025-01-08 기준)
    buildingStandardPriceAtAcquisition: 120_000_000, // 나목 (2025-08-29 기준)
    landStandardPriceAtTransfer: 300_000_000,
    buildingStandardPriceAtTransfer: 100_000_000,
    isUnregistered: false,
    ...over,
  } as TransferTaxInput;
}

describe("주택 별개취득 — 건물분 취득시 기준시가 파트 독립 (§163⑥·§164③)", () => {
  it("🔴 H1 결합 총액 없이도 계산된다 (파트별 값만으로 완결)", () => {
    // 상단 결합 총액 블록이 숨겨지므로 standardPriceAtAcquisition은 전송되지 않는다.
    const r = calcSplitGain(housingSeparateAcq({ standardPriceAtAcquisition: undefined }));
    expect(r, "파트별 값이 다 있는데 분리 계산이 비활성되면 안 된다").toBeTruthy();
  });

  it("🔴 H2 건물 환산취득가 분자로 **입력한 나목 기준시가**를 쓴다 (역산 아님)", () => {
    const r = calcSplitGain(housingSeparateAcq({ standardPriceAtAcquisition: undefined }));
    // 건물 환산 = 건물 양도가 × (취득시 건물 기준시가 ÷ 양도시 건물 기준시가)
    //           = 250,000,000 × (120,000,000 ÷ 100,000,000) = 300,000,000
    expect(r?.building.acquisitionPrice).toBe(300_000_000);
  });

  it("🔴 H3 결합 총액이 남아 있어도 파트 입력이 우선한다 (stale 총액 무시)", () => {
    // 사용자가 종전 화면에서 넣었던 총액이 폼에 남아 전송돼도, 파트 값이 있으면 그것이 정본이다.
    const r = calcSplitGain(housingSeparateAcq({ standardPriceAtAcquisition: 900_000_000 }));
    expect(r?.building.acquisitionPrice).toBe(300_000_000);
  });

  it("H4 토지분은 자기 취득일 기준 ㎡당 공시지가 × 면적 (§99①1호 가목)", () => {
    const r = calcSplitGain(housingSeparateAcq({ standardPriceAtAcquisition: undefined }));
    // 토지는 실지거래가액이므로 취득가액은 입력값 그대로
    expect(r?.land.acquisitionPrice).toBe(150_000_000);
  });

  it("H5 개산공제는 파트별 3% — 토지분·건물분 각각 (§163⑥1호·2호)", () => {
    // 환산 파트만 개산공제 대상(실가 파트는 실제 필요경비).
    const r = calcSplitGain(
      housingSeparateAcq({ standardPriceAtAcquisition: undefined, isUnregistered: false }),
    );
    // 건물분 개산공제 = 취득시 건물 기준시가 120,000,000 × 3% = 3,600,000
    expect(r?.building.appraisalDeduction).toBe(3_600_000);
  });
});

describe("회귀 가드 — 동시 취득 주택은 라목 역산 유지", () => {
  it("취득일이 같으면 결합 총액에서 역산한다 (라목 결합 공시가 실재)", () => {
    const r = calcSplitGain(
      housingSeparateAcq({
        acquisitionDate: new Date("2025-01-08"),
        landAcquisitionDate: new Date("2025-01-08"),
        isSeparateAcquisition: false,
        standardPriceAtAcquisition: 500_000_000, // 라목 결합 공시
        buildingStandardPriceAtAcquisition: undefined,
      }),
    );
    // 건물분 = 500,000,000 − 200,000,000(토지분) = 300,000,000
    // 환산 = 250,000,000 × (300,000,000 ÷ 100,000,000) = 750,000,000
    //
    // 🔴 **역산 여부를 가르는 대비는 그대로다** — 파트 독립(H2·H3)은 입력한 나목 1.2억을 분자로
    //    써 3억을, 역산 경로는 결합 총액에서 뽑은 3억을 써 7.5억을 낸다(2.5배 차이).
    expect(r?.building.acquisitionPrice).toBe(750_000_000);
  });
});
