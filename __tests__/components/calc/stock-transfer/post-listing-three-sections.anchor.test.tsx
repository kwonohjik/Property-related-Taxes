/**
 * @vitest-environment jsdom
 *
 * 「취득 후 상장 — 환산취득가」 카드 — **산식의 항 = 화면의 섹션**, 번호 = **계산 소비 순서**.
 *
 * 제보(2026-09-02): 「환산 입력 방식 이후로는 그 옵션 버튼이 뭐하는 것인지 많이 헷갈려」.
 * 원인은 화면이 평평했던 것이다. ⇒ ①②③ 번호 섹션 + 스위치 최상단으로 정리했다.
 *
 * 제보(2026-09-10): 「환산 입력 방식과 양도 당시 기준시가 토글 위치가 이어지는 입력 화면과
 * 순서가 맞지 않는다」. 남은 원인은 **스위치와 그 지배 대상이 인접하지 않는 것**이었다 —
 * 「환산 입력 방식」은 종가 축과 평가액 축을 바꾸는데, 그 둘과 스위치 사이에 **그 선택과
 * 무관한** 「양도 당시 기준시가」가 끼어 있었다(당시 ①).
 *
 * ⇒ 섹션을 **계산이 소비하는 순서**로 재배치하고 번호를 다시 부여한다:
 *
 *   1주당 취득기준시가 = ①상장일 이후 1개월 종가평균 × (②취득연도 평가 ÷ ②상장연도 평가)
 *   환산취득가        = 양도가 × (1주당 취득기준시가 ÷ ③양도 당시 기준시가)
 *
 *   「환산 입력 방식」  = ①·②를 동시에 바꾸는 스위치  → 최상단 (아래가 전부 지배 대상)
 *   「평가액 입력 방식」= ② 안의 하위 토글 (simple 전용) → ② 안으로
 *
 * 시간순(상장일 → 상장·취득연도 평가 → 양도일)과도 일치한다.
 *
 * ⚠️ 자본조정(PostListingCapitalEventSection)은 **①**이다 — 평가기간을 절단해 종가평균을
 *    바꾼다(상증령 §52의2②2호 준용 해석). ②(평가액)로 옮기면 안 된다.
 *
 * ## 🔄 S3 (2026-09-10) — 세 섹션이 **두 섹션**이 됐다
 *
 * ③ 「양도 당시 기준시가」(분모)는 이 카드 밖으로 나가 `TransferStdPriceSection`이 됐다 —
 * 같은 값의 입력 UI가 일반 경로에도 있어 **두 곳**이었기 때문이다(계획서 §1-2).
 * 그 섹션을 지키는 anchor는 `post-listing-transfer-std-section.anchor.test.tsx`로 이관했다.
 *
 * 남은 ①② 두 섹션이 §165⑤ 산식(`①종가평균 × ②비율`)의 두 항이다.
 */

import "fake-indexeddb/auto";
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PostListingValuationCard } from "@/components/calc/stock-transfer/PostListingValuationCard";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-form";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

afterEach(cleanup);

function renderCard(patch: Partial<StockTransferFormData> = {}) {
  const form = {
    ...createInitialStockFormData(),
    marketType: "kosdaq",
    acquisitionStdMode: "post_listing",
    ...patch,
  } as StockTransferFormData;
  render(<PostListingValuationCard form={form} onChange={vi.fn()} />);
}

/** 제목으로 섹션 카드를 집는다 */
function section(title: string): HTMLElement {
  const el = screen.getByText(title).closest("div.rounded-lg");
  expect(el).toBeTruthy();
  return el as HTMLElement;
}

// ① 제목은 조문 표현이다 — §165⑤은 「상장일 이후 1개월간 … 최종시세가액의 평균액」이라 쓴다.
// 「상장 당시 기준시가」로 부르면 안 된다: 법이 상장 시점 가액을 부르는 이름은
// 「상장일 현재의 **제4항에 따른 평가액**」이고 그것은 ②다(§165⑤ 후단).
const T1 = "상장일 이후 1개월 종가";
const T2 = "상장연도·취득연도 평가액";

