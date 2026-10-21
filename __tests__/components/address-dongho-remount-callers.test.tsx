/**
 * @vitest-environment jsdom
 *
 * 다시 마운트된 `AddressSearch`(세대 목록 없음 → 상세주소 칸)에서 상세주소를 입력해도 **저장된 동·호가 지워지지 않는다**.
 *
 * 종전에는 아래 호출부가 저장한 동·호를 `value`로 다시 넘기지 않아, 상세주소 입력(`{ ...value, detail }`)이
 * `v.dong ?? ""` 매핑으로 동·호를 `""`로 지웠다. 그러면 공시가격 조회가 다른 세대 가격을, 건축물대장 조회가
 * 동 전체 연면적을 오류 없이 채웠다.
 * 계획서 `docs/00-pm/address-dongho-other-calcs-and-multi-gate.plan.md` A(R1·R2·R3)
 *
 * | # | 주장 |
 * |---|---|
 * | H-1 | 보유주택 명부: 세대 목록을 못 불러와 상세주소 칸에 입력해도 `addressDong`·`addressHo`가 남는다(R1) |
 * | H-2 | 보유주택 명부: 동·호가 저장된 행을 열면 세대 목록을 다시 불러와 고른 호가 보인다(R2) |
 * | R-1 | 임대주택 카드: 목록을 다시 못 불러와도 상세주소 칸이 없고 `rentalDong`·`rentalHo`를 건드리지 않는다(`address-detail-dead-input.plan.md` R2) |
 * | B-1 | 건물 기준시가 모달: 첫 오픈에 자산의 동·호를 옮겨 집합건물로 판정하고, 건축물대장 조회에 동·호를 싣는다(R3) |
 * | B-2 | 건물 기준시가 모달: 상세주소 입력에도 집합건물 판정이 남는다(R1) |
 * | M-1 | 다시점 건물 기준시가 모달: 상세주소 입력에도 집합건물 판정이 남는다(R1) |
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { HouseEntryEditor } from "@/components/calc/transfer/HouseEntryEditor";
import { RentalUnitCard } from "@/components/calc/transfer/RentalUnitCard";
import { BuildingStdPriceForm } from "@/components/calc/building-std-price/BuildingStdPriceForm";
import { MultiPointBuildingStdPriceModal } from "@/components/calc/building-std-price/MultiPointBuildingStdPriceModal";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

const JIBUN = "서울 강남구 대치동 316";
const PNU = "1168010600103160000";
const UNITS = [
  { dong: "101동", ho: "501", floor: "5", price: 900000000, year: "2026" },
  { dong: "101동", ho: "502", floor: "5", price: 700000000, year: "2026" },
];
const COLLECTIVE = /집합건물 세대는 건축물대장 조회 시/;

let unitsMode: "fail" | "units" = "fail";
let requested: string[] = [];

beforeEach(() => {
  unitsMode = "fail";
  requested = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    requested.push(url);
    if (url.includes("/api/address/standard-price") && unitsMode === "units")
      return new Response(JSON.stringify({ units: UNITS }), { status: 200 });
    if (url.includes("/api/address/standard-price"))
      return new Response(JSON.stringify({ error: { code: "NED_FETCH_FAILED", message: "x" } }), { status: 502 });
    return new Response(JSON.stringify({}), { status: 200 });
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const house: HouseEntry = {
  id: "h1",
  region: "capital",
  acquisitionDate: "2015-01-01",
  officialPrice: "900000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
  addressJibun: JIBUN,
  addressDetail: "101동 501",
  addressDong: "101동",
  addressHo: "501",
};

/** 세대 목록 조회가 끝나 상세주소 칸이 나올 때까지 기다린다 */
const detailField = () => waitFor(() => screen.getByPlaceholderText(/상세주소/));

