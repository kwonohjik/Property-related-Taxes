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
});
