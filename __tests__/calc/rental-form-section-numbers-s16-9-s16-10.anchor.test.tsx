/**
 * @vitest-environment jsdom
 *
 * S16-9 · S16-10 anchor — 조특법 임대 감면 입력 폼의 섹션 번호 배지가 **렌더 순서대로 ①②③… 연속**이다 (중복·역전·문자열 연결 없음).
 *
 * 결함(tsc가 못 잡는다 — `ToneCard sectionNum`이 `string | number`라 아무 값이나 받는다):
 *  - S16-9   `RentalCommonFields`가 「임대 종료 시점」 카드에 `sec4 + 1`을 넘겼다. `sec4`는 이미 원문자 문자열이라 덧셈이
 *            문자열 연결이 되어 「④1」로 떴다(§97의3·§97의5 감면을 고르면 항상).
 *  - S16-10  `Rental97MainInputForm`의 sectionOrder가 JSX 렌더 순서와 반대(단서 나목 index 2, §97①2호 index 3)라 단서(나)+1985년 이전
 *            신축 조합이 「① ② ④ ③ ⑤」로 떴다. `Rental972InputForm`은 「②」를 세 곳에 하드코딩해 유형을 고르면 「① ② ② ③ ④ ⑤」로 떴다.
 * 기존 B-1·B-2는 카드 **개수**만 봐서 이 결함을 못 잡았다 — 여기서는 **순서**를 단언한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Rental97MainInputForm } from "@/components/calc/transfer/rental/Rental97MainInputForm";
import { Rental972InputForm } from "@/components/calc/transfer/rental/Rental972InputForm";
import { Rental973InputForm } from "@/components/calc/transfer/rental/Rental973InputForm";
import { Rental974InputForm } from "@/components/calc/transfer/rental/Rental974InputForm";
import { Rental975InputForm } from "@/components/calc/transfer/rental/Rental975InputForm";

afterEach(cleanup);

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩";

/** DOM 순서대로 「번호 제목」 — ToneCard 헤더(번호 배지 span + 제목 p). 번호 배지는 원문자 한 글자만 인정한다(「④1」은 걸러지지 않고 잡힌다). */
function headers(c: HTMLElement): string[] {
  const out: string[] = [];
  c.querySelectorAll("span.rounded-full").forEach((s) => {
    const t = (s.textContent ?? "").trim();
    const title = (s.nextElementSibling?.textContent ?? "").trim();
    if (title) out.push(`${t} ${title}`);
  });
  return out;
}
const numbers = (hs: string[]) => hs.map((h) => h.split(" ")[0]);
const expectSequential = (hs: string[]) => {
  expect(hs.length).toBeGreaterThan(0);
  expect(numbers(hs)).toEqual(CIRCLED.slice(0, hs.length).split(""));
};

const noop = () => {};
const r97 = (v: Record<string, unknown>) =>
  headers(render(<Rental97MainInputForm value={{ type: "rental_97", ...v } as never} onChange={noop} />).container);
const r972 = (v: Record<string, unknown>) =>
  headers(render(<Rental972InputForm value={{ type: "rental_97_2", ...v } as never} onChange={noop} />).container);

describe("S16-9 「임대 종료 시점」 카드 번호 (hasGainProration)", () => {
  it("§97의3 — 공실 기간 ④ 다음 임대 종료 시점 ⑤", () => {
    const hs = headers(render(<Rental973InputForm value={{ type: "rental_97_3" } as never} onChange={noop} transferDate="2025-01-01" />).container);
    expect(hs.slice(-2)).toEqual(["④ 공실 기간", "⑤ 임대 종료 시점"]);
    expectSequential(hs);
  });
  it("§97의5 — 공실 기간 ④ 다음 임대 종료 시점 ⑤", () => {
    const hs = headers(render(<Rental975InputForm value={{ type: "rental_97_5" } as never} onChange={noop} transferDate="2025-01-01" />).container);
    expect(hs.slice(-2)).toEqual(["④ 공실 기간", "⑤ 임대 종료 시점"]);
    expectSequential(hs);
  });
  it("대조: hasGainProration 없는 §97의4는 임대 종료 시점 카드가 없고 연속이다", () => {
    const hs = headers(render(<Rental974InputForm value={{ type: "rental_97_4" } as never} onChange={noop} transferDate="2025-01-01" />).container);
    expect(hs.some((h) => h.includes("임대 종료 시점"))).toBe(false);
    expectSequential(hs);
  });
});

describe("S16-10 §97 폼 번호", () => {
  it("단서 (나) b_purchase + 1984 신축 — §97①2호 → 단서 나목 순으로 ③ ④", () => {
    const hs = r97({ type: "rental_97_proviso", provisoCase: "b_purchase", constructionYear: "1984" });
    expectSequential(hs);
    expect(hs.find((h) => h.includes("§97①2호 요건"))?.[0]).toBe("③");
    expect(hs.find((h) => h.includes("단서 나목 요건"))?.[0]).toBe("④");
  });
  it("대조: 단서 (나) + 1990 신축(§97①2호 카드 없음) / 비단서 + 1984 / 비단서 + 1990 / 단서 (가)", () => {
    expectSequential(r97({ type: "rental_97_proviso", provisoCase: "b_purchase", constructionYear: "1990" }));
    expectSequential(r97({ constructionYear: "1984" }));
    expectSequential(r97({ constructionYear: "1990" }));
    expectSequential(r97({ type: "rental_97_proviso", provisoCase: "a_construction", constructionYear: "1984" }));
  });
});

describe("S16-10 §97의2 폼 번호", () => {
  it("construction — 유형 ② 다음 1호 나목 ③ (② 중복 없음)", () => {
    const hs = r972({ rental972Type: "construction" });
    expectSequential(hs);
    expect(hs.find((h) => h.includes("1호 나목 요건"))?.[0]).toBe("③");
  });
  it("purchase — 유형 ② 다음 2호 요건 ③", () => {
    const hs = r972({ rental972Type: "purchase" });
    expectSequential(hs);
    expect(hs.find((h) => h.includes("2호 요건"))?.[0]).toBe("③");
  });
  it("대조: 유형 미선택은 ① ② ③ ④ 연속(유형 조건부 카드 없음)", () => {
    const hs = r972({});
    expectSequential(hs);
    // §97의2는 임대료 증액 요건이 없어 그 카드를 그리지 않는다(2026-11-01, `hasRentIncreaseRule`) — 종전 5장
    expect(hs).toHaveLength(4);
    expect(hs.some((h) => h.includes("임대료 증액 제한"))).toBe(false);
  });
});
