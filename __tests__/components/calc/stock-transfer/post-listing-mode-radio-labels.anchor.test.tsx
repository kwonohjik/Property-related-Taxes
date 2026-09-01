/**
 * @vitest-environment jsdom
 *
 * 「환산 입력 방식」 라디오 — **처음 쓰는 납세자가 고를 수 있는 말로 적는다**.
 *
 * 사용자 지적(2026-09-02): 「완전 재현 (PDF 3개 화면)」·「간이 (결과값 4개 직접 입력)」·
 * 「부분 재현 (상장연도만 상세)」은 **개발 과정의 내부 용어**다. 처음 쓰는 사용자는
 * 「그 PDF가 무엇인지 자체를 모른다」. 아래 설명(description)은 오히려 선택을 방해했다.
 *
 * ⇒ 사용자가 실제로 판단할 수 있는 축 = **「내 손에 재무제표가 있나」** 하나로 바꾼다.
 *
 *   full          재무제표로 계산        (기본 선택 — DM-1)
 *   simple        평가액 직접 입력
 *   listing_only  상장연도만 재무제표
 *
 * 표시: `layout="inline"` — 한 행 나열 + description 미렌더가 같은 prop에서 나온다.
 *
 * 🔑 순서·문구·inline 셋 다 사용자 결정이므로 앵커로 동결한다.
 */

import "fake-indexeddb/auto";
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PostListingValuationCard } from "@/components/calc/stock-transfer/PostListingValuationCard";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-form";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

afterEach(cleanup);

function renderCard(patch: Partial<StockTransferFormData> = {}) {
  const form = {
    ...createInitialStockFormData(),
    marketType: "kosdaq",
    acquiredBeforeListing: true,
    ...patch,
  } as StockTransferFormData;
  render(<PostListingValuationCard form={form} onChange={vi.fn()} />);
}

function modeGroup() {
  const el = document.querySelector('[data-slot="radio-card-group"][data-layout="inline"]');
  expect(el).toBeTruthy();
  return el as HTMLElement;
}

describe("MR — 환산 입력 방식 라디오", () => {
  it("MR-1 세 선택지가 «가진 자료» 기준 문구로, full → simple → listing_only 순서로 놓인다", () => {
    renderCard();
    const labels = Array.from(
      modeGroup().querySelectorAll('input[name="unlistedDetailMode"]')
    ).map((input) => (input.closest("label") as HTMLElement).textContent?.trim());

    expect(labels).toEqual(["재무제표로 계산", "평가액 직접 입력", "상장연도만 재무제표"]);
  });

  it("MR-2 값의 순서도 full → simple → listing_only", () => {
    renderCard();
    const values = Array.from(
      modeGroup().querySelectorAll<HTMLInputElement>('input[name="unlistedDetailMode"]')
    ).map((i) => i.value);
    expect(values).toEqual(["full", "simple", "listing_only"]);
  });

  it("MR-3 한 행 배치 — inline 레이아웃이라 보조 설명이 렌더되지 않는다", () => {
    renderCard();
    // 종전 description 문구가 화면에서 사라졌는지 직접 본다.
    for (const gone of [
      "외부에서 보충적 평가를 마친 사용자용",
      "상장연도 결산서만 보유한 경우",
      "PDF 사례 그대로",
    ]) {
      expect(screen.queryByText(new RegExp(gone))).toBeNull();
    }
  });

  it("MR-4 내부 용어(PDF·재현·결과값)가 라디오 문구에 남아 있지 않다", () => {
    renderCard();
    const text = modeGroup().textContent ?? "";
    for (const banned of ["PDF", "재현", "결과값", "간이"]) {
      expect(text.includes(banned)).toBe(false);
    }
  });

  it("MR-5 초기 진입 시 «재무제표로 계산»이 선택돼 있다", () => {
    renderCard();
    const checked = modeGroup().querySelector<HTMLInputElement>(
      'input[name="unlistedDetailMode"]:checked'
    );
    expect(checked?.value).toBe("full");
  });
});
