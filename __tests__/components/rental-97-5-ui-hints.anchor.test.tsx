/**
 * @vitest-environment jsdom
 *
 * anchor — §97의5 교재 대조 PR-C 화면 문구 (rental-97-5-textbook-gaps.plan.md §3.4~§3.6 · §4.4)
 *
 * 세액 변경 없음 — 문구 존재만 고정한다.
 * - #4 등록일 라벨 「장기일반·공공지원 민간임대주택 등록일」 + 단기→장기 변경 신고 수리일 안내
 * - #5 국민주택규모 질문에 다가구 가구당 전용면적 안내 (§97의3·§97의5 두 폼)
 * - #6 취득 유형 안내에 상속 + 3개월 기산일
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { Rental973InputForm } from "@/components/calc/transfer/rental/Rental973InputForm";
import { Rental975InputForm } from "@/components/calc/transfer/rental/Rental975InputForm";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";

afterEach(cleanup);

const render975 = () =>
  render(
    <Rental975InputForm
      value={getReductionDefault("rental_97_5") as Parameters<typeof Rental975InputForm>[0]["value"]}
      onChange={() => {}}
      acquisitionDate="2016-03-10"
      transferDate="2029-12-01"
      assetContractDate=""
    />,
  );

describe("§97의5 폼", () => {
  it("#4 등록일 라벨은 장기일반·공공지원 등록일이고, 변경 신고 수리일을 안내한다", () => {
    render975();
    expect(screen.getByText("장기일반·공공지원 민간임대주택 등록일")).toBeTruthy();
    expect(screen.queryByText("지자체 임대사업자 등록일")).toBeNull();
    expect(screen.getByText(/변경 신고 수리일을 넣으세요/)).toBeTruthy();
  });

  it("#5 국민주택규모 질문에 다가구 가구당 전용면적 안내", () => {
    render975();
    expect(screen.getByText(/다가구주택은 전체 면적 합이 아니라 가구당 전용면적으로 판정/)).toBeTruthy();
  });

  it("#6 취득 유형 안내에 상속과 3개월 기산일", () => {
    render975();
    expect(screen.getByText(/상속·증여·분양으로 취득한 주택도 매입임대입니다/)).toBeTruthy();
    expect(screen.getByText("3개월은 자산 카드의 취득일(상속은 상속개시일, 증여는 증여일)부터 셉니다.")).toBeTruthy();
    expect(screen.getByText("매입임대 (매매·상속·증여·분양 등으로 취득)")).toBeTruthy();
  });
});

describe("§97의3 폼", () => {
  it("#5 국민주택규모 질문에 다가구 가구당 전용면적 안내", () => {
    render(
      <Rental973InputForm
        value={getReductionDefault("rental_97_3") as Parameters<typeof Rental973InputForm>[0]["value"]}
        onChange={() => {}}
        acquisitionDate="2016-03-10"
        transferDate="2029-12-01"
        assetContractDate=""
      />,
    );
    expect(screen.getByText(/다가구주택은 전체 면적 합이 아니라 가구당 전용면적으로 판정/)).toBeTruthy();
  });
});
