/**
 * @vitest-environment jsdom
 *
 * 동·호를 쓰지 않는 주소 칸은 세대 목록·동·호 드롭다운·상세주소 칸을 그리지 않는다(`disableUnits`).
 *
 * 종전에는 그렸다. 상세주소 입력과 동·호 선택은 `{ ...value, … }`로 `pnu` 없이 발화하는데, 호출부의 `value`에는
 * 상세주소도 `pnu`도 없다. 그래서 그 발화마다 다음 일이 생겼다.
 * - §155⑯ 두 칸: 시·군 코드를 `""`로 저장했다. 엔진은 코드가 없으면 「해당」 선언을 그대로 써(비연접인데도) 처분기한 5년을 적용했다.
 * - 종부세 토지 필지: 손으로 고친 시군구를 지번에서 뽑은 값으로 덮었다.
 * 계획서 `docs/00-pm/address-detail-dead-input.plan.md` R1(Q-1·Q-2 a)
 *
 * 🔴 실제 `AddressSearch`를 쓴다 — 결함은 위젯이 무엇을 보내는지와 호출부 배선 사이에 있다.
 *
 * | # | 주장 |
 * |---|---|
 * | T-1 | §155⑯ 이전한 기관·법인 소재지: 아파트 주소를 골라도 세대 조회·드롭다운·상세주소 칸이 없고, 시·군 코드가 실린다 |
 * | T-2 | §155⑯ 신규 주택 소재지: 같다 |
 * | L-1 | 종부세 토지 필지: 같다 — 주소 선택 1회 말고는 `onUpdate`가 불리지 않는다 |
 * | P-1 | 분양권 소재지: 같다 — 법정동 코드가 실린다 |
 */
import { useState } from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { TempTwoHouseRelocationInputs } from "@/components/calc/transfer/TempTwoHouseDeadlineExceptionInputs";
import { LandParcelEditor } from "@/components/calc/comprehensive/LandParcelEditor";
import { PresaleRightsSection } from "@/components/calc/transfer/PresaleRightsSection";
import type { PresaleRightEntry } from "@/lib/stores/calc-wizard-asset-nbl";

const PNU = "5011010100100010000"; // 제주시 일도일동
const JIBUN = "제주특별자치도 제주시 일도일동 1";
const UNITS = [
  { dong: "101동", ho: "501", floor: "5", price: 900000000, year: "2026" },
  { dong: "101동", ho: "502", floor: "5", price: 800000000, year: "2026" },
];

let requested: string[] = [];

