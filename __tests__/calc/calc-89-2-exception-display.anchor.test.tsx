/**
 * anchor — 계산기 결과가 §89② 예외(「소득세법 시행령」 §156의2·§156의3)로 받은 비과세의 근거를 보인다.
 *
 * 종전: 판정 메뉴는 #3596부터 「적용된 특례」에 §89② 예외 줄을 그렸지만, 계산기 결과는 `exemptReason`(본체 특례 문구 —
 *   혼인 2+2면 「혼인 합가 (§155⑤) 1세대1주택 비과세」, 1주택 + 승계 입주권이면 「1세대1주택 비과세」)과 STEP 근거 「소득세법 §89 ①」뿐이라
 *   권리가 있는 세대가 실제로 기댄 §156의2가 화면 어디에도 없었다(2026-11-23 실측 — 아래 다섯 경로 모두 결과에 필드 없음).
 *   §156의2⑨ 「…2주택과 2조합원입주권 등을 소유하게 되는 경우 … 이를 1세대1주택으로 보아 제154조제1항을 적용한다」.
 *
 * | # | 경로 | 사안 | 주장 |
 * |---|---|---|---|
 * | C-1 | 조기 반환(전액 비과세) | 혼인 2주택 + 승계 입주권 2개 · ⑨3호 나목 · 8억 | 결과 echo §156의2 ⑨3호나목 · 비과세 카드에 줄 |
 * | C-2 | 정상 반환(고가주택) | 1주택 + 승계 입주권(§156의2③) · 15억 | echo §156의2 ③ · 부분 비과세 근거 카드에 줄 |
 * | C-3 | 차손 반환 | C-2 + 취득가 16억(차손) | echo §156의2 ③ · 부분 비과세 근거 카드에 줄 |
 * | C-4 | 재개발 완공APT | 승계조합원 완공APT + 승계 입주권 · 8억 | echo §156의2 ③ · 비과세 카드에 줄 |
 * | C-5 | 다건(연간 합산) | C-1 한 건 | 자산 내역 echo · 펼친 자산 카드에 줄 |
 * | C-6 | 짝 | C-1에서 합가 전 구성 미선택(과세) | echo 없음 · 줄 없음 |
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/calc/transfer-tax",
}));
import { buildCaseForm, type RulingCase } from "./one-house-rulings/harness";
import { handoff, withToday } from "./_one-house-pr6a-routes";
import { runCalc } from "./_one-house-pr3a-calc-route";
import { runMulti } from "./_helpers/single-multi-route-parity";
import { TransferTaxResultView } from "@/components/calc/results/TransferTaxResultView";
import { PropertyBreakdownAccordion } from "@/components/calc/results/MultiTransferPropertyBreakdown";

afterEach(() => cleanup());

const LABEL = "주택과 조합원입주권·분양권을 함께 보유한 세대의 §89② 예외";
const NINE = { label: LABEL, legalBasis: ["소득세법 시행령 §156의2 ⑨3호나목"] };
const THREE = { label: LABEL, legalBasis: ["소득세법 시행령 §156의2 ③"] };
const TESTID = '[data-testid="calc-89-2-exception-basis"]';
const ADDR = "경상북도 구미시 송정동 1";
const right = (id: string, acquisitionDate: string, extra: object = {}) => ({
  id, type: "redevelopment_right", acquisitionDate, region: "non_capital", memberOrigin: "successor", ...extra,
});
const mk = (form: Record<string, unknown>): RulingCase =>
  ({ id: "x", docNo: "-", docDate: "-", basis: "era", today: "2023-10-16", summary: "x", bucket: "match", form }) as unknown as RulingCase;
const base = (price: string, asset: Record<string, unknown>, top: Record<string, unknown> = {}) =>
  mk({ isOneHousehold: true, transferDate: "2023-10-15", contractTotalPrice: price, houses: [], presaleRights: [right("s", "2022-09-25")], asset, ...top });
const house = (acq = "500000000") => ({ assetKind: "housing", acquisitionDate: "2020-05-10", fixedAcquisitionPrice: acq, addressJibun: ADDR });

/** 혼인 2+2 — 양도자 쪽 A + 입주권 s · 배우자 쪽 B + 입주권 c (D-41 시료). */
const marriage22 = (top: Record<string, unknown>) =>
  base("800000000", house(), {
    marriageDate: "2023-01-10",
    isFirstTransferredInMerge: true,
    houses: [{ id: "b", region: "non_capital", acquisitionDate: "2021-07-20", acquisitionOrigin: "general", mergeOrigin: "counterpart_side" }],
    presaleRights: [right("s", "2022-09-25", { mergeOrigin: "seller_side" }), right("c", "2022-11-01", { mergeOrigin: "counterpart_side" })],
    ...top,
  });
