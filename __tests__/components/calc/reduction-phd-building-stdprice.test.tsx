/**
 * ReductionPhdInput — 건물 기준시가 계산 모달 재사용 anchor.
 * 계획서: docs/02-design/features/reduction-phd-building-stdprice-modal-reuse.plan.md
 *
 * - PHD ON 시 취득시·최초공시시 건물 기준시가에 "건물 기준시가 계산" 버튼 노출.
 * - prefillAcqLandPrice: §164⑤ 위치지수 트랙 게이팅(≤2000 미주입).
 */
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { ReductionPhdInput } from "@/components/calc/transfer/ReductionPhdInput";
// 헬퍼는 lib 단일 출처로 이동(2026-08-24) — 재개발 §164⑦ PHD와 공용.
import { prefillAcqLandPrice } from "@/lib/calc/phd-acq-land-price-track";

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

  /**
   * 🔴 세목은 **양도로 고정**이어야 한다(`lockedTaxType`).
   *
   * 라디오가 뜨면 사용자가 「상속·증여(1시점)」로 바꿀 수 있고, 그 모드의 결과 카드는
   * `onApply`를 부르는 「이 금액 적용」 버튼을 낸다. 이 호출부는 `onApplyBoth`만
   * 배선했으므로 **두 필드 중 아무것도 채워지지 않는 침묵 no-op**인데, `saveSnapshot`은
   * 실행되어 결과탭에 「감면 PHD 환산 §164⑤」 라벨을 단 **상증 계산서**가 남는다.
   *
   * 같은 결함을 재개발 호출부에서 먼저 고쳤다(PR #1267) — 여기가 그 선례였다.
   * 계획서: docs/00-pm/red-phd-snapshot-followups.plan.md (B-5)
   */
  it.each([
    [0, "취득시 건물 기준시가"],
    [1, "최초공시시 건물 기준시가"],
  ])(
    "모달을 열면 세목 라디오가 없다 — 런처 #%i(%s), 양도 2시점 전용(lockedTaxType)",
    async (index) => {
      // ⚠️ **두 런처를 모두** 확인한다. 하나만 보면 나머지 호출부의 prop 누락이
      //    anchor를 통과한다(2026-08-24 mutation probe로 그 사각지대를 실측했다).
      render(
        <ReductionPhdInput
          acquisitionDate="2003-11-28"
          jibun="경기도 수원시 영통구 영통동 957-6"
          snapshotKeyPrefix="red993"
          value={{ phdMode: true, firstDisclosureDate: "2006-01-01", landAreaSqm: "84" }}
          onChange={vi.fn()}
        />,
      );
      fireEvent.click(screen.getAllByRole("button", { name: /건물 기준시가 계산/ })[index]);
      const dialog = await waitFor(() => screen.getByRole("dialog"));
      /**
       * ⚠️ **라벨 문자열로 단언하지 않는다.** `queryByRole("radio", { name: /상속·증여/ })`는
       * 라디오가 올바로 숨겨졌을 때와 **옵션 라벨이 개칭됐을 때** 모두 null을 돌려준다 —
       * 후자에서는 테스트가 통과하면서 아무것도 검증하지 않는다(CLAUDE.md의
       * `toContainText("0")` 무력화와 같은 실패 모드). 그룹 자체의 부재로 본다.
       */
      expect(dialog.querySelector('[name="taxType"]')).toBeNull();
    },
  );

  /**
   * 🔴 **복원 스냅샷이 lock을 이기지 못한다** — 호출부 계약이 저장값보다 우선.
   *
   * 세목 라디오가 있던 시절 상증 모드로 저장된 스냅샷을 가진 사용자는, lock을 건 뒤에도
   * 모달을 열면 상증 1시점으로 복원되는데 라디오가 없어 되돌릴 수 없었다(2026-08-24 리뷰 지적).
   */
  it("복원 스냅샷의 taxType이 inheritance_gift여도 양도 모드로 열린다", async () => {
    const { useBuildingStdSnapshotStore } = await import("@/lib/stores/building-std-snapshot-store");
    const { initialBuildingStdPriceForm } = await import("@/lib/calc/building-std-price-form");
    useBuildingStdSnapshotStore.setState({
      snapshots: {
        "bsp-asset-9-red-phd": {
          ...initialBuildingStdPriceForm,
          taxType: "inheritance_gift",
          builtYear: "2001",
          floorArea: "84.9",
        },
      },
    });
    render(
      <ReductionPhdInput
        acquisitionDate="2003-11-28"
        assetId="asset-9"
        value={{ phdMode: true, firstDisclosureDate: "2006-01-01", landAreaSqm: "84" }}
        onChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: /건물 기준시가 계산/ })[0]);
    const dialog = await waitFor(() => screen.getByRole("dialog"));
    // 양도 2시점 모드의 표식 — 둘째 시점 섹션 라벨이 뜬다(상증 1시점에는 없다).
    expect(dialog.textContent).toContain("최초고시 시점");
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