beforeEach(() => {
  requested = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    requested.push(url);
    if (url.includes("/api/address/search"))
      return new Response(
        JSON.stringify({ results: [{ pnu: PNU, title: "제주 1", road: "중앙로 1", jibun: JIBUN, building: "", zipcode: "", lng: "", lat: "" }] }),
        { status: 200 },
      );
    // 세대가 있는 아파트 — 세대 조회가 돌면 동·호 드롭다운이 뜬다
    if (url.includes("/api/address/standard-price")) return new Response(JSON.stringify({ units: UNITS }), { status: 200 });
    return new Response(JSON.stringify({}), { status: 200 });
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** `scope` 안의 주소 검색 칸에서 제주 아파트를 고르고, 뒤따르는 비동기 작업이 끝날 때까지 기다린다 */
async function pickApartment(scope: HTMLElement) {
  const input = within(scope).getByPlaceholderText("도로명 또는 지번 주소 입력");
  fireEvent.change(input, { target: { value: "제주 1" } });
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.click(await within(scope).findByRole("button", { name: /중앙로 1/ }));
  // 선택된 주소가 그려진 뒤(「지우기」)를 본다 — 그래야 세대 목록·상세주소 칸이 그려질 자리가 생긴다
  await waitFor(() => expect(within(scope).getByRole("button", { name: "지우기" })).toBeTruthy());
  await waitFor(() => expect(screen.queryByText("동/호수 조회 중...")).toBeNull());
}

/** 세대 조회·드롭다운·상세주소 칸이 모두 없다 */
function expectNoUnitInputs(scope: HTMLElement) {
  expect(requested.some((u) => u.includes("/api/address/standard-price"))).toBe(false);
  expect(within(scope).queryByText("동 선택")).toBeNull();
  expect(within(scope).queryByPlaceholderText(/상세주소/)).toBeNull();
}

const relocationForm = {
  publicInstitutionRelocation: true,
  relocatedInstitutionJibun: "",
  relocatedSigunguCode: "",
  newHouseJibun: "",
  newHouseSigunguCode: "",
  disposalDelayReason: "",
};

/** 호출부는 controlled다 — 상위 store처럼 patch를 되먹인다 */
function RelocationHarness({ spy }: { spy: (p: object) => void }) {
  const [form, setForm] = useState(relocationForm);
  return (
    <TempTwoHouseRelocationInputs
      form={form}
      onChange={(p) => { spy(p); setForm((f) => ({ ...f, ...p })); }}
      relocationRegionVerdict={null}
    />
  );
}
function LandHarness({ spy }: { spy: (p: object) => void }) {
  const [parcel, setParcel] = useState({ id: "p1", jurisdiction: "제주시", name: "", jibun: "", area: "", shareRatio: "100", officialPricePerSqm: "", priorOfficialPricePerSqm: "" });
  return (
    <LandParcelEditor parcel={parcel} kind="aggregate" refDate="2026-06-01" priorYear="2025" priorMode="none"
      onUpdate={(p) => { spy(p); setParcel((x) => ({ ...x, ...p })); }} />
  );
}
function PresaleHarness({ spy }: { spy: (r: PresaleRightEntry[]) => void }) {
  const [rights, setRights] = useState([{ id: "r1", type: "presale_right", acquisitionDate: "2022-01-01", region: "capital" } as PresaleRightEntry]);
  return <PresaleRightsSection rights={rights} onChange={(r) => { spy(r); setRights(r); }} primaryKind="housing" transferDate="2026-06-01" />;
}

/** 라벨 바로 위 블록(라벨 + 주소 검색) */
const fieldBlock = (label: string) => screen.getByText(label, { exact: true }).parentElement as HTMLElement;

describe("동·호를 쓰지 않는 주소 칸 — 세대 목록·상세주소 칸을 그리지 않는다", () => {
  it("T-1: §155⑯ 이전한 기관·법인 소재지 — 아파트를 골라도 드롭다운·상세주소 칸이 없고 시·군 코드가 실린다", async () => {
    const onChange = vi.fn();
    render(<RelocationHarness spy={onChange} />);
    const block = fieldBlock("이전한 기관·법인 소재지");
    await pickApartment(block);
    expectNoUnitInputs(block);
    expect(onChange).toHaveBeenLastCalledWith({ relocatedInstitutionJibun: JIBUN, relocatedSigunguCode: "5011000000" });
  });

  it("T-2: §155⑯ 신규 주택 소재지 — 같다", async () => {
    const onChange = vi.fn();
    render(<RelocationHarness spy={onChange} />);
    const block = fieldBlock("신규 주택 소재지");
    await pickApartment(block);
    expectNoUnitInputs(block);
    expect(onChange).toHaveBeenLastCalledWith({ newHouseJibun: JIBUN, newHouseSigunguCode: "5011000000" });
  });

  it("L-1: 종부세 토지 필지 — 같다, 주소 선택 말고는 onUpdate가 불리지 않는다(시군구를 덮지 않는다)", async () => {
    const onUpdate = vi.fn();
    const { container } = render(<LandHarness spy={onUpdate} />);
    const block = container.querySelector('[data-testid="land-aggregate-parcel-address"]') as HTMLElement;
    await pickApartment(block);
    expectNoUnitInputs(block);
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("P-1: 분양권 소재지 — 같다, 법정동 코드가 실린다", async () => {
    const onChange = vi.fn();
    render(<PresaleHarness spy={onChange} />);
    const block = screen.getByPlaceholderText("도로명 또는 지번 주소 입력").closest("div.space-y-1") as HTMLElement;
    await pickApartment(block);
    expectNoUnitInputs(block);
    expect(onChange.mock.calls.at(-1)?.[0]?.[0]).toMatchObject({ regionCode: "5011010100", regionName: JIBUN });
  });
});
