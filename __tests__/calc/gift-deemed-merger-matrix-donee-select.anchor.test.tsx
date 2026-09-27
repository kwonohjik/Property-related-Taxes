/**
 * anchor: §38 합병 주주 매트릭스 — **수증자 1인 단위 이관**.
 *
 * 매트릭스의 수증자(과대평가법인 대주주등)는 **각자 독립 납세의무자**다(「상증법」§4의2① 「수증자가
 * … 납부할 의무」 · §68① 신고). 증여세 마법사 세션 1개 = 신고 1건이므로 선택된 1명만 넘긴다.
 * 종전에는 이관이 기본 분기로 떨어져 `deemedGiftValue`(과세 수증자 **전원 합계**)를 한 항목에
 * 실었다 — 교재 사례2 실측 1,000,000,000(= 갑 400,000,000 + 병 600,000,000). 누진세율이 합계에
 * 걸리고 §53 공제가 1회만 적용된다. 형제 5개 분기(§39 cap-table·§39의2·§39의3 고가·§45의3·§45의5)는
 * 이미 1인 단위였고 이 분기만 비대칭이었다.
 *
 * 목록 기준은 prefill과 결과뷰 선택기가 **같다**(과세 행 = `applied`) — 어긋나면 화면에서 고른
 * 수증자와 실제 이관 대상이 달라진다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { DeemedGiftResultView } from "../../components/calc/results/DeemedGiftResultView";
import { calcDeemedGift } from "../../lib/tax-engine/gift-deemed/router";
import { buildGiftWizardPrefill } from "../../lib/calc/gift-deemed-prefill";
import { INITIAL_DEEMED, type DeemedFormState } from "../../components/calc/deemed-gift/shared";
import type { DeemedGiftInput } from "../../lib/tax-engine/gift-deemed/gift-deemed-input-types";
import { mergerInput } from "../tax-engine/gift-deemed/for-profit-donee-roster.fixture";

afterEach(cleanup);

const calc = (i: unknown) => calcDeemedGift(i as DeemedGiftInput);
const prefill = (i: unknown, idx?: number) =>
  buildGiftWizardPrefill(
    { ...INITIAL_DEEMED, type: "merger", ...(idx !== undefined && { mrgSelectedDoneeIndex: idx }) } as DeemedFormState,
    calc(i),
  );

describe("§38 매트릭스 이관 — 수증자 1인분", () => {
  it("[MMD-0] 전제: 과세 수증자 2명(갑 400,000,000 · 병 600,000,000), 합계 1,000,000,000", () => {
    const r = calc(mergerInput());
    expect(r.deemedGiftValue).toBe(1_000_000_000);
    expect(r.mergerMatrix!.recipients.filter((x) => x.applied)).toHaveLength(2);
  });

  it("[MMD-1] 기본(0번) — 합계가 아니라 갑 1인분 400,000,000 한 항목", () => {
    const p = prefill(mergerInput());
    expect(p.giftItems).toHaveLength(1);
    expect(p.giftItems![0].marketValue).toBe(400_000_000);
    expect(p.giftItems![0].name).toContain("갑");
  });

  it("[MMD-2] 1번을 고르면 병 600,000,000", () => {
    const p = prefill(mergerInput(), 1);
    expect(p.giftItems![0].marketValue).toBe(600_000_000);
    expect(p.giftItems![0].name).toContain("병");
  });

  it("[MMD-3] 과세되지 않는 수증자는 후보에서 빠진다 — 갑이 영리법인이면 0번이 병", () => {
    const p = prefill(mergerInput(["gap"]), 0);
    expect(p.giftItems![0].marketValue).toBe(600_000_000);
    expect(p.giftItems![0].name).toContain("병");
  });

  it("[MMD-4] 범위 밖 인덱스(stale)는 첫 과세 수증자로 — 합계로 되돌아가지 않는다", () => {
    const p = prefill(mergerInput(), 7);
    expect(p.giftItems![0].marketValue).toBe(400_000_000);
  });

  it("[MMD-5] 전원 과세 제외면 이관 항목 없음", () => {
    const p = prefill(mergerInput(["gap", "byung"]));
    expect(p.giftItems).toEqual([]);
  });

  it("[MMD-6] 긍정 짝: 매트릭스가 아닌 단일 모드는 종전 기본 분기(결과 금액 그대로)", () => {
    const single = {
      type: "merger", caseType: "stock", mergedPriceMode: "auto",
      overvaluedSharePrice: 10_000, preMergerShares: 200_000, exchangedShares: 100_000,
      underSharePrice: 50_000, underPreShares: 200_000, postMergerTotalShares: 300_000,
      majorShares: 70_000,
    };
    const r = calc(single);
    expect(r.mergerMatrix).toBeUndefined();
    const p = prefill(single, 1);
    expect(p.giftItems).toHaveLength(1);
    expect(p.giftItems![0].marketValue).toBe(r.deemedGiftValue);
  });
});

describe("§38 매트릭스 결과뷰 — 이관 수증자 선택", () => {
  it("[MMD-U1] 과세 수증자 2명 → 선택기가 과세 행만 나열하고 onSelectDonee를 부른다", () => {
    const onSelect = vi.fn();
    render(<DeemedGiftResultView result={calc(mergerInput())} onToGiftTax={() => {}} selectedDoneeIndex={0} onSelectDonee={onSelect} />);
    const sel = screen.getByTestId("mrg-donee-selector") as HTMLSelectElement;
    expect(sel.options).toHaveLength(2);
    expect(sel.options[0].textContent).toContain("갑");
    expect(sel.options[1].textContent).toContain("병");
    fireEvent.change(sel, { target: { value: "1" } });
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("[MMD-U2] 과세 수증자 1명뿐이면 선택기가 없다 — 제외된 갑은 후보가 아니다", () => {
    render(<DeemedGiftResultView result={calc(mergerInput(["gap"]))} onToGiftTax={() => {}} selectedDoneeIndex={0} onSelectDonee={vi.fn()} />);
    expect(screen.queryByTestId("mrg-donee-selector")).toBeNull();
  });
});
