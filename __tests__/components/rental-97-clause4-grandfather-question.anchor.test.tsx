/**
 * @vitest-environment jsdom
 *
 * anchor — 가액요건 부칙 §2② 질문의 표시 조건 (PR-B · rental-97-5-textbook-gaps.plan.md §3.3)
 *
 * 엔진과 같은 함수(`isClause4Applicable`)로 가른다 — 취득일·매매계약일만으로 이미 예외이거나 양도가 시행일(2018-10-23) 전이면 묻지 않는다.
 * §97의3·§97의5 폼 양쪽에 붙는다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { Clause4GrandfatherQuestion } from "@/components/calc/transfer/rental/Clause4GrandfatherQuestion";
import { Rental973InputForm } from "@/components/calc/transfer/rental/Rental973InputForm";
import { Rental975InputForm } from "@/components/calc/transfer/rental/Rental975InputForm";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";

afterEach(cleanup);

const TITLE = "2018.9.13. 이전 취득·계약";
const q = (acq: string, transfer: string, contract = "") =>
  render(
    <Clause4GrandfatherQuestion
      dataField="reduction.rental_97_5.clause4Grandfather"
      value=""
      onChange={() => {}}
      acquisitionDate={acq}
      transferDate={transfer}
      assetContractDate={contract}
    />,
  );

describe("표시 조건", () => {
  it("취득 2018-11-01 · 양도 2029-12-01 · 계약일 없음 → 묻는다", () => {
    q("2018-11-01", "2029-12-01");
    expect(screen.getByText(TITLE)).toBeTruthy();
    expect(screen.getByText("예 — 2018.9.13. 이전 취득·계약")).toBeTruthy();
  });
  it("취득 2018-09-13(②1호) → 묻지 않는다", () => {
    q("2018-09-13", "2029-12-01");
    expect(screen.queryByText(TITLE)).toBeNull();
  });
  it("매매계약일 2018-09-01(②2호) → 묻지 않는다", () => {
    q("2018-11-01", "2029-12-01", "2018-09-01");
    expect(screen.queryByText(TITLE)).toBeNull();
  });
  it("양도 2018-10-22(부칙 §2① 시행 전) → 묻지 않는다", () => {
    q("2018-10-01", "2018-10-22");
    expect(screen.queryByText(TITLE)).toBeNull();
  });
  it("취득일·양도일 미입력 → 묻지 않는다", () => {
    q("", "2029-12-01");
    expect(screen.queryByText(TITLE)).toBeNull();
    cleanup();
    q("2018-11-01", "");
    expect(screen.queryByText(TITLE)).toBeNull();
  });
});

describe("§97의3·§97의5 폼에 붙어 있다 (⑤)", () => {
  it("§97의5 폼", () => {
    render(
      <Rental975InputForm
        value={getReductionDefault("rental_97_5") as Parameters<typeof Rental975InputForm>[0]["value"]}
        onChange={() => {}}
        acquisitionDate="2018-11-01"
        transferDate="2029-12-01"
        assetContractDate=""
      />,
    );
    expect(screen.getByText(TITLE)).toBeTruthy();
  });
  it("§97의3 폼", () => {
    render(
      <Rental973InputForm
        value={getReductionDefault("rental_97_3") as Parameters<typeof Rental973InputForm>[0]["value"]}
        onChange={() => {}}
        acquisitionDate="2018-11-01"
        transferDate="2029-12-01"
        assetContractDate=""
      />,
    );
    expect(screen.getByText(TITLE)).toBeTruthy();
  });
});
