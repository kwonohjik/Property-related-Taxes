/**
 * ST-1~ST-7 — 순손익·순자산 계산서 «행 기반 표» 구조 anchor (ST-1~5는 Pre-Do 선작성)
 *
 * 계획서: docs/00-pm/post-listing-statement-table-layout.plan.md §7.3
 *
 * ⚠️ **이 파일은 구현 «전»에 작성됐다.** 작성 시점에 ST-1·2·4·5는 **실패해야 정상**이다 —
 *    실패하지 않으면 그 단언은 새 구조를 요구하지 않는 것이므로 구별력이 없다.
 *    [[feedback_pre_anchor_verification]] · [[feedback_mutation_zero_discrimination_is_not_proof]]
 *
 * 🔑 **ST-3만 예외 — «보존» anchor다.** 작성 시점에 이미 통과한다(현행 `hint` prop에 문구가 있다).
 *    지키려는 것은 「표로 옮기면서 이 문구를 흘리지 않는다」이므로, 전환 전후 **둘 다 초록**이
 *    정상이다. 이 문구가 X-1(행 23 라벨 현행 유지) 결정의 실체다 — 계획서 §4.3.1.
 *
 * ST-6·7은 Phase F(사업연도 필드)와 함께 추가됐다 — 신규 필드에 안전망이 없으면 안 된다.
 *
 * 대응 mutation probe: ST-1→P-6(실측 ST-1만 실패) · ST-3→P-5(실측 ST-3만 실패) — 계획서 §7.2
 */

import "fake-indexeddb/auto";
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { PostListingNetIncomeStatement } from "@/components/calc/stock-transfer/PostListingNetIncomeStatement";
import { PostListingNetAssetStatement } from "@/components/calc/stock-transfer/PostListingNetAssetStatement";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-form";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

afterEach(cleanup);

function form(patch: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return { ...createInitialStockFormData(), ...patch } as StockTransferFormData;
}

