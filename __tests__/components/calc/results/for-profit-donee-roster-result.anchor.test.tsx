/**
 * ⑦ 명부형 행별 축 — 결과 표와 이관(7-13).
 *
 * 엔진이 행을 뺐어도 표가 「제외」만 적으면 **기준금액 미달과 구별되지 않는다** — 사용자는
 * 왜 빠졌는지 모른다. 그리고 이관은 제외된 수증자를 **증여세 마법사로 넘기면 안 된다**.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { DeemedGiftResultView } from "../../../../components/calc/results/DeemedGiftResultView";
import { calcDeemedGift } from "../../../../lib/tax-engine/gift-deemed/router";
import { buildGiftWizardPrefill } from "../../../../lib/calc/gift-deemed-prefill";
import { INITIAL_DEEMED, type DeemedFormState } from "../../../../components/calc/deemed-gift/shared";
import type { DeemedGiftInput } from "../../../../lib/tax-engine/gift-deemed/gift-deemed-input-types";
import { mergerInput, cdInput, conInput } from "../../../tax-engine/gift-deemed/for-profit-donee-roster.fixture";

afterEach(cleanup);

const calc = (i: unknown) => calcDeemedGift(i as DeemedGiftInput);
const show = (i: unknown) => render(<DeemedGiftResultView result={calc(i)} onToGiftTax={() => {}} />);
const rowOf = (container: HTMLElement, name: string) =>
  Array.from(container.querySelectorAll("tbody tr")).find((tr) => tr.textContent?.includes(name)) as HTMLElement;

describe("⑦ 결과 표 — 제외 사유가 기준금액 미달과 구별된다", () => {
  it("[RFR-1] §38 매트릭스 — 영리법인 수증자 행은 사유를, 다른 행은 「과세」를 적는다", () => {
    show(mergerInput(["gap"]));
    const table = screen.getByTestId("merger-matrix");
    expect(within(rowOf(table, "갑")).getByText(/영리법인/)).toBeTruthy();
    expect(rowOf(table, "병").textContent).toContain("과세");
    expect(rowOf(table, "병").textContent).not.toContain("영리법인");
  });

  it("[RFR-2] §39의3 고가 명부 — 영리법인 수증자 행은 사유를 적는다", () => {
    show(conInput("high", ["을"]));
    const table = screen.getByTestId("deemed-contribution-breakdown");
    expect(rowOf(table, "을").textContent).toContain("영리법인");
    expect(rowOf(table, "정").textContent).not.toContain("영리법인");
  });

  it("[RFR-3] §39의2 멀티 — 영리법인 수증자 행은 사유를 적는다", () => {
    show(cdInput(["병"]));
    expect(screen.getAllByText(/영리법인 수증자/).length).toBeGreaterThan(0);
  });

  it("[RFR-4] 긍정 짝: 표지가 없으면 어느 표에도 「영리법인」이 없다", () => {
    show(mergerInput());
    expect(screen.getByTestId("merger-matrix").textContent).not.toContain("영리법인");
    cleanup();
    show(conInput("high"));
    expect(screen.getByTestId("deemed-contribution-breakdown").textContent).not.toContain("영리법인");
  });
});

describe("이관 — 제외된 수증자는 증여세 마법사로 넘기지 않는다", () => {
  const prefill = (i: unknown, f: Partial<DeemedFormState>) =>
    buildGiftWizardPrefill({ ...INITIAL_DEEMED, ...f } as DeemedFormState, calc(i));

  it("[RFR-5] §39의3 고가 — 을(영리법인)이 첫 행이어도 정이 이관된다", () => {
    const p = prefill(conInput("high", ["을"]), { type: "contribution", conCaseType: "high", conSelectedDoneeIndex: 0 });
    expect(p.giftItems).toHaveLength(1);
    expect(p.giftItems![0].marketValue).toBe(2_500_000);
    expect(p.giftItems![0].name).toContain("정");
  });

  it("[RFR-6] §39의2 멀티 — 병(영리법인)은 선택지에 없고 정이 이관된다", () => {
    const r = calc(cdInput(["병"]));
    const jeong = r.capitalDecreaseMulti!.donees.find((d) => d.name === "정")!;
    const p = prefill(cdInput(["병"]), { type: "capital_decrease", cdMode: "multi", cdSelectedDoneeIndex: 0 });
    expect(p.giftItems).toHaveLength(1);
    expect(p.giftItems![0].marketValue).toBe(jeong.total);
    expect(p.giftItems![0].name).toContain("정");
  });

  it("[RFR-7] §38 매트릭스 — 이관 금액에 영리법인 수증자 몫이 섞이지 않는다", () => {
    const p = prefill(mergerInput(["gap"]), { type: "merger" });
    expect(p.giftItems![0].marketValue).toBe(600_000_000);
  });
});
