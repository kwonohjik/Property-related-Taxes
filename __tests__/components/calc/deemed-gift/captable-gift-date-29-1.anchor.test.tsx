/**
 * 「상증령」§29① 호별 구분일 안내 — **다주주(cap-table) 모드**에도 단건과 같이 붙는가.
 *
 * 착수 전 실측(2026-09-29): §29① 세 갈래 안내는 리뷰 4단계(#36·#107·#65)에서 `GIFT_DATE_LABEL`에
 *   단건 증자(`capital_increase`)·전환주식(`convertible_stock`)만 등록됐다. 다주주 모드
 *   (`capital_increase_allocation`)는 같은 §39 증자인데 목록에 없어 증여일 칸이 기본값
 *   「증여일 / 증여시기·적정이자율 연도 기준」(§41의4 무이자 대출용 문구)으로 떴고, #95 시점 고지
 *   (`CiGiftDateEraNotice` — 2016.2.5. 전 증여일은 구 §29④)도 없었다. 그런데 cap-table 엔진은 이 날짜로
 *   §29③ 간주모집 시기 게이트와 적용 법령 기준일(#37)을 판정한다.
 *   ⚠️ 구분일은 **자동 판정하지 않는다**(상장 주주배정 여부는 사실관계) — 안내만 같게 한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DeemedDetailModal } from "@/components/calc/deemed-gift/DeemedDetailModal";
import { CapitalIncreaseAllocationFields } from "@/components/calc/deemed-gift/capital-forms";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/shared";

afterEach(cleanup);

const modal = (type: DeemedFormState["type"]) =>
  render(<DeemedDetailModal open onOpenChange={() => {}} form={{ ...INITIAL_DEEMED, type }} set={() => {}} />);

describe("[CT291] 다주주 모드 증여일 — §29① 세 갈래 안내", () => {
  it("[CT291-1] 라벨·안내가 단건 증자와 같다(권리락일 / 납입일 / 신주인수권증서 교부일 · 코넥스)", () => {
    modal("capital_increase_allocation");
    expect(screen.getByText("증여일 — 권리락일 또는 주식대금 납입일 (§29①)")).toBeInTheDocument();
    expect(screen.getByText(/신주인수권증서를 교부받았다면 그 교부일/)).toBeInTheDocument();
    expect(screen.queryByText("증여시기·적정이자율 연도 기준")).toBeNull();
  });

  it("[CT291-1+] 짝 — 단건 증자는 종전 그대로, 무관한 유형(무이자 대출)은 기본 라벨", () => {
    modal("capital_increase");
    expect(screen.getByText("증여일 — 권리락일 또는 주식대금 납입일 (§29①)")).toBeInTheDocument();
    cleanup();
    modal("free_loan");
    expect(screen.getByText("증여시기·적정이자율 연도 기준")).toBeInTheDocument();
  });
});

describe("[CT291] 다주주 모드 — #95 시점 고지", () => {
  const at = (giftDate: string) =>
    render(<CapitalIncreaseAllocationFields form={{ ...INITIAL_DEEMED, type: "capital_increase_allocation", giftDate }} set={() => {}} />);

  it("[CT291-2] 2015-02-02 → 구 §29④ 단항(주식대금 납입일) 고지", () => {
    at("2015-02-02");
    expect(screen.getByTestId("ci-gift-date-era-notice")).toHaveTextContent("주식대금 납입일");
  });

  it("[CT291-2+] 짝 — 2016-02-05부터는 현행 §29①이라 고지 없음", () => {
    at("2016-02-05");
    expect(screen.queryByTestId("ci-gift-date-era-notice")).toBeNull();
  });
});
