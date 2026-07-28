/**
 * @vitest-environment jsdom
 *
 * §164⑥ 단서 안내 카드 노출 anchor (⑤ UI 지점).
 * 취득연도 ≤2000에서만 노출되고, 확인 토글이 단일 필드를 갱신한다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { CommercialBuildingBlock } from "@/components/calc/transfer/CommercialBuildingBlock";

afterEach(cleanup);

const NOTICE = /국세청 고시 전이라 존재하지 않습니다/;

function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(),
    assetKind: "commercial_building",
    useEstimatedAcquisition: true,
    cbEra: "pre_disclosure",
    acquisitionDate: "1998-05-10",
    ...over,
  } as AssetForm;
}

describe("§164⑥ 단서 안내 — 노출 조건", () => {
  it("취득 1998(≤2000)이면 안내와 확인 토글이 보인다", () => {
    render(<CommercialBuildingBlock asset={asset()} onChange={() => {}} transferDate="2021-06-01" />);
    expect(screen.getByText(NOTICE)).toBeTruthy();
    expect(screen.getByText("§164⑤ 준용으로 산정한 금액입니다")).toBeTruthy();
  });

  it("취득 2001이면 나목 가액이 있어 안내가 없다", () => {
    render(
      <CommercialBuildingBlock
        asset={asset({ acquisitionDate: "2001-01-01" })}
        onChange={() => {}}
        transferDate="2021-06-01"
      />,
    );
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it("post_disclosure는 §164⑥ 경로가 아니라 안내가 없다", () => {
    render(
      <CommercialBuildingBlock
        asset={asset({ cbEra: "post_disclosure" })}
        onChange={() => {}}
        transferDate="2021-06-01"
      />,
    );
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it("확인 토글은 cbAcqBuildingStdBy164_5 한 필드만 갱신한다", () => {
    const onChange = vi.fn();
    render(<CommercialBuildingBlock asset={asset()} onChange={onChange} transferDate="2021-06-01" />);
    fireEvent.click(screen.getByText("§164⑤ 준용으로 산정한 금액입니다"));
    expect(onChange).toHaveBeenCalledWith({ cbAcqBuildingStdBy164_5: true });
  });
});

/** 두 시점 기준시가합을 같게 맞춘 자산 — §164⑧ 준용 조건 성립 */
function sameSumAsset(over: Partial<AssetForm> = {}): AssetForm {
  return asset({
    acquisitionDate: "2003-05-10", // §164⑤ 안내와 분리
    cbLandArea: "100",
    cbLandPricePerSqmAtAcq: "1000000",
    cbLandPricePerSqmAtFirst: "1000000",
    cbBuildingStdPriceAtAcq: "120000000",
    cbBuildingStdPriceAtFirst: "120000000",
    ...over,
  });
}

const SEC_164_8_TITLE = "§164⑧ 준용 — 취득당시·최초고시당시 기준시가합이 동일";

describe("§164⑥ 괄호 단서(§164⑧ 준용) 입력 — 노출 조건", () => {
  it("두 시점 기준시가합이 같으면 카드와 B·D 입력이 보인다", () => {
    render(
      <CommercialBuildingBlock asset={sameSumAsset()} onChange={() => {}} transferDate="2021-06-01" />,
    );
    expect(screen.getByText(SEC_164_8_TITLE)).toBeTruthy();
    expect(screen.getByPlaceholderText("전기 기준시가 합계액 입력")).toBeTruthy();
    expect(screen.getByPlaceholderText("조정월수 입력")).toBeTruthy();
  });

  it("합계액이 다르면 카드가 없다", () => {
    render(
      <CommercialBuildingBlock
        asset={sameSumAsset({ cbBuildingStdPriceAtFirst: "150000000" })}
        onChange={() => {}}
        transferDate="2021-06-01"
      />,
    );
    expect(screen.queryByText(SEC_164_8_TITLE)).toBeNull();
  });

  it("post_disclosure는 §164⑥ 경로가 아니라 카드가 없다", () => {
    render(
      <CommercialBuildingBlock
        asset={sameSumAsset({ cbEra: "post_disclosure" })}
        onChange={() => {}}
        transferDate="2021-06-01"
      />,
    );
    expect(screen.queryByText(SEC_164_8_TITLE)).toBeNull();
  });

  it("기준시가합이 아직 입력되지 않았으면(0) 카드가 없다 — 0 == 0 오발동 방지", () => {
    render(
      <CommercialBuildingBlock
        asset={asset({ acquisitionDate: "2003-05-10" })}
        onChange={() => {}}
        transferDate="2021-06-01"
      />,
    );
    expect(screen.queryByText(SEC_164_8_TITLE)).toBeNull();
  });

  it("산출된 기준시가합을 화면에 보여준다 (엔진과 동일한 floor 위치)", () => {
    render(
      <CommercialBuildingBlock asset={sameSumAsset()} onChange={() => {}} transferDate="2021-06-01" />,
    );
    // INT(1,000,000 × 100) + INT(120,000,000) = 220,000,000
    expect(screen.getByText("220,000,000")).toBeTruthy();
  });
});

