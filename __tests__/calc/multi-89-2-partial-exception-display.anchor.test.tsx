/**
 * anchor — 다건(연간 합산) 자산 카드가 고가주택 부분 비과세·차손 자산에도 §89② 예외(「소득세법 시행령」 §156의2·§156의3) 근거를 보인다.
 *
 * 종전: #3599는 다건 카드(`PropertyBreakdownAccordion`)의 **전액 비과세 분기**에만 줄을 그렸다. 부분 비과세·차손 자산은 과세 분기
 *   (양도차익·장특 표)로 그려져, 집계 결과에 echo(`article89ExceptionApplied`)가 있어도 카드 어디에도 §156의2가 없었다(2026-11-23 실측).
 *   같은 사실의 단건 결과(`PartialExemptBasisCard`)·함께 양도 카드(#3605)는 줄을 그린다.
 *
 * | # | 사안(1주택 + 승계 입주권 · 양도 전 3년 이내 취득 §156의2③) | 주장 |
 * |---|---|---|
 * | M-1 | 15억 — 고가주택 부분 비과세 | echo §156의2 ③ · 펼친 카드에 줄 1개 |
 * | M-2 | 15억 + 취득가 16억(차손) | 같음 |
 * | M-3 | 8억 — 전액 비과세(#3599 분기) | 줄 1개 그대로(중복 없음) |
 * | M-4 | 짝 — 입주권 3년 초과 + 예외 없음 선언(§89② 배제 · 과세) | echo 없음 · 줄 없음 |
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
import { runMulti } from "./_helpers/single-multi-route-parity";
import { PropertyBreakdownAccordion } from "@/components/calc/results/MultiTransferPropertyBreakdown";

afterEach(() => cleanup());

const LABEL = "주택과 조합원입주권·분양권을 함께 보유한 세대의 §89② 예외";
const THREE = { label: LABEL, legalBasis: ["소득세법 시행령 §156의2 ③"] };
const TESTID = '[data-testid="calc-89-2-exception-basis"]';
const ADDR = "경상북도 구미시 송정동 1";
const right = (acquisitionDate: string) => ({
  id: "s", type: "redevelopment_right", acquisitionDate, region: "non_capital", memberOrigin: "successor",
});
const mk = (form: Record<string, unknown>): RulingCase =>
  ({ id: "x", docNo: "-", docDate: "-", basis: "era", today: "2023-10-16", summary: "x", bucket: "match", form }) as unknown as RulingCase;
const base = (price: string, acq = "500000000", top: Record<string, unknown> = {}) =>
  mk({
    isOneHousehold: true, transferDate: "2023-10-15", contractTotalPrice: price, houses: [], presaleRights: [right("2022-09-25")],
    asset: { assetKind: "housing", acquisitionDate: "2020-05-10", fixedAcquisitionPrice: acq, addressJibun: ADDR },
    ...top,
  });

async function multi(c: RulingCase) {
  let props: Record<string, unknown>[] = [];
  let form: ReturnType<typeof handoff> | undefined;
  await withToday(c.today, async () => {
    form = handoff(buildCaseForm(c));
    const m = await runMulti([form]);
    expect(m.status).toBe(200);
    props = m.props;
  });
  const p = props[0];
  const { container } = render(<PropertyBreakdownAccordion breakdown={p as never} property={{ propertyId: "p1", form } as never} />);
  fireEvent.click(container.querySelector(".cursor-pointer")!);
  return { p, lines: [...container.querySelectorAll(TESTID)].map((e) => e.textContent ?? "") };
}

describe("다건 카드 — 부분 비과세·차손 자산의 §89② 예외 근거", () => {
  it("M-1 15억 고가주택 부분 비과세 → 펼친 카드에 §156의2 ③ 줄", async () => {
    const { p, lines } = await multi(base("1500000000"));
    expect(p.isExempt).toBe(false);
    expect(p.isPartialExempt).toBe(true);
    expect(p.taxBaseShare).toBeGreaterThan(0);
    expect(p.article89ExceptionApplied).toEqual(THREE);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(LABEL);
    expect(lines[0]).toContain("§156의2");
  });

  it("M-2 15억 + 취득가 16억(차손) → 같은 줄", async () => {
    const { p, lines } = await multi(base("1500000000", "1600000000"));
    expect(p.isPartialExempt).toBe(true);
    expect(p.transferGain as number).toBeLessThan(0);
    expect(p.article89ExceptionApplied).toEqual(THREE);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(LABEL);
  });

  it("M-3 8억 전액 비과세 → 줄 1개(비과세 분기 그대로 · 중복 없음)", async () => {
    const { p, lines } = await multi(base("800000000"));
    expect(p.isExempt).toBe(true);
    expect(p.article89ExceptionApplied).toEqual(THREE);
    expect(lines).toHaveLength(1);
  });

  it("M-4 짝 — 입주권 3년 초과 + 예외 없음 선언(§89② 배제 · 과세) → echo·줄 없음", async () => {
    const { p, lines } = await multi(base("1500000000", "500000000", { presaleRights: [right("2019-06-01")], rightThreeYearExceptionKind: "none" }));
    expect(p.isExempt).toBe(false);
    expect(p.isPartialExempt).toBeFalsy();
    expect(p.article89ExceptionApplied).toBeUndefined();
    expect(lines).toEqual([]);
  });
});
