/**
 * @vitest-environment jsdom
 *
 * ② 「상장일 이후 1개월 종가」 — 입력 방식 축(direct ↔ daily)
 *
 * 제보(2026-09-02, 이미지 30): ①의 「입력 방식」 옵션 단추 효과를 ②에도 달라.
 *
 * ## 종전에는 ②의 입력 경로가 ③의 «자료 선택»에 종속돼 있었다
 *
 *   unlistedDetailMode = simple            → ②는 단일 숫자
 *   unlistedDetailMode = full/listing_only → ②는 32셀 표
 *
 * 「평가액은 갖고 있는데 종가는 일자별로 넣고 싶다」가 표현되지 않았다.
 * ⇒ simple 모드 «안»에 ②의 자기 축 `listingStdInputMode`를 둔다.
 *
 * ## 왜 full/listing_only에는 라디오를 두지 않는가
 *
 * 그 두 모드는 «결산서와 종가표를 갖고 있다»는 선언이라 종가도 항상 일자별이다.
 * 라디오를 두면 6조합이 되고, 그중 `full + direct`는 **엔진 변경**을 부른다 —
 * `post-listing-flat-adapter.ts`의 full 분기가 `listingDatePriceAvg1Month`를
 * 무조건 합성값으로 덮어써서 표가 비면 직접 입력값이 **조용히 0**이 된다.
 */

import "fake-indexeddb/auto";
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PostListingValuationCard } from "@/components/calc/stock-transfer/PostListingValuationCard";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-form";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

afterEach(cleanup);

const T1 = "양도 당시 기준시가";
const T2 = "상장일 이후 1개월 종가";

function renderCard(patch: Partial<StockTransferFormData> = {}) {
  const form = {
    ...createInitialStockFormData(),
    marketType: "kosdaq",
    acquiredBeforeListing: true,
    transferDate: "2025-06-10",
    listingDate: "2009-08-23",
    ...patch,
  } as StockTransferFormData;
  render(<PostListingValuationCard form={form} onChange={vi.fn()} />);
}

/** 섹션 제목으로 그 섹션 카드를 집는다 (제목은 정확 일치 — 표 제목은 더 길어 걸리지 않는다) */
function section(title: string): HTMLElement {
  const el = screen.getByText(title).closest("div.rounded-lg");
  expect(el).toBeTruthy();
  return el as HTMLElement;
}

const radio = (name: string) => document.querySelector(`input[name="${name}"]`);

describe("LS — ② 상장일 이후 1개월 종가의 입력 방식 축", () => {
  it("LS-1 simple — ② «안»에 자기 라디오가 있다 (①의 축과 별개다)", () => {
    renderCard({ unlistedDetailMode: "simple" });

    const own = radio("listingStdInputMode");
    expect(own).toBeTruthy();
    // 🔑 소속을 단언한다 — 두 축은 라벨이 「입력 방식」으로 같아서
    //    이름만 보면 어느 섹션 것인지 갈리지 않는다.
    expect(section(T2).contains(own!)).toBe(true);
    expect(section(T1).contains(own!)).toBe(false);
    // ①의 축은 여전히 ① 안에 있다
    const transferAxis = radio("transferStdInputMode")!;
    expect(section(T1).contains(transferAxis)).toBe(true);
    expect(section(T2).contains(transferAxis)).toBe(false);
  });

  it("LS-2 simple + direct — 단일 숫자만. 종가 표·자본조정은 없다", () => {
    renderCard({ unlistedDetailMode: "simple", listingStdInputMode: "direct" });
    const s2 = section(T2);

    const labels = Array.from(s2.querySelectorAll("label")).map((l) => (l.textContent ?? "").trim());
    expect(labels.some((t) => t.includes("상장일 이후 1개월 종가평균"))).toBe(true);
    expect(s2.textContent).not.toContain("평가기간 중 증자·합병 발생");
    expect(s2.textContent).not.toContain("휴일·주말은 빈칸으로 두면 자동 제외");
  });

  it("LS-3 simple + daily — 종가 표 + 자본조정이 뜨고 단일 숫자 칸은 사라진다", () => {
    renderCard({ unlistedDetailMode: "simple", listingStdInputMode: "daily" });
    const s2 = section(T2);

    expect(s2.textContent).toContain("휴일·주말은 빈칸으로 두면 자동 제외");
    // 자본조정은 §165⑤ 평가기간을 절단해 **종가평균**을 바꾼다 — daily에서 반드시 함께 온다.
    // simple 모드는 postListingDetail을 보내지 않아 엔진이 절단을 대신해줄 수 없기 때문이다.
    expect(s2.textContent).toContain("평가기간 중 증자·합병 발생");

    const labels = Array.from(s2.querySelectorAll("label")).map((l) => (l.textContent ?? "").trim());
    expect(labels.some((t) => t.includes("상장일 이후 1개월 종가평균"))).toBe(false);
  });

  it("LS-4 full — 라디오가 없고 표로 고정된다 (축이 의미를 갖지 않는다)", () => {
    renderCard({ unlistedDetailMode: "full" });
    expect(radio("listingStdInputMode")).toBeNull();
    expect(section(T2).textContent).toContain("휴일·주말은 빈칸으로 두면 자동 제외");
  });

  it("LS-5 full — listingStdInputMode가 direct로 남아 있어도 표가 뜬다 (stale 값에 지배당하지 않는다)", () => {
    // simple+direct로 쓰다가 「재무제표로 계산」으로 바꾼 사용자. 축 값은 direct로 남는다.
    renderCard({ unlistedDetailMode: "full", listingStdInputMode: "direct" });
    const s2 = section(T2);
    expect(s2.textContent).toContain("휴일·주말은 빈칸으로 두면 자동 제외");
    const labels = Array.from(s2.querySelectorAll("label")).map((l) => (l.textContent ?? "").trim());
    expect(labels.some((t) => t.includes("상장일 이후 1개월 종가평균"))).toBe(false);
  });

  /**
   * 🔑 **읽기 지점을 직접 건다.** 화면 미리보기가 헬퍼를 부르지 않고 옛 필드를 그대로
   *    읽으면 「표에 넣은 값과 다른 평균」이 보인다 — 사용자에게 가장 먼저 보이는 자리다.
   */
  it("LS-7 simple + daily — 환산 미리보기가 표에서 산정한 평균을 쓴다", () => {
    renderCard({
      unlistedDetailMode: "simple",
      listingStdInputMode: "daily",
      listingDatePriceAvg1Month: "8001", // ← 옛 필드를 읽으면 8,001이 보인다
      listingPriceDates: ["2009-08-24", "2009-08-25", "2009-08-26", "2009-08-27", "2009-08-28"],
      listingPriceClosing: ["10000", "10000", "10000", "20000", "20000"],
    });
    const preview = screen.getByText("환산취득가 미리보기").closest("div.rounded-lg")!;
    expect(preview.textContent).toContain("14,000");
    expect(preview.textContent).not.toContain("8,001");
  });

  it("LS-6 안쪽 표가 자기 번호 배지를 달지 않는다 (바깥 ①②③과 겹치지 않게)", () => {
    renderCard({ unlistedDetailMode: "simple", listingStdInputMode: "daily" });
    const s2 = section(T2);
    // 섹션 헤더의 "2" 배지 하나만 남는다 — 표가 "1" 배지를 달면 ② 안에 1이 보인다
    const badges = Array.from(s2.querySelectorAll("span")).filter(
      (el) => (el.textContent ?? "").trim() === "1" && el.className.includes("rounded-full"),
    );
    expect(badges).toHaveLength(0);
  });
});
