/**
 * @vitest-environment jsdom
 *
 * §165⑤ 간이 «순액 입력» — UI mirror + 다중키 배치 patch anchor.
 *
 * 계획서: docs/00-pm/post-listing-simple-amount-input.plan.md §7-3·§7-4
 *
 * 🔴 **AM-3이 이 작업의 최대 함정을 지킨다.** 주식수 하나가 바뀌면 순손익가치·순자산가치가
 *    «함께» 바뀌어야 한다. 단일-키 onChange를 연속 호출하면 먼저 세팅한 값이 stale
 *    스냅샷에 덮여 되돌아간다(memory feedback_multikey_patch_stale_spread_overwrite).
 */

import "fake-indexeddb/auto";
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { PostListingAmountInputSection } from "@/components/calc/stock-transfer/PostListingAmountInputSection";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-form";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

afterEach(cleanup);

const LISTING_KEYS = {
  netIncomeAmount: "listingYearNetIncomeAmount",
  shareCount: "listingYearShareCount",
  netAssetAmount: "listingYearNetAssetAmount",
  goodwill: "listingYearGoodwill",
  netIncomePerShare: "listingYearNetIncomePerShare",
  netAssetPerShare: "listingYearNetAssetPerShare",
} as const;

function Harness({
  initial,
  onPatch,
}: {
  initial: Partial<StockTransferFormData>;
  onPatch: (p: Partial<StockTransferFormData>) => void;
}) {
  const [form, setForm] = React.useState<StockTransferFormData>({
    ...createInitialStockFormData(),
    ...initial,
  } as StockTransferFormData);
  return (
    <PostListingAmountInputSection
      title="상장연도 비상장 보충적 평가"
      axisLabel="상장일"
      form={form}
      onChange={(patch) => {
        onPatch(patch);
        setForm((prev) => ({ ...prev, ...patch }));
      }}
      keys={LISTING_KEYS}
    />
  );
}

const byPh = (ph: string) => screen.getByPlaceholderText(ph) as HTMLInputElement;
const NI = "상장일 직전 사업연도 순손익액";
const SC = "발행주식총수";
const NA = "영업권 포함 전 순자산가액";
const GW = "없으면 비워두세요";

