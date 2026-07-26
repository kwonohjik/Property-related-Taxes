/**
 * ReductionPhdInput — 건물 기준시가 계산 모달 재사용 anchor.
 * 계획서: docs/02-design/features/reduction-phd-building-stdprice-modal-reuse.plan.md
 *
 * - PHD ON 시 취득시·최초공시시 건물 기준시가에 "건물 기준시가 계산" 버튼 노출.
 * - prefillAcqLandPrice: §164⑤ 위치지수 트랙 게이팅(≤2000 미주입).
 */
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { ReductionPhdInput, prefillAcqLandPrice } from "@/components/calc/transfer/ReductionPhdInput";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("prefillAcqLandPrice — §164⑤ 위치지수 트랙 게이팅", () => {
  it("이벤트연도 ≥2001 → 해당 연도 ㎡당 공시지가 주입", () => {
    expect(prefillAcqLandPrice("2005-06-01", "1500000")).toBe("1500000");
    expect(prefillAcqLandPrice("2001-01-01", "1000000")).toBe("1000000");
  });
  it("이벤트연도 ≤2000 → 미주입(모달서 2001 공시지가 직접 입력)", () => {
    expect(prefillAcqLandPrice("2000-12-31", "900000")).toBeUndefined();
    expect(prefillAcqLandPrice("1998-05-01", "800000")).toBeUndefined();
  });
  it("날짜·값 부재 → undefined", () => {
    expect(prefillAcqLandPrice(undefined, "1000000")).toBeUndefined();
    expect(prefillAcqLandPrice("2005-06-01", undefined)).toBeUndefined();
  });
});

describe("ReductionPhdInput — 건물 기준시가 계산 버튼", () => {
  it("PHD ON 시 취득시·최초공시시 두 곳에 계산 버튼 노출", () => {
    render(
      <ReductionPhdInput
        acquisitionDate="2003-11-28"
        jibun="경기도 수원시 영통구 영통동 957-6"
        snapshotKeyPrefix="red993"
        value={{ phdMode: true, firstDisclosureDate: "2006-01-01", landAreaSqm: "84" }}
        onChange={vi.fn()}
      />,
    );
    const buttons = screen.getAllByRole("button", { name: /건물 기준시가 계산/ });
    expect(buttons.length).toBe(2);
  });

  it("PHD OFF 시 계산 버튼 미노출", () => {
    render(
      <ReductionPhdInput
        acquisitionDate="2003-11-28"
        value={{ phdMode: false }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /건물 기준시가 계산/ })).toBeNull();
  });
});

describe("ReductionPhdInput — 토지 공시지가 Vworld 자동조회", () => {
  it("취득시 토지 공시지가 조회 → landPricePerSqmAtAcq(원/㎡) 채움", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ price: 1_500_000, priceType: "land_price" }),
    }) as unknown as typeof fetch;
    const onChange = vi.fn();

    render(
      <ReductionPhdInput
        acquisitionDate="2005-06-01"
        jibun="경기도 수원시 영통구 영통동 957-6"
        value={{ phdMode: true, firstDisclosureDate: "2007-01-01" }}
        onChange={onChange}
      />,
    );

    // 취득시·최초공시시 두 토지 필드 각 "공시지가 조회" 버튼
    const lookupBtns = screen.getAllByRole("button", { name: /공시지가 조회/ });
    expect(lookupBtns.length).toBe(2);
    fireEvent.click(lookupBtns[0]); // 취득시
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ landPricePerSqmAtAcq: "1500000" }));
  });

  it("지번 미입력 시 토지 공시지가 조회 버튼 비활성", () => {
    render(
      <ReductionPhdInput
        acquisitionDate="2005-06-01"
        value={{ phdMode: true, firstDisclosureDate: "2007-01-01" }}
        onChange={vi.fn()}
      />,
    );
    const lookupBtns = screen.getAllByRole("button", { name: /공시지가 조회/ });
    lookupBtns.forEach((b) => expect(b).toBeDisabled());
  });
});
