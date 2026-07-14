/**
 * anchor: 건물 기준시가 모달 — prefill 소재지에 전체 PNU 있으면 건축물대장 조회 버튼 활성.
 *
 * 상위 화면에서 주소 조회 시 저장한 전체 PNU(asset.addressPnu)를 부모가 stdPriceAddress.pnu로
 * 전달 → 모달 f.pnu 시드 → "건축물대장 조회" 버튼이 재조회 없이 활성화. pnu 없으면 비활성(종전).
 *
 * 계획서: docs/02-design/features/building-std-modal-prefill-pnu-register-lookup.plan.md
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { BuildingStdPriceForm } from "../../components/calc/building-std-price/BuildingStdPriceForm";

afterEach(cleanup);

const ADDR = {
  road: "경상북도 안동시 서후면 명리독점길 224-1",
  jibun: "경상북도 안동시 서후면 명리 733",
  building: "",
  detail: "",
  lng: "128.7",
  lat: "36.6",
};

// 건축물대장 조회 버튼 = "건축물대장 조회" 라벨(비-조회중)
function registerButton() {
  return screen.getByRole("button", { name: "건축물대장 조회" });
}

describe("건물 기준시가 모달 — prefill PNU로 건축물대장 조회 활성화", () => {
  it("initialAddress.pnu(19자리) 있으면 + 양도연도 있으면 버튼 활성(재조회 불요)", () => {
    render(
      <BuildingStdPriceForm
        lockedTaxType="transfer"
        initialAddress={{ ...ADDR, pnu: "4717032026101070001" }}
        onResult={() => {}}
        initialForm={{ transferYear: "2025" }}
      />,
    );
    expect(registerButton()).not.toBeDisabled();
  });

  it("initialAddress.pnu 없으면 버튼 비활성 (레거시 fallback — 재조회 필요)", () => {
    render(
      <BuildingStdPriceForm
        lockedTaxType="transfer"
        initialAddress={{ ...ADDR }}
        onResult={() => {}}
        initialForm={{ transferYear: "2025" }}
      />,
    );
    expect(registerButton()).toBeDisabled();
  });
});