describe("AM — 순액 입력에서 1주당 가치가 자동 산정·mirror된다", () => {
  it("AM-1 네 칸이 모두 렌더된다 (순손익액·주식수·순자산가액·영업권)", () => {
    render(<Harness initial={{}} onPatch={vi.fn()} />);
    [NI, SC, NA, GW].forEach((ph) => expect(byPh(ph)).toBeTruthy());
  });

  it("AM-2 순손익액·주식수 입력 → 1주당 순손익가치가 기존 결과 필드로 mirror된다", () => {
    const onPatch = vi.fn();
    render(<Harness initial={{ listingYearShareCount: "10000" }} onPatch={onPatch} />);
    fireEvent.change(byPh(NI), { target: { value: "500000000" } });

    const patch = onPatch.mock.calls.map((c) => c[0]).at(-1)!;
    expect(patch.listingYearNetIncomeAmount).toBe("500000000");
    expect(patch.listingYearNetIncomePerShare).toBe("500000"); // 5억/1만 = 5만 → ÷10% = 50만
  });

  it("AM-3 🔴 주식수만 바꿔도 «순손익가치·순자산가치가 둘 다» 갱신된다 (다중키 배치 patch)", () => {
    const onPatch = vi.fn();
    render(
      <Harness
        initial={{
          listingYearNetIncomeAmount: "500000000",
          listingYearShareCount: "10000",
          listingYearNetAssetAmount: "48000000",
          listingYearGoodwill: "2000000",
        }}
        onPatch={onPatch}
      />,
    );
    fireEvent.change(byPh(SC), { target: { value: "20000" } });

    const patch = onPatch.mock.calls.map((c) => c[0]).at(-1)!;
    expect(patch.listingYearShareCount).toBe("20000");
    // 둘 다 «한 patch 안»에 있어야 한다 — 나눠 보내면 stale spread로 한쪽이 되돌아간다.
    expect(patch.listingYearNetIncomePerShare).toBe("250000"); // 5억/2만=2.5만 → ÷10%
    expect(patch.listingYearNetAssetPerShare).toBe("2500"); // 5천만/2만
  });

  it("AM-4 영업권은 순자산가액에 가산된다 — 빈칸이면 가산 없음", () => {
    const onPatch = vi.fn();
    render(
      <Harness
        initial={{ listingYearShareCount: "10000", listingYearNetAssetAmount: "48000000" }}
        onPatch={onPatch}
      />,
    );
    // 영업권 없음 → 48,000,000 / 10,000 = 4,800
    fireEvent.change(byPh(NA), { target: { value: "48000000" } });
    expect(onPatch.mock.calls.map((c) => c[0]).at(-1)!.listingYearNetAssetPerShare).toBe("4800");

    // 영업권 2,000,000 가산 → 50,000,000 / 10,000 = 5,000
    fireEvent.change(byPh(GW), { target: { value: "2000000" } });
    expect(onPatch.mock.calls.map((c) => c[0]).at(-1)!.listingYearNetAssetPerShare).toBe("5000");
  });

  it("AM-5 주식수 0 — 파생값을 0으로 mirror하지 «않고» 빈칸으로 둔다 (자동 fallback 금지)", () => {
    const onPatch = vi.fn();
    render(<Harness initial={{ listingYearShareCount: "0" }} onPatch={onPatch} />);
    fireEvent.change(byPh(NI), { target: { value: "500000000" } });

    const patch = onPatch.mock.calls.map((c) => c[0]).at(-1)!;
    expect(patch.listingYearNetIncomePerShare).toBe("");
    expect(patch.listingYearNetAssetPerShare).toBe("");
  });

  it("AM-7 결손 법인 — 순손익액 음수를 입력할 수 있고 산식이 그대로 흐른다", () => {
    // 커밋 전 품질 검토에서 잡은 것: allowNegative가 없으면 결손 법인이 이 모드를 못 쓴다.
    // 입력 위젯은 부호를 «보존»한다 — 0으로 보는 것은 평가액 단계다(상증령 §56① 후단, AD-7).
    const onPatch = vi.fn();
    render(<Harness initial={{ listingYearShareCount: "10000" }} onPatch={onPatch} />);
    fireEvent.change(byPh(NI), { target: { value: "-100000000" } });

    // 부호가 살아남는다 (allowNegative 없으면 "-"가 제거되어 100,000,000이 된다)
    // 비포커스 표시는 천단위 콤마가 붙는다 — 부호만 본다.
    expect(byPh(NI).value.startsWith("-")).toBe(true);
    const patch = onPatch.mock.calls.map((c) => c[0]).at(-1)!;
    expect(patch.listingYearNetIncomeAmount).toBe("-100000000");
    // 파생 1주당 순손익가치는 «0»이다 (상증령 §56① 후단 준용) — AM-8이 그 의미를 지킨다
    expect(patch.listingYearNetIncomePerShare).toBe("0");
  });

  it("AM-8 결손 파생값 0은 «산정 실패»가 아니다 — 빈칸으로 두면 validate가 차단한다", () => {
    // 🔑 종전에는 `d.netIncomePerShare > 0`일 때만 파생값을 mirror했다. §56① 하한이 들어오면서
    //    결손 법인의 파생값이 0이 되는데, 그때 빈칸을 쓰면
    //    validate의 「1주당 순손익가치 자동 산정 실패」가 발동해 **계산 자체가 막힌다.**
    //    ⇒ 「원천값이 입력됐는가」로 갈라 0을 그대로 기록한다.
    const onPatch = vi.fn();
    render(<Harness initial={{ listingYearShareCount: "10000" }} onPatch={onPatch} />);
    fireEvent.change(byPh(NI), { target: { value: "-100000000" } });
    const patch = onPatch.mock.calls.map((c) => c[0]).at(-1)!;
    // 빈칸이 «아니어야» validate를 통과한다
    expect(patch.listingYearNetIncomePerShare).not.toBe("");
    expect(patch.listingYearNetIncomePerShare).toBe("0");
  });

  it("AM-9 원천값 미입력이면 파생값은 여전히 빈칸 (0을 잘못 채우지 않는다)", () => {
    const onPatch = vi.fn();
    render(<Harness initial={{}} onPatch={onPatch} />);
    fireEvent.change(byPh(SC), { target: { value: "10000" } }); // 주식수만 입력
    const patch = onPatch.mock.calls.map((c) => c[0]).at(-1)!;
    expect(patch.listingYearNetIncomePerShare).toBe("");
    expect(patch.listingYearNetAssetPerShare).toBe("");
  });

  it("AM-6 산출 근거가 화면에 드러난다 — 환원율 10%와 법조문", () => {
    render(
      <Harness
        initial={{ listingYearNetIncomeAmount: "500000000", listingYearShareCount: "10000" }}
        onPatch={vi.fn()}
      />,
    );
    expect(screen.getByText(/1주당 순손익가치 = 1주당 순손익액 ÷ 10%/)).toBeTruthy();
    expect(screen.getByText(/§81② → 상속세 및 증여세법\s*시행규칙 §17/)).toBeTruthy();
  });
});
