/**
 * @vitest-environment jsdom
 *
 * anchor — 등록 말소 후 종점 화면 문구 (M-10 · rental-97-5-deregistration-end.plan.md Q-1 a)
 *
 * 말소 뒤에도 같은 세입자에게 임대한 사람이 「양도일까지 계속 임대」를 고르면 말소 이후까지 임대기간으로 셌다(D-1).
 * 입력 필드는 그대로(`rentalContinuesToTransfer`·`rentalEndDate`) — 질문·선택지·칸 라벨이 등록 말소를 묻는지만 고정한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { Rental973InputForm } from "@/components/calc/transfer/rental/Rental973InputForm";
import { Rental975InputForm } from "@/components/calc/transfer/rental/Rental975InputForm";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";

afterEach(cleanup);

type F975 = Parameters<typeof Rental975InputForm>[0]["value"];
type F973 = Parameters<typeof Rental973InputForm>[0]["value"];
const ENDED = { rentalContinuesToTransfer: false };

const render975 = (over: Partial<F975> = {}) =>
  render(
    <Rental975InputForm
      value={{ ...(getReductionDefault("rental_97_5") as F975), ...over }}
      onChange={() => {}}
      acquisitionDate="2016-02-15"
      transferDate="2030-10-15"
      assetContractDate=""
    />,
  );
const render973 = (over: Partial<F973> = {}) =>
  render(
    <Rental973InputForm
      value={{ ...(getReductionDefault("rental_97_3") as F973), ...over }}
      onChange={() => {}}
      acquisitionDate="2016-02-15"
      transferDate="2030-10-15"
      assetContractDate=""
    />,
  );

describe("§97의5 폼", () => {
  it("질문·선택지가 등록 말소를 묻는다", () => {
    render975();
    expect(screen.getByText("장기일반민간임대주택 등록을 유지한 채 양도일까지 임대했습니까?")).toBeTruthy();
    expect(screen.getByText("양도일까지 등록·임대 유지")).toBeTruthy();
    expect(screen.getByText("양도 전에 임대 종료 또는 등록 말소")).toBeTruthy();
    expect(screen.queryByText("임대가 양도일까지 계속되었습니까?")).toBeNull();
    expect(screen.getByTestId("rental-dereg-hint").textContent).toContain("조특령 §97의5① 「그 등록한 기간 동안」");
  });

  it("종료를 고르면 칸 라벨은 「임대 종료일 또는 등록 말소일」 · 1253 안내", () => {
    render975(ENDED as Partial<F975>);
    expect(screen.getByText("임대 종료일 또는 등록 말소일 (먼저 온 날)")).toBeTruthy();
    expect(screen.getByText(/이 날 뒤에 맺은 계약의 임대료 증액은 따지지 않습니다 \(서면-2017-법령해석재산-1253\)/)).toBeTruthy();
  });
});

describe("§97의3 폼 — 같은 칸 · 조문만 다르다", () => {
  it("질문 + 령 §97의3② 인용", () => {
    render973();
    expect(screen.getByText("장기일반민간임대주택 등록을 유지한 채 양도일까지 임대했습니까?")).toBeTruthy();
    expect(screen.getByTestId("rental-dereg-hint").textContent).toContain("조특령 §97의3② 「그 등록 기간 동안」");
  });

  it("종료를 고르면 같은 칸 라벨 · 1253 유추는 확인 필요로 표시", () => {
    render973(ENDED as Partial<F973>);
    expect(screen.getByText("임대 종료일 또는 등록 말소일 (먼저 온 날)")).toBeTruthy();
    expect(screen.getByText(/§97의3 정면 해석례는 없어 확인이 필요합니다/)).toBeTruthy();
  });
});
