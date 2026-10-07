/**
 * Pre-Do anchor — `AddressSearch` 「세대 있음」 판정 ↔ 동·호 선택지 정합 (계획서 §5-A · U-1~3)
 *
 * 개별주택(단독주택) 공시가격은 동·호가 빈 행으로 온다(실측 — 명리 745 `{dong:"",ho:""}`).
 * 종전에는 「행이 있다」만으로 `onUnitsResolved(true)`를 보냈는데, 드롭다운은 빈 호를 걸러
 * 선택지가 0개였다 ⇒ 양도세 ⑧ 동·호 게이트가 켜지고 끌 입력 경로가 없었다.
 *
 * 🔑 술어 함수만 재면 판정(②)·렌더(⑤) 배선을 증명하지 못한다 — 실제 컴포넌트를 렌더해
 *    `onUnitsResolved` 인자와 「호수 선택」 노출을 **함께** 단언한다.
 *    (memory `feedback_library_anchor_does_not_prove_component_uses_it`)
 *
 * 계획서: `docs/00-pm/transfer-address-unit-gate-detached-house.plan.md`
 */
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AddressSearch, type AddressValue } from "@/components/ui/address-search";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const RESULT = {
  pnu: "4717033029107450000",
  title: "명리독점길 223",
  road: "명리독점길 223",
  jibun: "경상북도 안동시 서후면 명리 745",
  building: "",
  zipcode: "",
  lng: "",
  lat: "",
};

type Unit = { dong: string; ho: string; price: number };

function stubFetch(units: Unit[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const body = String(url).includes("/api/address/search") ? { results: [RESULT] } : { units };
      return { ok: true, json: async () => body } as Response;
    }),
  );
}

function Harness({ onUnitsResolved }: { onUnitsResolved: (v: boolean) => void }) {
  const [value, setValue] = useState<AddressValue>({ road: "", jibun: "", building: "", detail: "", lng: "", lat: "" });
  return <AddressSearch value={value} onChange={setValue} onUnitsResolved={onUnitsResolved} />;
}

async function pickAddress(units: Unit[]) {
  stubFetch(units);
  const onUnitsResolved = vi.fn();
  render(<Harness onUnitsResolved={onUnitsResolved} />);
  fireEvent.change(screen.getByPlaceholderText("도로명 또는 지번 주소 입력"), { target: { value: "명리독점길 223" } });
  fireEvent.click(screen.getByRole("button", { name: "주소 검색" }));
  fireEvent.click(await screen.findByRole("button", { name: /명리독점길 223/ }));
  // 조회 완료 = 마지막 호출이 handleSelect의 선제 false 이후의 finally 호출
  await waitFor(() => expect(onUnitsResolved).toHaveBeenCalledTimes(2));
  return onUnitsResolved;
}

describe("AddressSearch 세대 판정", () => {
  // 🔴 U-1 — 개별주택형: 행은 있지만 고를 세대가 없다
  it("U-1: 동·호가 빈 행뿐이면 세대 없음 — 「호수 선택」 대신 상세주소 입력", async () => {
    const cb = await pickAddress([{ dong: "", ho: "", price: 17900000 }]);
    expect(cb).toHaveBeenLastCalledWith(false);
    expect(screen.queryByText("호수 선택")).toBeNull();
    expect(screen.getByPlaceholderText(/상세주소/)).toBeInTheDocument();
  });

  // ✅ 유지 — 공동주택형
  it("U-2: 동·호가 있으면 세대 있음 — 동 선택 노출", async () => {
    const cb = await pickAddress([{ dong: "101동", ho: "501", price: 900000000 }]);
    expect(cb).toHaveBeenLastCalledWith(true);
    expect(screen.getByText("동 선택")).toBeInTheDocument();
  });

  // ✅ 유지 — 동 없는 공동주택(단동)
  it("U-3: 호만 있어도 세대 있음 — 「호수 선택」 노출", async () => {
    const cb = await pickAddress([{ dong: "", ho: "101", price: 300000000 }]);
    expect(cb).toHaveBeenLastCalledWith(true);
    expect(screen.getByText("호수 선택")).toBeInTheDocument();
  });
});