describe("ST — 순손익·순자산 계산서는 «행 기반 표»다", () => {
  it("ST-1: 순손익 표에 (A)·(B) 소계 행이 렌더되고 «엔진 echo 값»을 표시한다", () => {
    render(
      <PostListingNetIncomeStatement
        form={form({
          niAddRow1Listing: "100000000",
          niAddRow2Listing: "5000000",
          niSubRow5Listing: "3000000",
          niSubRow14Listing: "2000000",
        })}
        onChange={vi.fn()}
        mode="full"
      />,
    );
    // 이미지 7 원본 서식의 소계 행 — 전환 전에는 표 밖 요약 박스에 A−B 결과만 있었다
    expect(screen.getByText(/\(A\)\s*가산할금액 합계/)).toBeInTheDocument();
    expect(screen.getByText(/\(B\)\s*공제할금액 합계/)).toBeInTheDocument();

    // 🔑 **값까지 본다.** 행 존재만 단언하면 엔진 echo(`addTotalA`/`subTotalB`)가 0으로
    //    고정돼도 통과한다 — probe P-6이 그것을 노린다. 계획서 §7.2.
    expect(screen.getByTestId("ni-A-calc-Listing").textContent).toContain("105,000,000");
    expect(screen.getByTestId("ni-B-calc-Listing").textContent).toContain("5,000,000");
    expect(screen.getByTestId("ni-17-calc-Listing").textContent).toContain("100,000,000");
  });

  it("ST-2: 행 라벨은 표 전체에 정확히 «1회»만 나온다 (라벨 열 공유)", () => {
    render(<PostListingNetIncomeStatement form={form()} onChange={vi.fn()} mode="full" />);
    // 계수 단언 — 「없다」가 아니라 「1회」다. 열마다 반복하면(= 전환 전 구조) 반드시 실패한다.
    //
    // ⚠️ **축은 「라벨」이다** — 행 번호("1.")는 `font-mono tabular-nums`로 세로 정렬해야 해서
    //    별도 `<span>`이고, 그래서 "1. 각 사업연도 소득금액"은 **한 텍스트 노드가 아니다**.
    //    번호까지 포함해 단언하면 구조가 아니라 마크업 형태를 고정하게 된다.
    //    이 anchor가 지키는 것은 **라벨 중복 제거**이지 번호 표기 방식이 아니다.
    expect(screen.getAllByText("각 사업연도 소득금액")).toHaveLength(1);
    expect(screen.getAllByText("지방소득세 총결정세액")).toHaveLength(1);
  });

  it("ST-3 [보존]: 행 23 보조 줄의 «시행규칙 정액» 문구가 살아 있다", () => {
    render(<PostListingNetIncomeStatement form={form()} onChange={vi.fn()} mode="full" />);
    // X-1 결정의 실체 — 이미지 7의 「기획재정부령이 고시하는 이자율」을 쓰지 않는 근거.
    // 표 전환으로 FieldCard의 hint 슬롯이 사라져도 description 슬롯으로 보존돼야 한다.
    expect(screen.getAllByText(/고시값 아닌 시행규칙 정액/).length).toBeGreaterThan(0);
  });

  it("ST-4: 순자산 표에 (가)·(나) 소계 행이 렌더된다", () => {
    render(<PostListingNetAssetStatement form={form()} onChange={vi.fn()} mode="full" />);
    expect(screen.getByText(/\(가\)\s*자산총계/)).toBeInTheDocument();
    expect(screen.getByText(/\(나\)\s*부채총계/)).toBeInTheDocument();
  });

  it("ST-5: 열이 1개면 값 열도 1개만 렌더된다 (cols 동적 — 계획서 §4.2.2)", () => {
    render(<PostListingNetIncomeStatement form={form()} onChange={vi.fn()} mode="listing_only" />);
    const table = screen.getByRole("table");
    // 「구 분」 라벨 열 + 값 열 1개 = columnheader 2개
    expect(within(table).getAllByRole("columnheader")).toHaveLength(2);
  });

  it("ST-6: 열 헤더의 사업연도가 폼 값을 읽고 쓴다 (C-3 — 계획서 §5)", () => {
    const onChange = vi.fn();
    render(
      <PostListingNetIncomeStatement
        form={form({ fiscalYearListing: "2008", fiscalYearAcq: "2003" })}
        onChange={onChange}
        mode="full"
      />,
    );
    // 읽기 — 이미지 7 원본 화면의 `2008` / `2003`
    expect(screen.getByTestId("ni-fy-Listing")).toHaveValue("2008");
    expect(screen.getByTestId("ni-fy-Acq")).toHaveValue("2003");

    // 쓰기 — 숫자만 남기고 store에 그대로 간다(표시 전용 필드, 엔진 미경유)
    fireEvent.change(screen.getByTestId("ni-fy-Listing"), { target: { value: "2009a" } });
    expect(onChange).toHaveBeenCalledWith({ fiscalYearListing: "2009" });
  });

  it("ST-8: 표 셀에는 placeholder 문구가 없다 (빈 칸은 비어 있다)", () => {
    // 🔴 **48칸이 같은 문구를 반복하면 값이 든 칸을 눈으로 찾을 수 없다** (2026-09-11 실측).
    //    `CurrencyInput`·`DecimalInput`의 기본 placeholder(「금액 입력」·「숫자 입력」)는 카드 한 장에
    //    필드 하나일 때의 안내다. 표에서는 열 헤더와 행 라벨이 이미 의미를 말한다.
    //    원본 서식(이미지 7)도 빈 칸은 비어 있다.
    const { container } = render(
      <PostListingNetIncomeStatement form={form()} onChange={vi.fn()} mode="full" />,
    );
    const table = screen.getByRole("table");
    const withPlaceholder = Array.from(table.querySelectorAll("input")).filter(
      (el) => (el.getAttribute("placeholder") ?? "") !== "",
    );
    expect(
      withPlaceholder.map((el) => el.getAttribute("placeholder")),
      "표 셀 입력칸에 placeholder가 남아 있다",
    ).toEqual([]);
    // 문구 자체가 화면 어디에도 없어야 한다 (positive twin: ST-1~7이 「무엇이 보이는가」를 지킨다)
    expect(container.textContent).not.toContain("금액 입력");
    expect(container.textContent).not.toContain("숫자 입력");
  });

  it("ST-7: 순손익·순자산이 «같은» 사업연도 필드를 공유한다 (계획서 §5.1)", () => {
    // 🔑 ni/na로 쪼개면 두 계산서의 연도가 조용히 갈린다. 한 벌을 공유하는지 본다.
    const f = form({ fiscalYearListing: "2008" });
    const { unmount } = render(
      <PostListingNetIncomeStatement form={f} onChange={vi.fn()} mode="listing_only" />,
    );
    expect(screen.getByTestId("ni-fy-Listing")).toHaveValue("2008");
    unmount();

    render(<PostListingNetAssetStatement form={f} onChange={vi.fn()} mode="listing_only" />);
    expect(screen.getByTestId("na-fy-Listing")).toHaveValue("2008");
  });
});
