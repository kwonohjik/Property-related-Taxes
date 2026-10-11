/**
 * S14a-3 · S14a-2 · S14b-3 anchor — 행 주소를 **지우거나 바꾸면** 직전 주소에서 파생한 값이 남지 않는다.
 *
 * 결함: 명부 행·분양권·입주권 행의 주소 「지우기」·「입력한 주소를 그대로 사용」(`pnu: ""`)이 `regionCode`·`addressPnu`·
 * `inDesignatedDistrict`·지역 구분을 두었고, 주소를 바꿔도 §155⑦ 소재 판정 상태(`ruralUrbanZone`·`ruralOutsideCapitalEupMyeon`)가
 * 이전 필지의 것으로 남았다. 사라진 주소(강남)의 법정동으로 조정지역·원조합원 처분기한·농어촌 소재를 판정했다.
 *
 * 양도 주택 카드(`AssetSectionBasic` D-7)·판정 ②(`Step3` OH-32)는 이미 같은 규칙이다 — 행 경로만 빠져 있었다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { useEffect, useState } from "react";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { buildHouseAddressPatch, isAddressReplaced } from "@/lib/calc/house-region";
import { HouseEntryEditor } from "@/components/calc/transfer/HouseEntryEditor";
import { HouseEntryRuralHouseBlock } from "@/components/calc/transfer/HouseEntryRuralHouseBlock";
import { PresaleRightsSection } from "@/components/calc/transfer/PresaleRightsSection";
import { resolveRuralLocationQualified } from "@/lib/calc/one-house-row-facts";
import type { HouseEntry } from "@/lib/stores/calc-wizard-store";
import type { AddressValue } from "@/components/ui/address-search";
import { makeHouse, observeCase, type RulingCase } from "./one-house-rulings/harness";
import E062 from "./one-house-rulings/cases/E062.json";
import E146 from "./one-house-rulings/cases/E146.json";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const STALE_CODE = "1168010100";
const START = makeHouse("h1", {
  addressJibun: "서울특별시 강남구 역삼동 1",
  regionCode: STALE_CODE,
  region: "capital",
  addressPnu: "1168010100100010001",
  inDesignatedDistrict: true,
  acquisitionDate: "2021-01-15",
});
const merge = (v: AddressValue, from: HouseEntry = START) => ({ ...from, ...buildHouseAddressPatch(v, from.regionCode) });
const CLEAR = { road: "", jibun: "", building: "", detail: "", lng: "", lat: "", pnu: "" } as AddressValue;
const TYPED = { pnu: "", road: "", jibun: "경기도 파주시 금촌동 1", building: "", detail: "", lng: "", lat: "" } as AddressValue;

describe("S14a-3 anchor — 술어", () => {
  it("isAddressReplaced: pnu ''(지우기·직접 입력)·pnu 있음(검색 선택)은 교체, pnu 없음(동·호 재발화)은 아님", () => {
    expect(isAddressReplaced({ pnu: "", road: "", jibun: "" })).toBe(true);
    expect(isAddressReplaced({ pnu: "", road: "", jibun: "직접 입력" })).toBe(true);
    expect(isAddressReplaced({ pnu: "4148010100100010001", road: "", jibun: "x" })).toBe(true);
    expect(isAddressReplaced({ road: "", jibun: "서울 강남구 역삼동 1" })).toBe(false);
    expect(isAddressReplaced({ road: "", jibun: "" })).toBe(true); // 주소 자체가 빈 경우는 지움
  });
});

describe("S14a-3 anchor — buildHouseAddressPatch (leaf)", () => {
  it("지우기(pnu '') — regionCode·addressPnu·inDesignatedDistrict 해제, 지역 구분은 기본값", () => {
    const h = merge(CLEAR);
    expect(h.regionCode || undefined).toBeUndefined();
    expect(h.addressPnu || undefined).toBeUndefined();
    expect(h.inDesignatedDistrict).toBeUndefined();
    expect(h.region).toBe("capital");
  });
  it("지방 코드였다면 지우기 뒤 지역 구분도 직전 코드의 파생값을 남기지 않는다", () => {
    const local = makeHouse("h2", { regionCode: "4148010100", region: "non_capital", addressPnu: "4148010100100010001" });
    expect(merge(CLEAR, local).region).toBe("capital");
  });
  it("입력한 주소 그대로 사용(pnu '') — 강남 코드가 남지 않는다", () => {
    const h = merge(TYPED);
    expect(h.regionCode || undefined).toBeUndefined();
    expect(h.addressPnu || undefined).toBeUndefined();
    expect(h.inDesignatedDistrict).toBeUndefined();
    expect(h.addressJibun).toBe("경기도 파주시 금촌동 1");
  });
  // 긍정 짝
  it("긍정 짝: 동·호 재발화(pnu 없음)는 같은 물건이라 코드·지정지구 답을 유지한다", () => {
    const h = merge({ road: "", jibun: "서울특별시 강남구 역삼동 1", building: "", detail: "", lng: "", lat: "", dong: "101동" } as AddressValue);
    expect(h.regionCode).toBe(STALE_CODE);
    expect(h.addressPnu).toBe("1168010100100010001");
    expect(h.inDesignatedDistrict).toBe(true);
    expect(h.region).toBe("capital");
  });
  it("긍정 짝: PNU 있는 선택은 새 코드로 갱신한다", () => {
    const h = merge({ ...TYPED, pnu: "2671010100100010001" } as AddressValue); // 부산 기장군(VALUE)
    expect(h.regionCode).toBe("2671010100");
    expect(h.addressPnu).toBe("2671010100100010001");
    expect(h.region).toBe("non_capital");
  });
  it("긍정 짝: 코드가 없던 행에서 수동으로 고른 지역 구분은 직접 입력해도 지우지 않는다", () => {
    const manual = makeHouse("h3", { regionCode: undefined, region: "non_capital" });
    expect(merge(TYPED, manual).region).toBe("non_capital");
  });
});

// ── UI — 실제 HouseEntryEditor + AddressSearch ──
const ui: { latest: HouseEntry } = { latest: START };
function Wrap({ init }: { init: HouseEntry }) {
  const [h, setH] = useState(init);
  useEffect(() => { ui.latest = h; });
  return <HouseEntryEditor house={h} onUpdate={(p) => setH((x) => ({ ...x, ...p }))} transferDate="2022-03-15" />;
}
function stubFetch(searchResults: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (u: string) =>
      String(u).includes("/api/address/search")
        ? ({ ok: true, json: async () => ({ results: searchResults }) } as Response)
        : ({ ok: false, json: async () => ({}) } as Response),
    ),
  );
}
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 400)); });

describe("S14a-3 anchor — 실제 행 편집기에서 지우기·그대로 사용", () => {
  it("「지우기」 뒤 코드·지정지구가 비고 수동 지역 라디오가 열린다", async () => {
    stubFetch([]);
    render(<Wrap init={START} />);
    expect(screen.queryAllByText("소재지 주소에서 자동 판정")).toHaveLength(1);
    fireEvent.click(screen.getByText("지우기"));
    await tick();
    expect(ui.latest.regionCode || undefined).toBeUndefined();
    expect(ui.latest.addressPnu || undefined).toBeUndefined();
    expect(ui.latest.inDesignatedDistrict).toBeUndefined();
    expect(screen.queryAllByText("소재지 주소에서 자동 판정")).toHaveLength(0);
  });
  it("검색 결과 없음 → 「그대로 사용」 뒤 강남 코드가 남지 않는다", async () => {
    stubFetch([]);
    render(<Wrap init={START} />);
    const input = screen.getByPlaceholderText("도로명 또는 지번 주소 입력");
    fireEvent.change(input, { target: { value: "경기도 파주시 금촌동 1" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await tick();
    fireEvent.click(screen.getByText(/를 그대로 사용/));
    await tick();
    expect(ui.latest.addressJibun).toBe("경기도 파주시 금촌동 1");
    expect(ui.latest.regionCode || undefined).toBeUndefined();
    expect(ui.latest.inDesignatedDistrict).toBeUndefined();
  });
  it("긍정 짝: PNU 있는 검색 선택은 새 코드로 갱신된다", async () => {
    stubFetch([{ pnu: "4148010100100010001", title: "파주", road: "", jibun: "경기도 파주시 금촌동 1", building: "", zipcode: "", lng: "", lat: "" }]);
    render(<Wrap init={START} />);
    const input = screen.getByPlaceholderText("도로명 또는 지번 주소 입력");
    fireEvent.change(input, { target: { value: "경기도 파주시 금촌동 1" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await tick();
    fireEvent.click(screen.getAllByText("경기도 파주시 금촌동 1")[0].closest("button")!);
    await tick();
    expect(ui.latest.regionCode).toBe("4148010100");
  });
});

describe("S14a-3 anchor — route: 지운 주소의 코드가 판정에 닿지 않는다", () => {
  const base = (E062 as unknown as RulingCase[])[0];
  const row0 = (base.form as { houses: Record<string, unknown>[] }).houses[0];
  const run = (row: Record<string, unknown>) =>
    observeCase({ ...base, form: { ...base.form, houses: [{ ...row0, ...row }] } } as RulingCase);
  it("지우기 뒤 행으로 판정하면 「코드 없음」과 같은 결론이다(stale 강남 코드가 판정을 바꾸지 않는다)", async () => {
    const cleared = merge(CLEAR, makeHouse("h1", { ...row0, regionCode: STALE_CODE, addressPnu: "1168010100100010001" } as Partial<HouseEntry>));
    const afterClear = await run({ regionCode: cleared.regionCode || undefined });
    const noCode = await run({ regionCode: undefined });
    const stale = await run({ regionCode: STALE_CODE });
    expect(afterClear.status).toBe(200);
    expect([afterClear.isExempt, afterClear.undetermined]).toEqual([noCode.isExempt, noCode.undetermined]);
    // 전제: stale 코드는 결론을 바꾼다(그렇지 않으면 이 anchor는 구별력이 없다)
    expect([stale.isExempt, stale.undetermined]).not.toEqual([noCode.isExempt, noCode.undetermined]);
  });
});

// ── S14a-2 — §155⑦ 소재 판정 상태 ──
const A_JIBUN = "강원특별자치도 평창군 평창읍 하리 1";
const B_JIBUN = "강원특별자치도 평창군 평창읍 다수리 99";
const addr = (jibun: string, pnu: string) => ({ road: "", jibun, building: "", detail: "", pnu }) as unknown as AddressValue;
const A = addr(A_JIBUN, "5176025021100010000");
const B = addr(B_JIBUN, "5176025030100990000");

let fetchCalls = 0;
function stubZoneFetch() {
  fetchCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (u: string) => {
      fetchCalls++;
      const j = decodeURIComponent(String(u));
      return { ok: true, json: async () => ({ verdict: j.includes("하리") ? "urban" : "non_urban" }) } as unknown as Response;
    }),
  );
}
const rural: { setRow: (fn: (h: HouseEntry) => HouseEntry) => void; current?: HouseEntry } = { setRow: () => {} };
function RuralHost({ init }: { init: HouseEntry }) {
  const [h, setH] = useState(init);
  useEffect(() => {
    rural.setRow = (fn) => setH((x) => fn(x));
    rural.current = h;
  });
  return <HouseEntryRuralHouseBlock house={h} onUpdate={(p) => setH((x) => ({ ...x, ...p }))} />;
}
const flush = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const ruralBase = (over: Partial<HouseEntry> = {}) =>
  makeHouse("rural", {
    region: "non_capital", acquisitionDate: "1990-09-18", isInherited: true, inheritedDate: "1990-09-18",
    decedentSameHouseholdAtInheritance: false, ruralHouseKind: "inherited", ruralDecedentResidenceYears: "10",
    oneHouseRuralHouse: true, ...over,
  } as Partial<HouseEntry>);
const e146 = (E146 as unknown as RulingCase[]).find((c) => c.id === "E146-era-pos")!;

describe("S14a-2 anchor — 행 주소를 바꾸면 §155⑦ 소재 판정 상태가 새 주소로 다시 판정된다", () => {
  it("주소 patch가 소재 판정 상태 두 칸을 비운다(교체일 때만)", () => {
    const p = buildHouseAddressPatch(B, "5176025021");
    expect(p).toHaveProperty("ruralUrbanZone", undefined);
    expect(p).toHaveProperty("ruralOutsideCapitalEupMyeon", undefined);
    // 긍정 짝 — 동·호 재발화는 같은 물건이라 조회값을 지우지 않는다
    const refire = buildHouseAddressPatch({ road: "", jibun: B_JIBUN, building: "", detail: "", lng: "", lat: "", dong: "101동" } as AddressValue, "5176025030");
    expect(refire).not.toHaveProperty("ruralUrbanZone");
    expect(refire).not.toHaveProperty("ruralOutsideCapitalEupMyeon");
  });
  it("도시지역 읍 A로 조회한 뒤 비도시 읍 B로 고치면 B로 다시 조회·판정한다", async () => {
    stubZoneFetch();
    render(<RuralHost init={{ ...ruralBase(), ...buildHouseAddressPatch(A) } as HouseEntry} />);
    await flush();
    expect(rural.current!.ruralUrbanZone).toBe("urban");
    act(() => rural.setRow((h) => ({ ...h, ...buildHouseAddressPatch(B, h.regionCode) })));
    await flush();
    expect(fetchCalls).toBe(2);
    expect(rural.current!.ruralUrbanZone).toBe("non_urban");
    expect(resolveRuralLocationQualified(rural.current!)).toBe(true);
    const o = await observeCase({ ...e146, form: { ...e146.form, houses: [{ ...(e146.form!.houses![0] as object), ...rural.current, ruralOutsideCapitalEupMyeon: undefined }] } } as RulingCase);
    expect(o.isExempt).toBe(true);
  });
  it("직접 지정값도 주소를 다시 입력하면 자동 판정으로 돌아간다(안내문 약속)", async () => {
    stubZoneFetch();
    render(<RuralHost init={{ ...ruralBase(), ...buildHouseAddressPatch(B), ruralUrbanZone: "non_urban", ruralOutsideCapitalEupMyeon: true } as HouseEntry} />);
    await flush();
    const G = addr("경기도 양평군 양평읍 양근리 1", "4183025021100010000");
    act(() => rural.setRow((h) => ({ ...h, ...buildHouseAddressPatch(G, h.regionCode) })));
    await flush();
    expect(rural.current!.ruralOutsideCapitalEupMyeon).toBeUndefined();
    expect(resolveRuralLocationQualified(rural.current!)).toBe(false); // 수도권 소재 → 농어촌주택 아님
  });
  it("긍정 짝: 주소를 바꾸지 않으면 조회값은 한 번만 조회되고 유지된다", async () => {
    stubZoneFetch();
    render(<RuralHost init={{ ...ruralBase(), ...buildHouseAddressPatch(B) } as HouseEntry} />);
    await flush();
    await flush();
    expect(fetchCalls).toBe(1);
    expect(rural.current!.ruralUrbanZone).toBe("non_urban");
  });
});

// ── S14b-3 — 분양권·입주권 행 ──
const PRESALE_ROW = { id: "p1", type: "redevelopment_right", acquisitionDate: "2018-10-01", region: "capital", memberOrigin: "original_house", regionCode: STALE_CODE, regionName: "서울특별시 강남구 역삼동 1", inDesignatedDistrict: true } as never;
const presale: { rights: Record<string, unknown>[] } = { rights: [] };
function PresaleWrap() {
  const [rs, setRs] = useState([PRESALE_ROW] as never[]);
  useEffect(() => { presale.rights = rs as Record<string, unknown>[]; });
  return <PresaleRightsSection rights={rs} onChange={(r) => setRs(r as never[])} transferDate="2020-11-01" />;
}

describe("S14b-3 anchor — 분양권·입주권 행 소재지 지우기·그대로 사용", () => {
  it("「지우기」 — 직전 법정동코드·이름·지정지구 답을 해제한다", async () => {
    stubFetch([]);
    render(<PresaleWrap />);
    fireEvent.click(screen.getByText("지우기"));
    await tick();
    expect(presale.rights[0].regionCode || undefined).toBeUndefined();
    expect(presale.rights[0].regionName || undefined).toBeUndefined();
    expect(presale.rights[0].inDesignatedDistrict).toBeUndefined();
  });
  it("「그대로 사용」(pnu '') — 이름은 입력한 주소, 강남 코드는 남지 않는다", async () => {
    stubFetch([]);
    render(<PresaleWrap />);
    const input = screen.getByPlaceholderText("도로명 또는 지번 주소 입력");
    fireEvent.change(input, { target: { value: "강원특별자치도 춘천시 효자동 100" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await tick();
    fireEvent.click(screen.getByText(/를 그대로 사용/));
    await tick();
    expect(presale.rights[0].regionName).toBe("강원특별자치도 춘천시 효자동 100");
    expect(presale.rights[0].regionCode || undefined).toBeUndefined();
    expect(presale.rights[0].inDesignatedDistrict).toBeUndefined();
  });
  it("긍정 짝: PNU 있는 선택은 새 코드로 갱신된다", async () => {
    stubFetch([{ pnu: "5111010100100010001", title: "춘천", road: "", jibun: "강원특별자치도 춘천시 효자동 100", building: "", zipcode: "", lng: "", lat: "" }]);
    render(<PresaleWrap />);
    const input = screen.getByPlaceholderText("도로명 또는 지번 주소 입력");
    fireEvent.change(input, { target: { value: "강원특별자치도 춘천시 효자동 100" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await tick();
    fireEvent.click(screen.getAllByText("강원특별자치도 춘천시 효자동 100")[0].closest("button")!);
    await tick();
    expect(presale.rights[0].regionCode).toBe("5111010100");
  });
});