/**
 * B-4 — 감면 PHD 스냅샷 키에 **조문 세그먼트**가 들어간다.
 *
 * ⚠️ 이 anchor가 없으면 키 생성 변경이 **아무 테스트에도 안 걸린다**(2026-08-24 mutation probe
 *    실측: 키 생성을 구 방식으로 되돌려도 전건 통과했다). `idOfSnapshotKey`·`redPhdArticleLabel`은
 *    키 **문자열**을 받는 순수 함수라, 그 문자열을 누가 만드는지는 검증하지 않는다.
 *    (memory `feedback_leaf_anchor_skips_zod_layer`와 같은 층위 착오)
 */
describe("ReductionPhdInput — 스냅샷 키 조문 축", () => {
  async function captureSnapshotKeys(props: {
    assetId?: string;
    snapshotKeyPrefix?: string;
  }): Promise<string[]> {
    const keys: string[] = [];
    vi.resetModules();
    vi.doMock("@/components/calc/building-std-price/BuildingStdPriceModalButton", () => ({
      BuildingStdPriceModalButton: ({ snapshotKey }: { snapshotKey?: string }) => {
        if (snapshotKey) keys.push(snapshotKey);
        return <button type="button">건물 기준시가 계산</button>;
      },
    }));
    const { ReductionPhdInput: Stubbed } = await import(
      "@/components/calc/transfer/ReductionPhdInput"
    );
    render(
      <Stubbed
        acquisitionDate="2003-11-28"
        value={{ phdMode: true, firstDisclosureDate: "2006-01-01", landAreaSqm: "84" }}
        onChange={vi.fn()}
        {...props}
      />,
    );
    vi.doUnmock("@/components/calc/building-std-price/BuildingStdPriceModalButton");
    return keys;
  }

  it("assetId + 조문 prefix → `bsp-{assetId}-{조문}-phd`", async () => {
    const keys = await captureSnapshotKeys({ assetId: "a1", snapshotKeyPrefix: "red993" });
    expect(new Set(keys)).toEqual(new Set(["bsp-a1-red993-phd"]));
  });

  it("🔑 조문이 다르면 키도 다르다 — 종전에는 둘 다 `bsp-a1-red-phd`라 서로 덮어썼다", async () => {
    const k993 = await captureSnapshotKeys({ assetId: "a1", snapshotKeyPrefix: "red993" });
    const k988 = await captureSnapshotKeys({ assetId: "a1", snapshotKeyPrefix: "red988" });
    expect(k993[0]).not.toBe(k988[0]);
    expect(k988[0]).toBe("bsp-a1-red988-phd");
  });

  it("두 런처가 **같은** 키를 공유한다 (단일 스냅샷 idempotent 갱신)", async () => {
    const keys = await captureSnapshotKeys({ assetId: "a1", snapshotKeyPrefix: "red99" });
    expect(keys.length).toBe(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it("prefix 없으면 구 키로 fallback — 호출부 계약 유지", async () => {
    const keys = await captureSnapshotKeys({ assetId: "a1" });
    expect(keys[0]).toBe("bsp-a1-red-phd");
  });
});

/**
 * 🔴 세목이 어긋나는 복원분을 버릴 때 **호출부 prefill까지 버리면 안 된다**
 * (2026-08-24 코드 리뷰 Medium — 세목 불일치 가드를 넣으면서 생긴 결함).
 *
 * `initialForm = { ...restoredForm, ...prefillForm }`인데 `taxType`은 `restoredForm`만
 * 갖는다. 필터를 병합 결과에 걸면 모달이 통째로 빈다.
 */
describe("BuildingStdPriceModalButton — 세목 불일치 복원분과 prefill 분리", () => {
  it("복원분 세목이 달라도 호출부 prefill(연면적·토지면적)은 살아난다", async () => {
    const { useBuildingStdSnapshotStore } = await import("@/lib/stores/building-std-snapshot-store");
    const { initialBuildingStdPriceForm } = await import("@/lib/calc/building-std-price-form");
    const { BuildingStdPriceModalButton } = await import(
      "@/components/calc/building-std-price/BuildingStdPriceModalButton"
    );
    useBuildingStdSnapshotStore.setState({
      snapshots: {
        "bsp-x1-red993-phd": {
          ...initialBuildingStdPriceForm,
          taxType: "inheritance_gift",
          builtYear: "1998",
        },
      },
    });
    render(
      <BuildingStdPriceModalButton
        lockedTaxType="transfer"
        snapshotKey="bsp-x1-red993-phd"
        prefill={{ floorArea: "84.9", landAreaM2: "120.5" }}
        onApplyBoth={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /건물 기준시가 계산/ }));
    const dialog = await waitFor(() => screen.getByRole("dialog"));
    // prefill은 살아 있다
    expect(within(dialog).queryByDisplayValue("84.9")).not.toBeNull();
    expect(within(dialog).queryByDisplayValue("120.5")).not.toBeNull();
    // 세목이 다른 복원분(신축연도 1998)은 버려졌다
    expect(within(dialog).queryByDisplayValue("1998")).toBeNull();
  });
});