describe("§164⑧ 준용 입력 — 단일 필드 갱신", () => {
  it("B 입력은 cbPrevStdPriceSum만 갱신한다", () => {
    const onChange = vi.fn();
    render(
      <CommercialBuildingBlock asset={sameSumAsset()} onChange={onChange} transferDate="2021-06-01" />,
    );
    fireEvent.change(screen.getByPlaceholderText("전기 기준시가 합계액 입력"), {
      target: { value: "200000000" },
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ cbPrevStdPriceSum: "200000000" });
  });

  it("D 입력은 cbStdPriceAdjustMonths만 갱신한다", () => {
    const onChange = vi.fn();
    render(
      <CommercialBuildingBlock asset={sameSumAsset()} onChange={onChange} transferDate="2021-06-01" />,
    );
    fireEvent.change(screen.getByPlaceholderText("조정월수 입력"), { target: { value: "6" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ cbStdPriceAdjustMonths: "6" });
  });
});

const SEC_164_4_NOTICE = /개별공시지가가 없습니다/;

describe("§164④ 안내 — 1990.8.30. 이전 취득 토지등급 환산", () => {
  it("취득 1988이면 안내와 토지등급 환산 입력이 보인다", () => {
    render(
      <CommercialBuildingBlock
        asset={asset({ acquisitionDate: "1988-05-10" })}
        onChange={() => {}}
        transferDate="2021-06-01"
      />,
    );
    expect(screen.getByText(SEC_164_4_NOTICE)).toBeTruthy();
    // Pre1990LandValuationInput 렌더 확인 (ToggleCard — 등급 3종은 ON 시 펼쳐진다)
    expect(screen.getByText("1990.8.30. 이전 취득 토지 기준시가 환산")).toBeTruthy();
  });

  it("경계 — 1990-08-29 노출 / 1990-08-30 미노출", () => {
    const { unmount } = render(
      <CommercialBuildingBlock
        asset={asset({ acquisitionDate: "1990-08-29" })}
        onChange={() => {}}
        transferDate="2021-06-01"
      />,
    );
    expect(screen.getByText(SEC_164_4_NOTICE)).toBeTruthy();
    unmount();

    render(
      <CommercialBuildingBlock
        asset={asset({ acquisitionDate: "1990-08-30" })}
        onChange={() => {}}
        transferDate="2021-06-01"
      />,
    );
    expect(screen.queryByText(SEC_164_4_NOTICE)).toBeNull();
  });

  it("환산 토글을 켜면 등급 3종 입력이 펼쳐진다", () => {
    render(
      <CommercialBuildingBlock
        asset={asset({ acquisitionDate: "1988-05-10", pre1990Enabled: true })}
        onChange={() => {}}
        transferDate="2021-06-01"
      />,
    );
    expect(screen.getByText("1990.8.30. 현재 등급")).toBeTruthy();
    expect(screen.getByText("1990.8.30. 직전 등급")).toBeTruthy();
    expect(screen.getByText("취득시 유효 등급")).toBeTruthy();
  });

  it("취득 2003이면 개별공시지가가 있으므로 안내가 없다", () => {
    render(
      <CommercialBuildingBlock
        asset={asset({ acquisitionDate: "2003-05-10" })}
        onChange={() => {}}
        transferDate="2021-06-01"
      />,
    );
    expect(screen.queryByText(SEC_164_4_NOTICE)).toBeNull();
  });
});
