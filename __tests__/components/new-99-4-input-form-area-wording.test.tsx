/**
 * §99의4 입력 폼·결과 카드 문언 — NH-18(③ 비교 단위 시기별)·NH-19(고향 요건 「모두」)·NH-21(소재지 「취득 당시」·시기)·
 * NH-46(과세특례신고서)·NH-47(추징 「달의 말일」·부득이한 사유)·NH-70(§89①3호 효과와 §95③·§95② 단서 분리)
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { New994InputForm } from "@/components/calc/transfer/New994InputForm";
import { New994DetailCard } from "@/components/calc/results/transfer/New994DetailCard";

afterEach(cleanup);

const view = (type: "new_99_4_rural" | "new_99_4_hometown", acq: string, transfer: string | undefined) =>
  render(
    <New994InputForm
      value={
        {
          type,
          ruralHouseAcquisitionDate: acq,
          ruralHouseStdPrice: "",
          isRegisteredHanok: false,
          isAdjacentArea: false,
          meetsLocationRequirement: false,
          meetsHometownRequirement: false,
        } as never
      }
      onChange={() => {}}
      transferDate={transfer}
    />,
  );

const text = () => document.body.textContent ?? "";

describe("§99의4 폼 — ③ 비교 단위", () => {
  it("2026.1.1. 전 취득 농어촌: 「같은·연접 읍·면」을 묻고 읍·면·동이라 하지 않는다", () => {
    view("new_99_4_rural", "2015-03-01", "2024-06-01");
    expect(screen.getByText("일반주택과 같은·연접 읍·면")).toBeTruthy();
    expect(text()).not.toContain("읍·면·동");
    expect(text()).toContain("조특법 법률 제21223호 부칙 제42조");
  });
  it("2026.1.1. 이후 취득 농어촌: 「같은·연접 읍·면·동」", () => {
    view("new_99_4_rural", "2026-02-01", "2026-10-01");
    expect(screen.getByText("일반주택과 같은·연접 읍·면·동")).toBeTruthy();
  });
  it("2015.1.1. 전 양도: 「같은·연접 읍·면·시」", () => {
    view("new_99_4_rural", "2010-03-01", "2014-06-01");
    expect(screen.getByText("일반주택과 같은·연접 읍·면·시")).toBeTruthy();
  });
  it("양도일 미입력(2009~2025 취득): 단위를 정하지 않고 안내만", () => {
    view("new_99_4_rural", "2015-03-01", undefined);
    expect(screen.getByText("일반주택과 같은·연접 행정구역")).toBeTruthy();
  });
});

describe("§99의4 폼 — 소재지·고향 요건", () => {
  it("소재지: 「취득 당시」, 2021 전 취득은 지정지역, 2024 전 양도는 기회발전특구 문장 없음", () => {
    view("new_99_4_rural", "2015-03-01", "2023-06-01");
    expect(text()).toContain("취득 당시");
    expect(text()).toContain("지정지역");
    expect(text()).not.toContain("기회발전특구");
    expect(text()).toContain("가평군은 2025.3.21. 이후 양도분부터");
  });
  it("소재지: 2021 이후 취득·2024 이후 양도는 조정대상지역·기회발전특구", () => {
    view("new_99_4_rural", "2022-03-01", "2025-06-01");
    expect(text()).toContain("조정대상지역");
    expect(text()).toContain("기회발전특구");
  });
  it("고향 요건: 두 요건 모두 + 연접한 시 지역, 「또는 10년」 없음", () => {
    view("new_99_4_hometown", "2015-03-01", "2024-06-01");
    expect(text()).toContain("10년 이상 등재된 등록기준지이면서 10년 이상 거주한 사실이 있는 시 지역");
    expect(text()).toContain("두 요건을 모두 충족해야 합니다");
    expect(text()).not.toContain("또는 10년");
  });
});

describe("§99의4 폼 — 추징·신고 안내", () => {
  it("보유 3년 미만 경고: 달의 말일부터 2개월·부득이한 사유", () => {
    view("new_99_4_rural", "2023-01-01", "2024-06-01");
    expect(text()).toContain("달의 말일부터 2개월 이내");
    expect(text()).toContain("사망으로 인한 상속");
  });
  it("과세특례신고서 제출 안내 (조특법 §99의4⑦·조특령 §99의4⑩)", () => {
    view("new_99_4_rural", "2015-03-01", "2024-06-01");
    expect(text()).toContain("과세특례신고서");
    expect(text()).toContain("§99의4⑦");
  });
});

describe("§99의4 결과 카드", () => {
  it("§89①3호(비과세)와 §95③(고가주택)·§95② 단서(표 2)를 나눠 적고 과세특례신고서를 안내", () => {
    render(
      <New994DetailCard
        detail={
          {
            id: "new_99_4_rural",
            isEligible: true,
            legalBasis: "조특법 §99의4 (농어촌주택)",
            effectCategory: "house_count_exclusion",
            houseCountExclusion: 1,
            ruralHoldingYears: 9,
            clawbackWarning: false,
            surchargeNotAffected: true,
          } as never
        }
      />,
    );
    expect(text()).toContain("제95조제3항");
    expect(text()).toContain("제95조제2항 표 외의 부분 단서");
    expect(text()).not.toContain("제89조제1항제3호(비과세·고가주택");
    expect(text()).toContain("과세특례신고서");
  });
});
