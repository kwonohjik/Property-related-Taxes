/**
 * anchor: 호 검색창이 **검색어를 입력해도 사라지지 않는다** (UI 리뷰 보통 #34).
 *
 * 노출 조건이 원본 호 수(`res.units`)가 아니라 **검색 결과 수**(`filtered`)였다. 호가 200건을
 * 넘는 집합건물에서 검색창이 뜨지만, 한 글자만 입력해 결과가 200건 이하로 줄면 그 즉시 입력
 * 요소가 **언마운트**된다 — 포커스가 날아가고 `search` 상태는 그대로 남아 목록은 계속 필터된
 * 채였다. 오타 한 글자를 지울 수도, 고칠 수도 없다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { CommercialStdPriceLookupModal } from "@/components/calc/transfer/CommercialStdPriceLookupModal";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** 250호 — `SEARCH_THRESHOLD`(200)를 넘겨 검색창이 뜨는 최소 규모. */
const NOTICE_DATE = "2024-01-01";

function units(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    key: `u${i}`,
    buildingName: i === 0 ? "가나빌딩" : `일반빌딩${i}`,
    dong: "1",
    floorClass: "지상" as const,
    floor: "1",
    ho: String(100 + i),
    kind: "상가" as const,
    prices: { [NOTICE_DATE]: { price: 1_000_000, ea: 30, sa: 10 } },
  }));
}

const asset = (): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "commercial_building",
    addressPnu: "1111010100100000000",
    addressRoad: "서울 어딘가",
    acquisitionDate: "2015-01-01",
    useEstimatedAcquisition: true,
  }) as AssetForm;

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        dateStatus: { [NOTICE_DATE]: { noticeDate: NOTICE_DATE, status: "ok" } },
        units: units(250),
        availableDates: [NOTICE_DATE],
      }),
    })) as never,
  );
}

describe("상가 호별고시가 조회 — 호 검색창", () => {
  it("🔑 U-1: 검색어를 입력해도 검색창이 남는다", async () => {
    stubFetch();
    render(
      <CommercialStdPriceLookupModal
        asset={asset()}
        onChange={() => {}}
        transferDate="2024-06-01"
        variant="estimated"
      />,
    );
    fireEvent.click(screen.getByTestId("cb-stdprice-lookup-open"));
    const box = await screen.findByPlaceholderText("건물명·동·층·호로 좁히기");
    // 결과를 1건으로 좁히는 검색어 — 종전에는 이 입력 직후 요소가 언마운트됐다.
    fireEvent.change(box, { target: { value: "가나" } });
    await waitFor(() =>
      expect(screen.getByPlaceholderText("건물명·동·층·호로 좁히기")).toBeTruthy(),
    );
    expect(
      (screen.getByPlaceholderText("건물명·동·층·호로 좁히기") as HTMLInputElement).value,
    ).toBe("가나");
  });

  it("U-2: 검색이 실제로 목록을 좁힌다 — 관측 경로가 살아 있음을 고정한다", async () => {
    stubFetch();
    render(
      <CommercialStdPriceLookupModal
        asset={asset()}
        onChange={() => {}}
        transferDate="2024-06-01"
        variant="estimated"
      />,
    );
    fireEvent.click(screen.getByTestId("cb-stdprice-lookup-open"));
    const box = await screen.findByPlaceholderText("건물명·동·층·호로 좁히기");
    fireEvent.change(box, { target: { value: "가나" } });
    await waitFor(() => expect(screen.getAllByText("가나빌딩").length).toBeGreaterThan(0));
    expect(screen.queryByText("일반빌딩5")).toBeNull();
  });
});
