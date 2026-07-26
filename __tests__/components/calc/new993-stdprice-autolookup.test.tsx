/**
 * §99의3 신축주택 감면 — 3시점 기준시가 Vworld 자동조회 anchor.
 * 계획서: docs/02-design/features/new993-standard-price-vworld-autolookup.plan.md
 *
 * 취득시/5년시점/양도시 기준시가를 양도물건(asset) 주소 기준 HousingStdPriceLookupField로 조회.
 * 조회 성공 시 해당 필드 총액 세팅 + 전용면적 자동채움 + 동/호 쿼리 포함.
 */
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { New993InputForm } from "@/components/calc/transfer/New993InputForm";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-store";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

type New993 = Extract<AssetReductionForm, { type: "new_99_3" }>;

function makeValue(over: Partial<New993> = {}): New993 {
  return {
    type: "new_99_3",
    standardPriceAt5Years: "",
    standardPriceAtAcquisition993: "",
    standardPriceAtTransfer993: "",
    exclusiveAreaSqm993: "",
    region993: "outside_speculation",
    acquisitionType993: "from_builder",
    isResident993: true,
    isHousingConstructionBusiness993: false,
    ...over,
  };
}

describe("§99의3 3시점 기준시가 자동조회", () => {
  it("취득시 조회 성공 → 취득시 기준시가 총액 + 전용면적 자동채움 + 동/호 쿼리 포함", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ price: 300_000_000, priceType: "apart_housing_price", exclusiveArea: 84.96 }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const onUpdate = vi.fn();

    render(
      <New993InputForm
        value={makeValue()}
        onUpdate={onUpdate}
        acquisitionDate="2003-11-28"
        transferDate="2026-02-16"
        jibun="경기도 수원시 영통구 영통동 957-6"
        dong="324"
        ho="1004"
      />,
    );

    fireEvent.click(screen.getByTestId("new993-stdprice-acq-lookup-btn"));

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith("standardPriceAtAcquisition993", "300000000"),
    );
    // 전용면적 자동채움
    expect(onUpdate).toHaveBeenCalledWith("exclusiveAreaSqm993", "84.96");
    // 동/호 쿼리 포함
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("dong=324");
    expect(url).toContain("ho=1004");
  });

  it("5년 시점 조회 → standardPriceAt5Years 세팅 (referenceDate = 취득일+5년)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ price: 350_000_000, priceType: "apart_housing_price" }),
    }) as unknown as typeof fetch;
    const onUpdate = vi.fn();

    render(
      <New993InputForm
        value={makeValue()}
        onUpdate={onUpdate}
        acquisitionDate="2003-11-28"
        transferDate="2026-02-16"
        jibun="경기도 수원시 영통구 영통동 957-6"
        dong="324"
        ho="1004"
      />,
    );

    // 취득일 2003 + 5년 = 2008 시점 → 연도 드롭다운에 2008 노출 확인
    expect(screen.getByTestId("new993-stdprice-5y-year-select").textContent).toContain("2008");

    fireEvent.click(screen.getByTestId("new993-stdprice-5y-lookup-btn"));
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith("standardPriceAt5Years", "350000000"),
    );
  });

  it("지번 미입력 시 조회 버튼 비활성 — 수동 입력 fallback", () => {
    render(
      <New993InputForm value={makeValue()} onUpdate={vi.fn()} acquisitionDate="2003-11-28" />,
    );
    expect(screen.getByTestId("new993-stdprice-acq-lookup-btn")).toBeDisabled();
    expect(screen.getByTestId("new993-area-lookup-btn")).toBeDisabled();
  });

  it("전용면적 전용 조회 → prvuseAr 채움 + 동/호 쿼리 포함", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ price: 300_000_000, priceType: "apart_housing_price", exclusiveArea: 84.96 }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const onUpdate = vi.fn();

    render(
      <New993InputForm
        value={makeValue()}
        onUpdate={onUpdate}
        acquisitionDate="2003-11-28"
        transferDate="2026-02-16"
        jibun="경기도 수원시 영통구 영통동 957-6"
        dong="324"
        ho="1004"
      />,
    );

    fireEvent.click(screen.getByTestId("new993-area-lookup-btn"));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith("exclusiveAreaSqm993", "84.96"));
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("dong=324");
    expect(url).toContain("ho=1004");
  });

  it("전용면적 조회 실패(면적 없음) → 안내 + onUpdate 미호출", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ price: 200_000_000, priceType: "indvd_housing_price" }), // exclusiveArea 없음
    }) as unknown as typeof fetch;
    const onUpdate = vi.fn();
    render(
      <New993InputForm
        value={makeValue()}
        onUpdate={onUpdate}
        acquisitionDate="2003-11-28"
        jibun="경기도 어딘가 100"
      />,
    );
    fireEvent.click(screen.getByTestId("new993-area-lookup-btn"));
    await waitFor(() => expect(screen.getByTestId("new993-area-status")).toBeTruthy());
    expect(onUpdate).not.toHaveBeenCalledWith("exclusiveAreaSqm993", expect.anything());
  });
});
