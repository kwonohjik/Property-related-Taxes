/**
 * @vitest-environment jsdom
 *
 * 종부세 토지 필지 — 주소를 고르면 시군구(재산세 합산 단위)를 도로명·지번 어느 쪽에서든 채우고,
 * 새 주소에서 못 뽑으면 칸을 비운다.
 *
 * 주소 검색 응답은 검색 방식에 따라 한쪽만 전체 주소로 온다(실제 API 실측 — 계획서 §0.1).
 * - 지번 검색: road="가락로 100" · jibun="서울특별시 송파구 석촌동 276-1"
 * - 도로명 검색: road="서울특별시 강남구 테헤란로 152 (역삼동)" · jibun="역삼동 737"
 *
 * 종전에는 `deriveSigunguFromAddress(v.road || v.jibun)`로 도로명만 봐서 지번 검색이면 칸이 비었다.
 * 또 파생에 실패한 선택은 칸을 건드리지 않아, 주소를 바꿔도 옛 시군구가 남은 채 계산됐다.
 * 그 경우 재산세 합산 그룹이 바뀌어 세액이 달라진다(엔진 실측 287,050원 차이).
 * 계획서 `docs/00-pm/land-parcel-sigungu-autofill.plan.md` R1·R2(Q-1 a)
 *
 * 🔴 실제 `AddressSearch`를 쓴다 — 결함은 위젯이 보내는 응답 형식과 호출부 파생 사이에 있다.
 */
import { useState } from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { LandParcelEditor } from "@/components/calc/comprehensive/LandParcelEditor";

/** 실제 API 실측 응답(첫 결과) — 계획서 §0.1. 세종은 단층제라 어느 쪽이든 시군구가 나오지 않는다 */
const RESULTS: Record<string, { road: string; jibun: string; pnu: string }> = {
  "석촌동 276-1": { pnu: "1171010500102760001", road: "가락로 100", jibun: "서울특별시 송파구 석촌동 276-1" },
  "테헤란로 152": { pnu: "1168010100107370000", road: "서울특별시 강남구 테헤란로 152 (역삼동)", jibun: "역삼동 737" },
  "분당구 정자동 1": { pnu: "4113510300100010000", road: "분당수서로 519", jibun: "경기도 성남시 분당구 정자동 1" },
  "보람동 1": { pnu: "3611011800100010000", road: "한누리대로 2130", jibun: "세종특별자치시 보람동 1" },
};

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const q = new URL(String(input), "http://x").searchParams.get("q") ?? "";
    const r = RESULTS[q];
    return new Response(
      JSON.stringify({ results: r ? [{ ...r, title: "", building: "", zipcode: "", lng: "", lat: "" }] : [] }),
      { status: 200 },
    );
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** 호출부는 controlled다 — 상위 store처럼 patch를 되먹인다 */
function Harness({ jurisdiction = "" }: { jurisdiction?: string }) {
  const [parcel, setParcel] = useState({
    id: "p1", jurisdiction, name: "", jibun: "", area: "", shareRatio: "100", officialPricePerSqm: "", priorOfficialPricePerSqm: "",
  });
  return (
    <LandParcelEditor parcel={parcel} kind="aggregate" refDate="2026-06-01" priorYear="2025" priorMode="none"
      onUpdate={(d) => setParcel((x) => ({ ...x, ...d }))} />
  );
}

const block = () => screen.getByTestId("land-aggregate-parcel-address");
const jurisdiction = () => (screen.getByTestId("land-aggregate-parcel-jurisdiction") as HTMLInputElement).value;

/** 검색해 첫 결과를 고른다(`typed`면 「입력한 주소를 그대로 사용」) */
async function pick(q: string, typed = false) {
  const clear = within(block()).queryByRole("button", { name: "지우기" });
  if (clear) fireEvent.click(clear);
  const input = within(block()).getByPlaceholderText("도로명 또는 지번 주소 입력");
  fireEvent.change(input, { target: { value: q } });
  fireEvent.keyDown(input, { key: "Enter" });
  if (typed) {
    fireEvent.click(await within(block()).findByText(/를 그대로 사용/));
  } else {
    const road = RESULTS[q].road;
    await waitFor(() => expect(within(block()).getAllByRole("button").some((b) => b.textContent?.includes(road))).toBe(true));
    fireEvent.click(within(block()).getAllByRole("button").find((b) => b.textContent?.includes(road))!);
  }
  await waitFor(() => expect(within(block()).getByRole("button", { name: "지우기" })).toBeTruthy());
}

describe("토지 필지 시군구 자동 채움", () => {
  it("J-1: 지번 검색 형식(도로명이 짧다) — 지번의 전체 주소에서 송파구를 채운다(R1)", async () => {
    render(<Harness />);
    await pick("석촌동 276-1");
    expect(jurisdiction()).toBe("송파구");
  });

  it("J-2: 도로명 검색 형식 — 도로명에서 강남구를 채운다(회귀)", async () => {
    render(<Harness />);
    await pick("테헤란로 152");
    expect(jurisdiction()).toBe("강남구");
  });

  it("J-3: 일반구 지번 형식 — 시 단위(성남시)로 채운다(R1)", async () => {
    render(<Harness />);
    await pick("분당구 정자동 1");
    expect(jurisdiction()).toBe("성남시");
  });

  it("J-4: 강남구 주소를 지번 검색 형식의 송파구 주소로 바꾸면 송파구가 된다(R1)", async () => {
    render(<Harness />);
    await pick("테헤란로 152");
    await pick("석촌동 276-1");
    expect(jurisdiction()).toBe("송파구");
  });

  it("J-5: 강남구 → 세종(시군구를 못 뽑는 주소)으로 바꾸면 칸을 비운다(R2)", async () => {
    render(<Harness />);
    await pick("테헤란로 152");
    await pick("보람동 1");
    expect(jurisdiction()).toBe("");
  });

  it("J-6: 강남구 → 「입력한 주소를 그대로 사용」이면 칸을 비운다(R2)", async () => {
    render(<Harness />);
    await pick("테헤란로 152");
    await pick("어딘가 1", true);
    expect(jurisdiction()).toBe("");
  });

  it("J-7: 강남구 → 「지우기」면 칸을 비운다(R2)", async () => {
    render(<Harness />);
    await pick("테헤란로 152");
    fireEvent.click(within(block()).getByRole("button", { name: "지우기" }));
    expect(jurisdiction()).toBe("");
  });

  it("J-8 반례: 주소를 고른 뒤 손으로 고친 시군구는 주소를 다시 고르기 전까지 그대로다", async () => {
    render(<Harness />);
    await pick("보람동 1");
    expect(jurisdiction()).toBe("");
    fireEvent.change(screen.getByTestId("land-aggregate-parcel-jurisdiction"), { target: { value: "세종시" } });
    // 공시지가 칸 등 같은 모달의 다른 입력이 주소 onChange를 다시 부르지 않는다
    fireEvent.change(screen.getByTestId("land-aggregate-parcel-name"), { target: { value: "세종 필지" } });
    await new Promise((r) => setTimeout(r, 400));
    expect(jurisdiction()).toBe("세종시");
  });
});
