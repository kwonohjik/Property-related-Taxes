/**
 * @vitest-environment jsdom
 *
 * CommercialStdPriceLookupModal — 호별 고시가 조회 모달 anchor.
 *
 * 검증: 런처 비활성 사유 · 목록 렌더(층구분·건물명 분리) · **단일 배치 onChange 1회** ·
 * 부분 매칭 시 미충전 · 면적 불일치 덮어쓰기 · 배치 B에서 양도시 필드 미충전 · 상태 6종.
 * UI 설계 §12.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent, act } from "@testing-library/react";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { CommercialStdPriceLookupModal } from "@/components/calc/transfer/CommercialStdPriceLookupModal";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

const PNU = "1111010700100800000";

function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(),
    assetKind: "commercial_building",
    useEstimatedAcquisition: true,
    cbEra: "post_disclosure",
    acquisitionDate: "2013-05-10",
    addressPnu: PNU,
    addressJibun: "서울특별시 종로구 적선동 80",
    ...over,
  } as AssetForm;
}

const GROUND = {
  key: "1(단일)|4|1|1",
  buildingName: "적선현대빌딩",
  dong: "1(단일)",
  floorClass: "지상" as const,
  floor: "1",
  ho: "1",
  kind: "상가" as const,
  prices: {
    "2013-01-01": { price: 4_000_000, ea: 639.47, sa: 357.74 },
    "2021-01-01": { price: 5_898_000, ea: 639.47, sa: 357.74 },
  },
};

const BASEMENT = {
  key: "1(단일)|1|1|1",
  buildingName: "적선현대빌딩",
  dong: "1(단일)",
  floorClass: "지하" as const,
  floor: "1",
  ho: "1",
  kind: "상가" as const,
  prices: {
    "2013-01-01": { price: 1_597_000, ea: 7.18, sa: 2.4 },
    "2021-01-01": null,
  },
};

function mockFetch(body: unknown) {
  const fn = vi.fn().mockResolvedValue({ json: async () => body } as Response);
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

const OK_BODY = {
  success: true,
  dateStatus: { "2013-01-01": "ok", "2021-01-01": "ok" },
  units: [BASEMENT, GROUND],
  availableDates: ["2013-01-01", "2021-01-01"],
};

/** 클릭 — fetch 후 상태 갱신이 act로 감싸지도록. (user-event 미설치 프로젝트) */
async function click(el: Element) {
  await act(async () => {
    fireEvent.click(el);
  });
}

async function openAndWait() {
  await click(screen.getByTestId("cb-stdprice-lookup-open"));
  await waitFor(() => expect(screen.getByRole("radiogroup")).toBeTruthy());
}

