// @vitest-environment jsdom
/**
 * ⑦ 결과카드 회귀 anchor — raw → 엔진 input → judgment → NonBusinessLandResultCard 렌더
 *
 * 입력 도달(본 작업) 후 판정 상세가 채워져 카드가 실데이터로 렌더됨을 확인.
 * 카드 자체는 무변경 — 회귀 가드.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { NonBusinessLandResultCard } from "@/components/calc/NonBusinessLandResultCard";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import {
  judgeNonBusinessLand,
  DEFAULT_NON_BUSINESS_LAND_RULES,
} from "@/lib/tax-engine/non-business-land";

describe("[NBL-CARD] ⑦ 판정 상세 렌더 (raw→engine→judgment→card)", () => {
  it("forest 정밀판정 입력 → 카드가 판정 요약·사유를 렌더", () => {
    const input = buildNblEngineInput({
      nblUseDetailedJudgment: true,
      nblLandType: "forest",
      nblZoneType: "agriculture_forest",
      acquisitionArea: "1000",
      acquisitionDate: "2018-01-01",
      transferDate: "2026-06-01",
      nblForestHasPlan: true,
    } as never);
    expect(input).toBeDefined();

    const judgment = judgeNonBusinessLand(input!, DEFAULT_NON_BUSINESS_LAND_RULES);
    const { container } = render(<NonBusinessLandResultCard judgment={judgment} />);

    // 요약 배너 — 비사업용/사업용 중 하나의 판정 문구가 렌더됨
    expect(container.textContent).toMatch(/비사업용 토지|사업용 토지/);
    // 판정 사유가 실데이터로 채워짐 (빈 문자열 아님)
    expect(judgment.judgmentReason.length).toBeGreaterThan(0);
  });

  it("재촌 echo: 농지 + 거주지 30km 이내 → 카드에 재촌 인정 근거(직선거리 30km) 렌더", () => {
    const input = buildNblEngineInput({
      nblUseDetailedJudgment: true,
      nblLandType: "farmland",
      nblZoneType: "general_residential",
      acquisitionArea: "1000",
      acquisitionDate: "2018-01-01",
      transferDate: "2026-06-01",
      nblLandSigunguCode: "11110",
      nblLandLat: "37.5665",
      nblLandLng: "126.978",
      nblResidenceHistories: [
        {
          sigunguCode: "99999", // 비동일·비연접
          sigunguName: "타지역",
          startDate: "2018-01-01",
          endDate: "2020-01-01",
          hasResidentRegistration: true,
          lat: "37.4563", // 인천 ≈27km
          lng: "126.7052",
        },
      ],
    } as never);
    const judgment = judgeNonBusinessLand(input!, DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(judgment.residenceMatch?.matchType).toBe("within_30km");

    const { container } = render(<NonBusinessLandResultCard judgment={judgment} />);
    expect(container.textContent).toMatch(/재촌 인정 근거/);
    expect(container.textContent).toMatch(/직선거리 30km 이내/);
  });

  it("F3: 목장 기준면적 초과 → 부분안분 안내문(비사업용 비율·목장 §168의10③·기타토지 §168의11①) 렌더", () => {
    const input = buildNblEngineInput({
      nblUseDetailedJudgment: true,
      nblLandType: "pasture",
      nblZoneType: "residential",
      // 🔴 축종 코드를 정본 키(`hanwoo_breeding`)로 정정 (E2-03, 2026-09-02 코드리뷰).
      //    종전 `"hanwoo"`는 별표 1의3에 없는 코드라 자동산출이 **0**을 냈고, 그 0이 기준면적으로
      //    채택되어 토지 전량이 초과분이 되는 **버그에 의존해** 이 케이스가 성립하고 있었다.
      //    이제 미등재 축종은 면적기준을 적용하지 않으므로 유효 축종으로 초과를 만든다.
      acquisitionArea: "100000", // 한우 번식우 100두 기준면적 초과
      acquisitionDate: "2020-01-01",
      transferDate: "2025-01-01",
      nblPastureIsLivestockOperator: true,
      nblPastureLivestockType: "hanwoo_breeding",
      nblPastureLivestockCount: "100",
    } as never);
    const judgment = judgeNonBusinessLand(input!, DEFAULT_NON_BUSINESS_LAND_RULES);
    const { container } = render(<NonBusinessLandResultCard judgment={judgment} />);
    expect(judgment.areaProportioning).toBeDefined();
    expect(container.textContent).toMatch(/기준면적 초과분/);
    expect(container.textContent).toMatch(/§168의10③/);
    expect(container.textContent).toMatch(/§168의11①/);
    expect(container.textContent).not.toMatch(/§168의11⑤⑥/);
  });
});
