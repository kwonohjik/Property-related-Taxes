/**
 * ⑦ §39의3 저가 명부 + 영리법인 현물출자자(7-15) — 제외된 결과에 「별도 증여세를 신고」 안내를 붙이지 않는다.
 * 명부(증여자별 안분표)는 이익의 구조를 보여 주므로 남기되, 신고 안내는 과세되는 결과에만 맞다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DeemedGiftResultView } from "../../../../components/calc/results/DeemedGiftResultView";
import { calcDeemedGift } from "../../../../lib/tax-engine/gift-deemed/router";
import type { DeemedGiftInput } from "../../../../lib/tax-engine/gift-deemed/gift-deemed-input-types";
import { SINGLE_MODE } from "../../../tax-engine/gift-deemed/for-profit-donee-single-mode.fixture";

afterEach(cleanup);
const show = (i: DeemedGiftInput) => render(<DeemedGiftResultView result={calcDeemedGift(i)} onToGiftTax={() => {}} />);

describe("⑦ §39의3 저가 명부 — 영리법인 현물출자자", () => {
  it("[SFR-1] 제외되면 안분표는 남고 신고 안내 대신 「제외 전」 안내", () => {
    show({ ...SINGLE_MODE.con_low_roster, doneeIsForProfitCorp: true } as DeemedGiftInput);
    const box = screen.getByTestId("deemed-contribution-breakdown");
    expect(box.textContent).not.toContain("별도 증여세를 신고");
    expect(box.textContent).toContain("제외 전");
  });

  it("[SFR-2] 긍정 짝: 과세되면 신고 안내 그대로", () => {
    show(SINGLE_MODE.con_low_roster);
    expect(screen.getByTestId("deemed-contribution-breakdown").textContent).toContain("별도 증여세를 신고");
  });
});