const NINE_B = { mergedHouseholdFirstHouseKind: "succeeded_right", mergedHouseholdOwnedBeforeRight: true };

async function single(c: RulingCase) {
  let out: Awaited<ReturnType<typeof runCalc>> | undefined;
  let form: ReturnType<typeof handoff> | undefined;
  await withToday(c.today, async () => {
    form = handoff(buildCaseForm(c));
    out = await runCalc(form);
  });
  expect(out!.status, out!.err).toBe(200);
  expect(out!.issues).toEqual([]);
  const view = render(<TransferTaxResultView result={out!.r} formData={form!} onReset={() => {}} onBack={() => {}} />).container;
  return { r: out!.r, line: view.querySelector(TESTID)?.textContent ?? null };
}

describe("계산기 결과 — §89② 예외 근거 표시", () => {
  it("C-1 조기 반환 · 혼인 2+2 ⑨3호 나목 → 비과세 카드에 §156의2 ⑨3호나목", async () => {
    const { r, line } = await single(marriage22(NINE_B));
    expect(r.isExempt).toBe(true);
    expect(r.exemptReason).toBe("혼인 합가 (§155⑤) 1세대1주택 비과세");
    expect(r.article89ExceptionApplied).toEqual(NINE);
    expect(line).toContain(LABEL);
    expect(line).toContain("§156의2");
  });

  it("C-2 정상 반환 · 1주택 + 승계 입주권 15억 → 부분 비과세 근거 카드에 §156의2 ③", async () => {
    const { r, line } = await single(base("1500000000", house()));
    expect(r.isExempt).toBe(false);
    expect(r.isPartialExempt).toBe(true);
    expect(r.totalTax).toBeGreaterThan(0);
    expect(r.article89ExceptionApplied).toEqual(THREE);
    expect(line).toContain(LABEL);
    expect(line).toContain("§156의2");
  });

  it("C-3 차손 반환 · C-2 + 취득가 16억 → 부분 비과세 근거 카드에 §156의2 ③", async () => {
    const { r, line } = await single(base("1500000000", house("1600000000")));
    expect(r.isPartialExempt).toBe(true);
    expect(r.transferGain).toBeLessThan(0);
    expect(r.totalTax).toBe(0);
    expect(r.article89ExceptionApplied).toEqual(THREE);
    expect(line).toContain(LABEL);
  });

  it("C-4 재개발 완공APT + 승계 입주권 8억 → 비과세 카드에 §156의2 ③", async () => {
    const { r, line } = await single(
      base("800000000", {
        assetKind: "redevelopment_apt", redevSubject: "apt", acquisitionCause: "purchase", acquisitionDate: "2017-03-01",
        fixedAcquisitionPrice: "500000000", addressJibun: ADDR, redevApprovalDate: "2016-05-01", redevSettlementDirection: "pay",
        redevIsSuccessorMember: "yes", redevCompletionDate: "2020-06-30",
      }),
    );
    expect(r.isExempt).toBe(true);
    expect(r.steps?.[0]?.legalBasis).toBe("소득세법 시행령 §166"); // 재개발 분기를 탔다
    expect(r.article89ExceptionApplied).toEqual(THREE);
    expect(line).toContain(LABEL);
  });

  it("C-5 다건 · C-1 한 건 → 자산 내역 echo · 펼친 자산 카드에 줄", async () => {
    const c = marriage22(NINE_B);
    let props: Record<string, unknown>[] = [];
    let form: ReturnType<typeof handoff> | undefined;
    await withToday(c.today, async () => {
      form = handoff(buildCaseForm(c));
      const m = await runMulti([form]);
      expect(m.status).toBe(200);
      props = m.props;
    });
    expect(props[0].isExempt).toBe(true);
    expect(props[0].article89ExceptionApplied).toEqual(NINE);
    const { container } = render(<PropertyBreakdownAccordion breakdown={props[0] as never} property={{ propertyId: "p1", form } as never} />);
    fireEvent.click(container.querySelector(".cursor-pointer")!);
    expect(container.querySelector(TESTID)?.textContent).toContain(LABEL);
  });

  it("C-6 짝 — 합가 전 구성 미선택(과세)이면 echo·줄 없음", async () => {
    const { r, line } = await single(marriage22({}));
    expect(r.isExempt).toBe(false);
    expect(r.isPartialExempt).toBeFalsy();
    expect(r.article89ExceptionApplied).toBeUndefined();
    expect(line).toBeNull();
  });
});
