/**
 * anchor: 분할 모드에서도 대주주 판정 기준(임계) 미리보기가 뜬다 (2026-10-07).
 *
 * 종전에는 폼-전역 양도일(분할 모드에서는 빈 값)이 없으면 미리보기를 끄는 가드 때문에 분할 모드에서
 * 늘 사라졌다. 이제 가장 이른 매도 lot 일자(엔진 양도일)로 임계 행을 고른다.
 */
import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MajorShareholderBlock } from "@/components/calc/stock-transfer/MajorShareholderBlock";
import { reportedSplitForm } from "../../calc/stock-split-lots-fixture";

afterEach(cleanup);

describe("[SMT] 분할 모드 대주주 임계 미리보기", () => {
  it("SMT-1: 매도 lot 일자가 있으면 미리보기를 띄운다", () => {
    render(<MajorShareholderBlock form={reportedSplitForm()} onChange={vi.fn()} />);
    expect(screen.queryByText(/대주주 판정 기준/)).not.toBeNull();
  });
  it("SMT-2: 매도 lot 일자가 없으면 띄우지 않는다(추정 금지)", () => {
    render(<MajorShareholderBlock form={reportedSplitForm({ transferLots: [] })} onChange={vi.fn()} />);
    expect(screen.queryByText(/대주주 판정 기준/)).toBeNull();
  });
});