describe("런처", () => {
  it("PNU가 없으면 비활성 + 사유를 함께 보여준다", () => {
    render(
      <CommercialStdPriceLookupModal
        asset={asset({ addressPnu: undefined })}
        onChange={() => {}}
        transferDate="2021-06-01"
        variant="estimated"
      />,
    );
    const btn = screen.getByTestId("cb-stdprice-lookup-open") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByText("소재지를 다시 선택하면 조회할 수 있습니다")).toBeTruthy();
  });

  it("취득일·양도일이 모두 없으면 조회 시점을 만들 수 없어 비활성", () => {
    render(
      <CommercialStdPriceLookupModal
        asset={asset({ acquisitionDate: "" })}
        onChange={() => {}}
        variant="estimated"
      />,
    );
    expect((screen.getByTestId("cb-stdprice-lookup-open") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("목록 — 층구분·건물명이 섞이지 않는다", () => {
  it("지하/지상이 각각 다른 행으로 노출된다", async () => {
    mockFetch(OK_BODY);
    render(
      <CommercialStdPriceLookupModal
        asset={asset()}
        onChange={() => {}}
        transferDate="2021-06-01"
        variant="estimated"
      />,
    );
    await openAndWait();

    expect(screen.getByTestId("cb-stdprice-unit-1__1__1")).toBeTruthy(); // 지하
    expect(screen.getByTestId("cb-stdprice-unit-4__1__1")).toBeTruthy(); // 지상
  });

  it("조회 시점은 기준일 연도의 1/1로 요청한다 (전 고시 1/1 시행)", async () => {
    const fn = mockFetch(OK_BODY);
    render(
      <CommercialStdPriceLookupModal
        asset={asset()}
        onChange={() => {}}
        transferDate="2021-06-01"
        variant="estimated"
      />,
    );
    await openAndWait();
    const url = String(fn.mock.calls[0][0]);
    expect(url).toContain("dates=2013-01-01%2C2021-01-01");
  });
});

describe("적용 — 단일 배치 (stale spread 방지)", () => {
  it("onChange가 정확히 1회, 4필드를 한 patch로 전달한다", async () => {
    mockFetch(OK_BODY);
    const onChange = vi.fn();
    render(
      <CommercialStdPriceLookupModal
        asset={asset()}
        onChange={onChange}
        transferDate="2021-06-01"
        variant="estimated"
      />,
    );
    await openAndWait();
    await click(screen.getByTestId("cb-stdprice-unit-4__1__1"));
    await click(screen.getByTestId("cb-stdprice-apply"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      cbUnitPriceAtFirstOrAcq: "4000000",
      cbUnitPriceAtTransfer: "5898000",
      cbExclusiveArea: "639.47",
      cbSharedArea: "357.74",
    });
  });

  it("값이 없는 시점은 채우지 않는다 — 0 적용 금지", async () => {
    mockFetch(OK_BODY);
    const onChange = vi.fn();
    render(
      <CommercialStdPriceLookupModal
        asset={asset()}
        onChange={onChange}
        transferDate="2021-06-01"
        variant="estimated"
      />,
    );
    await openAndWait();
    await click(screen.getByTestId("cb-stdprice-unit-1__1__1")); // 지하 — 2021 없음
    expect(screen.getByText("2개 시점 중 1개만 채워집니다")).toBeTruthy();
    await click(screen.getByTestId("cb-stdprice-apply"));

    const patch = onChange.mock.calls[0][0];
    expect(patch.cbUnitPriceAtFirstOrAcq).toBe("1597000");
    expect(patch).not.toHaveProperty("cbUnitPriceAtTransfer");
  });

  it("배치 B(상속)는 양도시 필드를 채우지 않는다 — 화면에 없는 필드", async () => {
    mockFetch({
      ...OK_BODY,
      dateStatus: { "2005-01-01": "ok" },
      availableDates: ["2005-01-01"],
      units: [
        {
          ...GROUND,
          prices: { "2005-01-01": { price: 2_268_000, ea: 42.22, sa: 3.14 } },
        },
      ],
    });
    const onChange = vi.fn();
    render(
      <CommercialStdPriceLookupModal
        asset={asset({ acquisitionCause: "inheritance" })}
        onChange={onChange}
        transferDate="2021-06-01"
        variant="inheritance"
      />,
    );
    await openAndWait();
    await click(screen.getByTestId("cb-stdprice-unit-4__1__1"));
    await click(screen.getByTestId("cb-stdprice-apply"));

    const patch = onChange.mock.calls[0][0];
    expect(patch.cbUnitPriceAtFirstOrAcq).toBe("2268000");
    expect(patch).not.toHaveProperty("cbUnitPriceAtTransfer");
  });
});

describe("면적 — 기존 값 보호", () => {
  it("이미 입력된 면적이 다르면 덮어쓰지 않고 경고 + 덮어쓰기 버튼을 준다", async () => {
    mockFetch(OK_BODY);
    const onChange = vi.fn();
    render(
      <CommercialStdPriceLookupModal
        asset={asset({ cbExclusiveArea: "100", cbSharedArea: "20" })}
        onChange={onChange}
        transferDate="2021-06-01"
        variant="estimated"
      />,
    );
    await openAndWait();
    await click(screen.getByTestId("cb-stdprice-unit-4__1__1"));
    expect(screen.getByText("조회값으로 덮어쓰기")).toBeTruthy();

    await click(screen.getByTestId("cb-stdprice-apply"));
    let patch = onChange.mock.calls[0][0];
    expect(patch).not.toHaveProperty("cbExclusiveArea");

    // 덮어쓰기 선택 시에만 면적이 들어간다
    onChange.mockClear();
    await click(screen.getByTestId("cb-stdprice-lookup-open"));
    await waitFor(() => expect(screen.getByRole("radiogroup")).toBeTruthy());
    await click(screen.getByTestId("cb-stdprice-unit-4__1__1"));
    await click(screen.getByText("조회값으로 덮어쓰기"));
    await click(screen.getByTestId("cb-stdprice-apply"));
    patch = onChange.mock.calls[0][0];
    expect(patch.cbExclusiveArea).toBe("639.47");
  });
});

describe("상태 안내 — 미고시는 실패가 아니다", () => {
  beforeEach(() => sessionStorage.clear());

  it("전 시점 no_notice면 '미고시 물건입니다 — 수기 입력하세요'", async () => {
    mockFetch({
      success: true,
      dateStatus: { "2013-01-01": "no_notice", "2021-01-01": "no_notice" },
      units: [],
      availableDates: [],
    });
    render(
      <CommercialStdPriceLookupModal
        asset={asset()}
        onChange={() => {}}
        transferDate="2021-06-01"
        variant="estimated"
      />,
    );
    await click(screen.getByTestId("cb-stdprice-lookup-open"));
    await waitFor(() =>
      expect(screen.getByTestId("cb-stdprice-status").textContent).toContain("미고시 물건입니다"),
    );
  });

  it("unjoinable_parcel은 자동조회 불가 안내", async () => {
    mockFetch({
      success: true,
      parcelReason: "unjoinable_parcel",
      dateStatus: {},
      units: [],
      availableDates: [],
    });
    render(
      <CommercialStdPriceLookupModal
        asset={asset()}
        onChange={() => {}}
        transferDate="2021-06-01"
        variant="estimated"
      />,
    );
    await click(screen.getByTestId("cb-stdprice-lookup-open"));
    await waitFor(() =>
      expect(screen.getByTestId("cb-stdprice-status").textContent).toContain(
        "자동조회할 수 없습니다",
      ),
    );
  });
});

describe("건물명 표기 상이 — 연결 근거를 노출한다", () => {
  it("linkedBy=position이면 시점별 원문 건물명을 보여준다", async () => {
    mockFetch({
      ...OK_BODY,
      units: [
        {
          ...GROUND,
          linkedBy: "position",
          buildingNameByDate: { "2013-01-01": "적선현대빌딩", "2021-01-01": "(80)" },
        },
      ],
    });
    render(
      <CommercialStdPriceLookupModal
        asset={asset()}
        onChange={() => {}}
        transferDate="2021-06-01"
        variant="estimated"
      />,
    );
    await openAndWait();
    await click(screen.getByTestId("cb-stdprice-unit-4__1__1"));
    expect(screen.getByText(/건물명 표기가 시점마다 다릅니다/)).toBeTruthy();
    expect(screen.getByText(/2021년 "\(80\)"/)).toBeTruthy();
  });
});