describe("다시 마운트된 주소 검색 — 상세주소 입력이 동·호를 지우지 않는다", () => {
  it("H-1: 보유주택 명부 — 상세주소를 고쳐도 addressDong·addressHo가 남는다(R1)", async () => {
    const onUpdate = vi.fn();
    render(<HouseEntryEditor house={house} onUpdate={onUpdate} transferDate="2026-06-01" />);
    fireEvent.change(await detailField(), { target: { value: "101동 501호" } });
    expect(onUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ addressDetail: "101동 501호", addressDong: "101동", addressHo: "501" }),
    );
  });

  it("H-2: 보유주택 명부 — 동·호가 저장된 행은 세대 목록을 다시 불러와 고른 호를 보여 준다(R2)", async () => {
    unitsMode = "units";
    render(<HouseEntryEditor house={house} onUpdate={() => {}} transferDate="2026-06-01" />);
    await waitFor(() => expect(screen.getAllByRole("combobox").some((c) => c.textContent?.includes("501"))).toBe(true));
    expect(screen.queryByPlaceholderText(/상세주소/)).toBeNull();
  });

  it("R-1: 임대주택 카드 — 목록을 다시 못 불러와도 상세주소 칸이 없고 rentalDong·rentalHo를 건드리지 않는다", async () => {
    // 상세주소는 저장할 필드가 없어 칸을 그리지 않는다(계획서 address-detail-dead-input.plan.md R2). 종전에는 칸이 보였지만
    // 입력이 남지 않았고, 한 글자마다 같은 값을 다시 써 판정 결과를 지웠다.
    const onChange = vi.fn();
    render(
      <RentalUnitCard
        unit={{ ...makeDefaultRentalUnit(), rentalAddressJibun: JIBUN, rentalDong: "101동", rentalHo: "501" }}
        index={0}
        onChange={onChange}
        onRemove={() => {}}
        canRemove={false}
        transferDate="2026-06-01"
      />,
    );
    // 재조회가 실패로 끝난 뒤를 본다 — 조회 중에는 원래 칸이 없어 단언이 비게 된다
    await waitFor(() => expect(requested.some((u) => u.includes("/api/address/standard-price"))).toBe(true));
    await waitFor(() => expect(screen.queryByText("동/호수 조회 중...")).toBeNull());
    expect(screen.queryByPlaceholderText(/상세주소/)).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("B-1: 건물 기준시가 모달 — 첫 오픈에 자산의 동·호를 옮겨 집합건물로 판정한다(R3)", async () => {
    render(
      <BuildingStdPriceForm
        lockedTaxType="transfer"
        initialAddress={{ road: "", jibun: JIBUN, building: "", detail: "101동 501", lng: "", lat: "", pnu: PNU, dong: "101동", ho: "501" }}
        onResult={() => {}}
        initialForm={{ transferYear: "2025" }}
      />,
    );
    expect(screen.getByText(COLLECTIVE)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "건축물대장 조회" }));
    await waitFor(() => expect(requested.some((u) => u.includes("/api/address/building-register"))).toBe(true));
    const url = new URL(requested.find((u) => u.includes("/api/address/building-register"))!, "http://x");
    expect([url.searchParams.get("dong"), url.searchParams.get("ho")]).toEqual(["101동", "501"]);
  });

  it("B-2: 건물 기준시가 모달 — 상세주소 입력에도 집합건물 판정이 남는다(R1)", async () => {
    render(
      <BuildingStdPriceForm
        lockedTaxType="transfer"
        initialAddress={{ road: "", jibun: JIBUN, building: "", detail: "101동 501", lng: "", lat: "", pnu: PNU }}
        onResult={() => {}}
        initialForm={{ transferYear: "2025", unitDong: "101동", unitHo: "501" }}
      />,
    );
    fireEvent.change(await detailField(), { target: { value: "101동 501호" } });
    expect(screen.getByText(COLLECTIVE)).toBeTruthy();
  });

  it("M-1: 다시점 건물 기준시가 모달 — 상세주소 입력에도 집합건물 판정이 남는다(R1)", async () => {
    render(
      <MultiPointBuildingStdPriceModal
        points={[
          { key: "acquisition", label: "취득시", year: 2010, landPricePerM2: "" },
          { key: "transfer", label: "양도시", year: 2025, landPricePerM2: "" },
        ]}
        onApply={() => {}}
        initialAddress={{ road: "", jibun: JIBUN, building: "", detail: "101동 501", lng: "", lat: "", pnu: PNU, dong: "101동", ho: "501" }}
      />,
    );
    fireEvent.click(screen.getByText("2시점 건물기준시가 일괄 계산"));
    expect(screen.getByText(COLLECTIVE)).toBeTruthy();
    fireEvent.change(await detailField(), { target: { value: "101동 501호" } });
    expect(screen.getByText(COLLECTIVE)).toBeTruthy();
  });
});