describe("SEC — 산식의 항 = 화면의 섹션", () => {
  it("SEC-1 두 섹션이 ①② 번호 배지를 달고 이 순서로 놓인다", () => {
    renderCard();
    for (const [t, n] of [[T1, "1"], [T2, "2"]] as const) {
      const header = screen.getByText(t).parentElement!;
      expect(header.textContent).toContain(n);
    }
    const order = [T1, T2].map((t) => screen.getByText(t));
    expect(order[0].compareDocumentPosition(order[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("SEC-1b 분모(양도 당시 기준시가)는 이 카드 «밖»이다 (S3 이관)", () => {
    renderCard();
    /*
      산식 박스는 분모를 «언급»한다(`<Frac bottom="양도 당시 기준시가">`) — 그건 남아야 한다.
      없어야 하는 것은 **입력 섹션**이다. 그래서 «번호 배지를 단 섹션 제목»과 **입력 축**으로 본다.
    */
    const sectionTitles = Array.from(document.querySelectorAll("p.font-semibold")).map(
      (el) => el.textContent ?? "",
    );
    expect(sectionTitles.some((t) => t.includes("양도 당시 기준시가"))).toBe(false);
    expect(document.querySelector('input[name="transferStdInputMode"]')).toBeNull();
  });

  it("SEC-2 산식 박스가 같은 번호로 각 항을 가리킨다 (화면↔산식 1:1)", () => {
    renderCard();
    expect(screen.getByText(/①상장일 이후 1개월 종가평균/)).toBeTruthy();
    // 분수 표기(`<Frac>`)로 분자·분모가 각각 span에 들어간다 — 인라인 `÷` 문자열로 매칭되지 않는다.
    expect(screen.getByText("②취득연도 평가")).toBeTruthy();
    expect(screen.getByText("②상장연도 평가")).toBeTruthy();
    // 분모는 이 카드 밖이라 번호 없이 이름만 남는다
    expect(screen.getByText("양도 당시 기준시가")).toBeTruthy();
  });

  it("SEC-3 「환산 입력 방식」은 두 섹션보다 **위**에 있다 (카드 전체 스위치)", () => {
    renderCard();
    const sw = document.querySelector('input[name="unlistedDetailMode"]')!;
    const first = screen.getByText(T1);
    expect(sw.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // 어느 섹션에도 속하지 않는다
    expect(section(T1).contains(sw)).toBe(false);
    expect(section(T2).contains(sw)).toBe(false);
  });

  it("SEC-4 「평가액 입력 방식」은 ② 안에 있다 (하위 토글임이 드러난다)", () => {
    renderCard({ unlistedDetailMode: "simple" });
    const sub = document.querySelector('input[name="simpleValueInputMode"]')!;
    expect(section(T2).contains(sub)).toBe(true);
    expect(section(T1).contains(sub)).toBe(false);
  });

  it("SEC-5 simple — 상장일과 상장일 이후 1개월 종가평균이 ① 안에 있다", () => {
    renderCard({ unlistedDetailMode: "simple" });
    const s1 = section(T1);
    const labels = Array.from(s1.querySelectorAll("label")).map((l) =>
      (l.textContent ?? "").replace("*", "").trim()
    );
    expect(labels).toContain("상장일");
    expect(labels.some((t) => t.includes("상장일 이후 1개월 종가평균"))).toBe(true);
  });

  it("SEC-6 simple — 상장연도·취득연도 평가 입력이 ② 안에 있다", () => {
    renderCard({ unlistedDetailMode: "simple", simpleValueInputMode: "direct" });
    const s2 = section(T2);
    expect(s2.textContent).toContain("상장연도 비상장 보충적 평가");
    expect(s2.textContent).toContain("취득연도 비상장 보충적 평가");
    expect(section(T1).textContent).not.toContain("취득연도 비상장 보충적 평가");
  });

  it("SEC-7 full — 종가 표와 자본조정은 ①, 결산서는 ② (경계가 갈린다)", () => {
    renderCard({ unlistedDetailMode: "full" });
    const s1 = section(T1);
    const s2 = section(T2);
    // 증자·합병 기간절단 토글은 ① — 평가기간을 잘라 **종가평균**을 바꾼다(상증령 §52의2②2호 준용).
    expect(s1.textContent).toContain("평가기간 중 증자·합병 발생");
    expect(s2.textContent).not.toContain("평가기간 중 증자·합병 발생");
    // 두 계산서는 ② — 평가액을 만든다
    expect(s2.textContent).toContain("순손익 계산서");
    expect(s2.textContent).toContain("순자산가액 계산서");
    expect(s1.textContent).not.toContain("순손익 계산서");
    expect(s1.textContent).not.toContain("순자산가액 계산서");
  });

  /*
    SEC-8 — 제보 2026-09-10의 본체. 「환산 입력 방식」 **아래에 오는 섹션은 전부 그 스위치의
    지배 대상**이어야 한다. 무관한 「양도 당시 기준시가」가 스위치와 지배 대상 사이에 끼면
    스위치를 고른 직후 나오는 칸이 그 선택과 상관없는 칸이 된다.
    뮤테이션: 세 섹션 순서를 예전(양도 → 상장 → 평가)으로 되돌리면 이 단언이 깨진다.
  */
  /**
   * 🔄 **S3에서 성질이 더 강해졌다.** 종전에는 「무관한 ③이 지배 대상보다 아래에 있다」였다.
   * 분모가 카드 밖으로 나가면서 **이 카드 안에는 지배 대상만 남는다** — 더 단순한 계약이다.
   */
  it("SEC-8 「환산 입력 방식」 아래에는 그 스위치가 지배하는 축만 있다", () => {
    renderCard({ unlistedDetailMode: "simple" });
    expect(section(T1).querySelector('input[name="listingStdInputMode"]')).toBeTruthy();
    expect(section(T2).querySelector('input[name="simpleValueInputMode"]')).toBeTruthy();
    // 무관한 축은 이 카드에 없다
    expect(document.querySelector('input[name="transferStdInputMode"]')).toBeNull();
  });
});
