/**
 * §99의4 입력 폼 — 가액 한도 hint가 양도일·취득일로 갈린다 (NH-05 PR-2a)
 * 같은 한도 함수(`resolveNew994StdPriceLimit`)를 useMemo로 부른다. store 기록 없음.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { New994InputForm } from "@/components/calc/transfer/New994InputForm";

afterEach(cleanup);

const view = (acq: string, transfer: string | undefined, hanok = false) =>
  render(
    <New994InputForm
      value={{ type: "new_99_4_rural", ruralHouseAcquisitionDate: acq, ruralHouseStdPrice: "", isRegisteredHanok: hanok } as never}
      onChange={() => {}}
      transferDate={transfer}
    />,
  );

describe("§99의4 가액 한도 hint", () => {
  it("2023.1.1. 이후 양도: 3억 이하", () => {
    view("2015-03-01", "2024-06-01");
    expect(screen.getByText(/3억 이하/)).toBeTruthy();
  });
  it("2023.1.1. 전 양도(2009.1.1. 이후 취득): 2억 이하", () => {
    view("2015-03-01", "2022-06-01");
    expect(screen.getByText(/2억 이하/)).toBeTruthy();
    expect(screen.queryByText(/3억 이하/)).toBeNull();
  });
  it("2008년 취득 × 2019 양도: 1억5천만원 이하 / 2005 취득: 7천만원 이하", () => {
    view("2008-06-01", "2019-06-01");
    expect(screen.getByText(/1억5천만원 이하/)).toBeTruthy();
    cleanup();
    view("2005-06-01", "2019-06-01");
    expect(screen.getByText(/7천만원 이하/)).toBeTruthy();
  });
  it("등록 한옥 2014.1.1. 이후 취득: 4억 이하 (등록 한옥)", () => {
    view("2015-03-01", "2022-06-01", true);
    expect(screen.getByText(/4억 이하 \(등록 한옥\)/)).toBeTruthy();
  });
  it("양도일 미입력: 양도일을 먼저 입력하라는 안내", () => {
    view("2015-03-01", undefined);
    expect(screen.getByText(/양도일을 먼저 입력하세요/)).toBeTruthy();
  });
});
