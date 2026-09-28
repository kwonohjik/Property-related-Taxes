/**
 * anchor: §39①3호 전환주식 발행일 — ⑤ 입력 경로 · ⑧ 필수 · ④⑫ 왕복 (#25)
 *
 * 종전 발행일 칸(`csIssuanceDate`)은 「발행 시점 주권상장법인등」 토글 **안**의 종가평균 자동조회
 * 블록에만 있었다. 비상장 전환주식에는 입력 경로가 없어 엔진 시기 게이트가 **no-op**이 된다.
 * 발행일은 종가평균의 기준일이기 전에 「상증법」 법률 제14388호 부칙 §5②의 **적용 요건**이다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ConvertibleStockFields } from "@/components/calc/deemed-gift/convertible-stock-form";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/shared";
import { buildDeemedGiftInput } from "@/lib/calc/gift-deemed-api";
import { validateDeemedInput } from "@/lib/calc/gift-deemed-validate";
import { deemedGiftInputSchema } from "@/lib/validators/gift-deemed-input";
import { calcDeemedGift } from "@/lib/tax-engine/gift-deemed/router";

afterEach(cleanup);

function csForm(over: Partial<DeemedFormState> = {}): DeemedFormState {
  return {
    ...INITIAL_DEEMED,
    type: "convertible_stock",
    giftDate: "2025-03-15",
    csConvPrePrice: "10000", csConvPreShares: "100000", csConvNewPrice: "5000",
    csConvIssuedShares: "50000", csConvForfeitedShares: "10000",
    csIssuePrePrice: "10000", csIssuePreShares: "100000", csIssueNewPrice: "7000",
    csIssueIssuedShares: "50000", csIssueForfeitedShares: "10000",
    csIssuanceDate: "2016-12-31",
    ...over,
  };
}

function viaPipeline(form: DeemedFormState) {
  const parsed = deemedGiftInputSchema.safeParse(JSON.parse(JSON.stringify(buildDeemedGiftInput(form))));
  if (!parsed.success) throw new Error(parsed.error.message);
  return calcDeemedGift(parsed.data as Parameters<typeof calcDeemedGift>[0]);
}

describe("[CSW] 전환주식 발행일 배선", () => {
  it("[CSW-1] 🔴 ⑤ 비상장(토글 OFF)에서도 발행일 입력칸이 있다", () => {
    render(<ConvertibleStockFields form={csForm({ csIssuanceDate: "" })} set={() => {}} />);
    expect(screen.getByTestId("cs-issuance-date")).toBeInTheDocument();
  });

  it("[CSW-2] 🔴 ⑧ 발행일이 비면 차단한다", () => {
    expect(validateDeemedInput(csForm({ csIssuanceDate: "" }))).toBe("전환주식 발행일을 입력하세요");
  });

  it("[CSW-3] 긍정 짝 — 발행일이 있으면 ⑧ 통과", () => {
    expect(validateDeemedInput(csForm())).toBeNull();
  });

  it("[CSW-4] 🔴 ④⑫⑭ 왕복 — 2016-12-31 발행분은 미적용(부칙 §5②)", () => {
    const r = viaPipeline(csForm());
    expect(r.applied).toBe(false);
    expect(r.exclusionReason).toContain("부칙");
  });

  it("[CSW-5] 긍정 짝 — 2017-01-01 발행분은 13,330,000", () => {
    const r = viaPipeline(csForm({ csIssuanceDate: "2017-01-01" }));
    expect(r.deemedGiftValue).toBe(13_330_000);
  });

  it("[CSW-6] 🔴 ④ 증여일은 전환 leg로 — 전환 2017-02-06이면 시행령 부칙 §2로 차단", () => {
    const r = viaPipeline(csForm({ csIssuanceDate: "2017-01-01", giftDate: "2017-02-06" }));
    expect(r.applied).toBe(false);
    expect(r.exclusionReason).toContain("대통령령 제27835호 부칙 §2");
  });
});
