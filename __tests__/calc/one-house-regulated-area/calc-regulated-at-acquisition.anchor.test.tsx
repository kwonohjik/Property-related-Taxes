/**
 * @vitest-environment jsdom
 *
 * G1-13(계산기 쪽) — 양도세 계산기 §155⑳ 카드(⑤)와 ⑧(`validateAssetEntry`)이 주소(법정동코드)가 있으면 엔진과 같은
 * 「취득 당시 조정대상지역」(주소 판정)을 읽는다. 종전에는 ⑤가 prop을 받지 않아 항상 「조정대상지역 취득이 아니므로」로
 * 보였고, ⑧은 숨은 저장값을 읽어 엔진(코드 우선)과 반대로 막거나 통과시켰다.
 *
 * 근거: 「소득세법 시행령」 제154조제1항 괄호 · 제10항(2019.2.12. 전 취득 분기). 읽기 쪽 단일 진실만 고정한다 —
 * 주소가 있을 때 계산기 토글 정책(G7-6)은 다루지 않는다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { RENTAL_HOUSING_EXCEPTION_DEFAULTS } from "@/lib/stores/calc-wizard-asset-factory";
import { validateAssetEntry } from "@/lib/calc/transfer-tax-validate-asset";
import { AssetSectionExtras } from "@/components/calc/transfer/asset-sections/AssetSectionExtras";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";

afterEach(cleanup);

const GANGNAM = "1168010100"; // 2018-01-01 취득 당시 조정대상지역
const INCHEON_SEO = "2826010100"; // 2018-01-01 취득 당시 조정대상지역 아님
const REGULATED_TEXT = "이 주택은 조정대상지역 취득입니다.";
const NOT_REGULATED_TEXT = "이 주택은 조정대상지역 취득이 아니므로 거주요건이 없습니다.";
const BLOCK = "조정대상지역 취득 주택은 거주기간 2년(24개월) 이상이 필요합니다";

function form(regionCode: string, stored: boolean): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = "2025-06-02";
  f.isOneHousehold = true;
  f.contractTotalPrice = "900000000";
  f.wasRegulatedAtAcquisition = stored;
  Object.assign(f.assets[0], {
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2018-01-01",
    actualSalePrice: "900000000",
    fixedAcquisitionPrice: "500000000",
    addressJibun: "테스트 주소 1",
    regionCode,
    residenceInputMode: "direct",
    residencePeriods: [],
    residencePeriodMonthsAsset: "0",
    rentalHousingException: {
      ...RENTAL_HOUSING_EXCEPTION_DEFAULTS,
      applyException: true,
      scenario: "B",
      rentalUnits: [],
      wasRegisteredRentalOrChildcare: true,
      priorResidenceTransferDate: "2023-01-10",
      standardPriceAtAcquisitionForPhrp: "150,000,000",
      standardPriceAtPriorTransfer: "250,000,000",
      standardPriceAtTransferForPhrp: "300,000,000",
    },
  });
  return f;
}
const gate = (f: TransferFormData) => validateAssetEntry(f.assets[0], 0, f) ?? "";
function card(f: TransferFormData) {
  render(
    <AssetSectionExtras
      asset={f.assets[0]}
      assetIndex={0}
      transferDate={f.transferDate}
      onChange={() => {}}
      wasRegulatedAtAcquisition={f.wasRegulatedAtAcquisition}
      formRegionCode={f.regionCode}
    />,
  );
  return document.body.textContent ?? "";
}

describe("G1-13 계산기 — ⑤ 카드·⑧은 주소가 있으면 엔진과 같은 취득시 조정대상지역을 읽는다", () => {
  it("정방향 — 강남 코드 + 저장값 false: ⑤ 「조정대상지역 취득」 · ⑧ 차단", () => {
    const f = form(GANGNAM, false);
    const t = card(f);
    expect(t).toContain(REGULATED_TEXT);
    expect(t).not.toContain(NOT_REGULATED_TEXT);
    expect(gate(f)).toContain(BLOCK);
  });
  it("역방향 — 인천 서구 코드 + 저장값 true: ⑤ 「조정대상지역 취득이 아니므로」 · ⑧ 통과", () => {
    const f = form(INCHEON_SEO, true);
    const t = card(f);
    expect(t).toContain(NOT_REGULATED_TEXT);
    expect(t).not.toContain(REGULATED_TEXT);
    expect(gate(f)).not.toContain(BLOCK);
  });
  it("긍정 짝 — 주소 없음: 저장값을 따른다(true → 취득·⑧ 차단 / false → 아님·통과)", () => {
    const on = form("", true);
    expect(card(on)).toContain(REGULATED_TEXT);
    expect(gate(on)).toContain(BLOCK);
    cleanup();
    const off = form("", false);
    expect(card(off)).toContain(NOT_REGULATED_TEXT);
    expect(gate(off)).not.toContain(BLOCK);
  });
  it("긍정 짝 — 강남 코드 + 저장값 true: 같으면 같다(취득·⑧ 차단)", () => {
    const f = form(GANGNAM, true);
    expect(card(f)).toContain(REGULATED_TEXT);
    expect(gate(f)).toContain(BLOCK);
  });
});
