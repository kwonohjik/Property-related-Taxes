/**
 * @vitest-environment jsdom
 *
 * Step2 「② 취득가액 — 실가」 **입력 방식** 축: 순서와 기본 선택.
 *
 * 2026-09-17 제보 — 양도가액 축과 배치가 어긋나 있었다. 양도가액은
 * 「합계 직접 입력 · 1주당 단가」 순에 **합계가 기본**인데, 취득가액만
 * 「1주당 단가 · 합계 직접 입력 · 일자별 다건」 순에 **단가가 기본**이었다.
 * ⇒ 두 축을 같은 순서·같은 기본값으로 맞춘다.
 *
 * 🔑 `RadioCardGroup`을 직접 렌더하지 않는다 — Step2를 통째로 렌더해야
 *    「실제 화면의 순서」를 본다 ([[feedback_anchor_observes_wrong_stage]]).
 *
 * ⚠️ 기본값을 바꾸면 **구 이력**이 위험해진다 — `acquisitionActualInputMode` 키가
 *    없던 시절의 record 는 1주당 단가만 들고 있다. normalize 가 그것을 "total" 로
 *    떨어뜨리면 저장해 둔 단가가 빈 「취득가액 합계」로 뒤바뀐다. AD-5/AD-6 이 그 축이다.
 */

import "fake-indexeddb/auto";
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step2 } from "@/app/calc/stock-transfer-tax/steps/Step2";
import {
  createInitialStockFormData,
  normalizeStockFormData,
} from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

afterEach(cleanup);

function renderStep2(o: Partial<StockTransferFormData> = {}) {
  const form = {
    ...createInitialStockFormData(),
    marketType: "kospi",
    securityCode: "005930",
    acquisitionDate: "2015-04-20",
    transferDate: "2025-06-10",
    shareCount: "1000",
    ...o,
  } as StockTransferFormData;
  render(<Step2 form={form} onChange={() => {}} />);
}

function acqInputModeRadios(): HTMLInputElement[] {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>('input[name="acquisitionActualInputMode"]')
  );
}

describe("AD — 취득가액 실가 입력 방식은 양도가액 축과 같은 배치다", () => {
  it("AD-1 🔴 화면 순서가 [합계 직접 입력, 1주당 단가, 일자별 다건] 이다", () => {
    renderStep2();
    expect(acqInputModeRadios().map((i) => i.value)).toEqual(["total", "per_share", "lots"]);
  });

  it("AD-2 🔴 양도가액 축과 **같은 순서**다 (앞 두 칸)", () => {
    renderStep2();
    const transfer = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[name="transferActualInputMode"]')
    ).map((i) => i.value);
    expect(transfer).toEqual(["total", "per_share"]);
    expect(acqInputModeRadios().map((i) => i.value).slice(0, 2)).toEqual(transfer);
  });

  it("AD-3 🔴 신규 폼의 기본 선택은 「합계 직접 입력」이고 합계 입력칸이 열려 있다", () => {
    expect(createInitialStockFormData().acquisitionActualInputMode).toBe("total");
    renderStep2();
    const checked = acqInputModeRadios().find((i) => i.checked);
    expect(checked?.value).toBe("total");
    expect(screen.getByLabelText(/취득가액 합계/)).toBeTruthy();
    expect(screen.queryByLabelText(/1주당 취득가액/)).toBeNull();
  });

  it("AD-4 🔴 normalize 는 값이 없는 record 를 「합계 직접 입력」으로 채운다", () => {
    expect(normalizeStockFormData({}).acquisitionActualInputMode).toBe("total");
  });

  it("AD-5 🔴 구 이력 보호 — 모드 키가 없고 1주당 단가만 있으면 per_share 로 남긴다", () => {
    const legacy = normalizeStockFormData({
      marketType: "kospi",
      acquisitionMode: "actual",
      perShareAcquisitionPrice: "5,000",
    });
    expect(legacy.acquisitionActualInputMode).toBe("per_share");
    expect(legacy.perShareAcquisitionPrice).toBe("5,000");
  });

  it("AD-6 저장된 모드가 있으면 그대로 존중한다 (구 이력 규칙이 덮지 않는다)", () => {
    expect(
      normalizeStockFormData({
        acquisitionActualInputMode: "lots",
        perShareAcquisitionPrice: "5,000",
      }).acquisitionActualInputMode
    ).toBe("lots");
    expect(
      normalizeStockFormData({
        acquisitionActualInputMode: "total",
        acquisitionTotalPrice: "21,000,000",
      }).acquisitionActualInputMode
    ).toBe("total");
  });
});
