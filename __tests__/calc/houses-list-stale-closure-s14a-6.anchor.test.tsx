/**
 * S14a-6 anchor — 행 편집 중 비동기 조회 응답은 **최신 행에 patch만 더한다**.
 *
 * 결함: `updateHouse`가 요청 시점 렌더의 `houses`를 닫아 두었다가 응답 시점에 부르므로, 응답을 기다리는 동안 같은 행을 고치면
 * (공시가격 「조회」 대기 중 「아파트」 토글 · 용도지역 조회 대기 중 농어촌 유형 변경) 응답이 그 편집을 옛 `houses`로 되돌렸다.
 * 대조(응답이 먼저, 편집이 나중)는 처음부터 유지됐다 — 그 짝도 함께 고정한다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { useEffect, useState } from "react";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
import { HousesListSection } from "@/app/calc/transfer-tax/steps/step4-sections/HousesListSection";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import { makeHouse } from "./one-house-rulings/harness";

const ID = "S14a-6";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const ui: { latest?: TransferFormData } = {};
function Wrap({ init }: { init: TransferFormData }) {
  const [f, setF] = useState(init);
  useEffect(() => { ui.latest = f; });
  return <HousesListSection form={f} onChange={(d) => setF((x) => ({ ...x, ...d }))} />;
}
function init() {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.transferDate = "2026-06-01";
  f.assets[0] = { ...f.assets[0], assetKind: "housing", acquisitionDate: "2015-01-01" };
  f.houses = [makeHouse("h2", { addressJibun: "서울 송파구 가락동 913", addressPnu: "1171010700109130000", regionCode: "1171010700", acquisitionDate: "2020-01-01", isApartment: false })];
  f.householdHousingCount = "2";
  return f;
}
function controllableFetch() {
  let resolve!: () => void;
  const gate = new Promise<void>((r) => (resolve = r));
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    if (String(u).includes("standard-price")) {
      await gate;
      return { ok: true, json: async () => ({ price: 500000000 }) } as Response;
    }
    return { ok: false, json: async () => ({}) } as Response;
  }));
  return () => resolve();
}
const row = () => ui.latest!.houses![0] as unknown as Record<string, unknown>;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

describe(ID, () => {
  it("조회 대기 중 「아파트」 편집 → 응답", async () => {
    const release = controllableFetch();
    render(<Wrap init={init()} />);
    fireEvent.click(screen.getByRole("button", { name: "주택 1 편집" }));
    fireEvent.click(screen.getByRole("button", { name: "조회" }));
    await flush();
    fireEvent.click(screen.getAllByText("아파트")[0]);
    await flush();
    release();
    await flush();
    expect([row().isApartment, row().officialPrice]).toEqual([true, "500000000"]);
  }, 20_000); // 이 파일 첫 렌더 비용 — 부하 중 5초를 넘겼다(계획서 vitest-load-sensitive-tests.plan.md R3)
  it("대조: 응답 먼저 → 편집", async () => {
    const release = controllableFetch();
    render(<Wrap init={init()} />);
    fireEvent.click(screen.getByRole("button", { name: "주택 1 편집" }));
    fireEvent.click(screen.getByRole("button", { name: "조회" }));
    await flush();
    release();
    await flush();
    fireEvent.click(screen.getAllByText("아파트")[0]);
    await flush();
    expect([row().isApartment, row().officialPrice]).toEqual([true, "500000000"]);
  });
});

function controllableZone() {
  let resolve!: () => void;
  const gate = new Promise<void>((r) => (resolve = r));
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    if (String(u).includes("land-use-zone")) {
      await gate;
      return { ok: true, json: async () => ({ verdict: "non_urban" }) } as Response;
    }
    return { ok: false, json: async () => ({}) } as Response;
  }));
  return () => resolve();
}
function ruralInit() {
  const f = init();
  f.houses = [makeHouse("h2", { addressJibun: "강원특별자치도 홍천군 홍천읍 희망리 1", regionCode: "5172025021", acquisitionDate: "2020-01-01", oneHouseRuralHouse: true, ruralHouseKind: "inherited" } as never)];
  return f;
}
describe(ID + " 용도지역", () => {
  it("조회 대기 중 유형 「2호 이농」 선택 → 응답", async () => {
    const release = controllableZone();
    render(<Wrap init={ruralInit()} />);
    fireEvent.click(screen.getByRole("button", { name: "주택 1 편집" }));
    await flush();
    fireEvent.click(screen.getByText("2호 이농"));
    await flush();
    release();
    await flush();
    expect([row().ruralHouseKind, row().ruralUrbanZone]).toEqual(["farm_exit", "non_urban"]);
  });
  it("대조: 응답 먼저 → 유형 선택", async () => {
    const release = controllableZone();
    render(<Wrap init={ruralInit()} />);
    fireEvent.click(screen.getByRole("button", { name: "주택 1 편집" }));
    await flush();
    release();
    await flush();
    fireEvent.click(screen.getByText("2호 이농"));
    await flush();
    expect([row().ruralHouseKind, row().ruralUrbanZone]).toEqual(["farm_exit", "non_urban"]);
  });
});
