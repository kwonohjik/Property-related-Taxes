/**
 * @vitest-environment jsdom
 *
 * anchor: D-7 — `AssetSectionBasic`의 소재지 onChange가 `regionCode`는 주소 삭제 시 해제하면서
 * (OH-32와 같은 leaf) `addressPnu`(건물 기준시가 모달 prefill용)·`acquisitionSigunguCode`
 * (RTMS 매매사례가액 자동조회용)는 해제하지 않아 이전 주소의 값이 남았다.
 *
 * 세액에는 영향이 없다(`addressPnu`·`acquisitionSigunguCode` 둘 다 `transfer-tax-api.ts`·
 * `transfer-tax-schema*.ts`에 전송되지 않는다 — UI 전용 조회 편의 필드). 다만 남으면
 * **사라진 주소로** 기준시가 모달을 열거나 RTMS를 조회하는 stale prefill이 된다.
 *
 * 픽스처는 `rental-region-auto-derive.test.tsx`의 mock 패턴(AddressSearch pnu 동반 버튼)을 따른다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { AssetSectionBasic } from "@/components/calc/transfer/asset-sections/AssetSectionBasic";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SEOUL_PNU_19 = "1168010100101230001"; // 19자리 — addressPnu 조건
const BUSAN_SIGUNGU = "26350";

vi.mock("@/components/ui/address-search", () => ({
  AddressSearch: ({ onChange }: { onChange: (v: Record<string, unknown>) => void | Promise<void> }) => (
    <>
      <button
        type="button"
        data-testid="pick-seoul"
        onClick={() =>
          onChange({
            road: "서울 강남구 테헤란로 1",
            jibun: "서울 강남구 역삼동 1-1",
            building: "",
            detail: "",
            lng: "127.0",
            lat: "37.5",
            pnu: SEOUL_PNU_19,
          })
        }
      >
        seoul
      </button>
      <button
        type="button"
        data-testid="clear-address"
        onClick={() =>
          onChange({ road: "", jibun: "", building: "", detail: "", lng: "", lat: "", pnu: "" })
        }
      >
        clear
      </button>
      <button
        type="button"
        data-testid="detail-only-change"
        onClick={() =>
          onChange({
            road: "서울 강남구 테헤란로 1",
            jibun: "서울 강남구 역삼동 1-1",
            building: "",
            detail: "101동 202호",
            lng: "",
            lat: "",
          })
        }
      >
        detail-only
      </button>
    </>
  ),
}));

vi.mock("@/lib/calc/vworld-reverse-geocode", () => ({
  resolveSigunguCode: vi.fn(async () => ({
    sigunguCode: BUSAN_SIGUNGU,
    address: "",
    sidoName: "",
    sigunguName: "",
    source: "fallback_pnu" as const,
  })),
  isReverseGeocodeError: () => false,
}));

function renderBasic(over: Partial<AssetForm> = {}, onChange: (patch: Partial<AssetForm>) => void = vi.fn()) {
  const asset: AssetForm = {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2010-05-01",
    ...over,
  };
  return render(
    <AssetSectionBasic
      asset={asset}
      onChange={onChange}
      isMultiBundled={false}
      onAddAsset={vi.fn()}
      showFormDates={false}
      transferDate="2026-05-01"
      filingDate=""
      filingOverdue={false}
      filingDeadline=""
      onFormChange={vi.fn()}
    />,
  );
}

describe("D-7: 소재지 삭제 → addressPnu·acquisitionSigunguCode도 해제", () => {
  it("19자리 PNU 선택 → addressPnu·acquisitionSigunguCode가 채워진다(선행 확인)", async () => {
    const onChange = vi.fn();
    renderBasic({}, onChange);
    fireEvent.click(screen.getByTestId("pick-seoul"));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const patch = onChange.mock.calls[0][0] as Partial<AssetForm>;
    expect(patch.addressPnu).toBe(SEOUL_PNU_19);
    expect(patch.acquisitionSigunguCode).toBe(BUSAN_SIGUNGU);
  });

  it("주소를 지우면 addressPnu(undefined)·acquisitionSigunguCode(\"\")가 함께 해제된다", async () => {
    const onChange = vi.fn();
    renderBasic({ addressPnu: SEOUL_PNU_19, acquisitionSigunguCode: BUSAN_SIGUNGU } as Partial<AssetForm>, onChange);
    fireEvent.click(screen.getByTestId("clear-address"));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const patch = onChange.mock.calls[0][0] as Partial<AssetForm>;
    expect(patch.addressPnu).toBeUndefined();
    expect("addressPnu" in patch).toBe(true); // 명시적으로 지운 것 — 필드 부재와 구분
    expect(patch.acquisitionSigunguCode).toBe("");
    expect(patch.regionCode).toBe(""); // OH-32와 같은 leaf — 회귀 확인
  });

  it("twin: 상세주소(동·호)만 바뀐 호출은 addressPnu·acquisitionSigunguCode를 지키지 않는다(같은 물건)", async () => {
    const onChange = vi.fn();
    renderBasic({ addressPnu: SEOUL_PNU_19, acquisitionSigunguCode: BUSAN_SIGUNGU } as Partial<AssetForm>, onChange);
    fireEvent.click(screen.getByTestId("detail-only-change"));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const patch = onChange.mock.calls[0][0] as Partial<AssetForm>;
    expect(patch.addressPnu).toBeUndefined(); // pnu 자체가 undefined인 호출 — 지우지 않음
    expect(patch.acquisitionSigunguCode).toBeUndefined();
    expect(patch.regionCode).toBeUndefined();
  });
});
