/**
 * anchor U-6 — 비사업용 토지 판정 메뉴의 이력 등록 (계획서 `nbl-judgment-menu.ui.plan.md` §8)
 *
 * 등록 지점: 세목 목록·경로·라벨·제목·dedup 키·필터·카드 「판정:」 줄·드로어 머리·요약 · 판정 술어(`nblVerdictOf`) 단일 소스.
 * (이력 재개는 store가 있는 PR-3 에서 `nbl-judgment-resume.anchor.test.tsx`가 맡는다.)
 */
import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { LOCAL_TAX_TYPES } from "@/lib/storage/types";
import type { CalculationRecord } from "@/lib/storage/types";
import { TAX_TYPE_ROUTES } from "@/lib/storage/tax-type-routes";
import { TAX_LABEL, generateTitle } from "@/lib/storage/title-generator";
import { extractBusinessKey } from "@/lib/storage/business-key";
import { FILTER_OPTIONS } from "@/app/history/HistoryClient";
import { HistoryDetailDrawer, extractResultSummaryItems } from "@/components/history/HistoryDetailDrawer";
import { nblVerdictFromResult, nblVerdictLabel, nblVerdictOf } from "@/lib/calc/nbl-judgment-verdict";
import { CARD_CASES, jsonRound, judgeFromAsset } from "../../components/_helpers/nbl-judgment-fixtures";

afterEach(cleanup);

const input = { assets: [{ addressRoad: "서울 강남구 테헤란로 1" }], transferDate: "2026-06-01" };

describe("비사업용 토지 판정 — 세목 등록", () => {
  it("[NH-1] 세목·경로·라벨·필터가 등록돼 있다", () => {
    expect(LOCAL_TAX_TYPES).toContain("non_business_land_judgment");
    expect(TAX_TYPE_ROUTES.non_business_land_judgment).toBe("/calc/non-business-land");
    expect(TAX_LABEL.non_business_land_judgment).toBe("비사업용 토지 판정");
    expect(FILTER_OPTIONS.find((o) => o.value === "non_business_land_judgment")?.label).toBe("비사업용 토지 판정");
  });

  it("[NH-2] 제목이 판정 메뉴임을 드러내고 날짜를 「양도예정」으로 적는다", () => {
    const title = generateTitle("non_business_land_judgment", input, "2026-11-25T00:00:00.000Z");
    expect(title).toBe("비사업용 토지 판정 — 서울 강남구 테헤란로 1 (양도예정 2026.06.01)");
    expect(generateTitle("non_business_land_judgment", { transferDate: "2026-06-01" }, "2026-11-25T00:00:00.000Z"))
      .toBe("비사업용 토지 판정 — 양도예정 2026.06.01");
    // 입력이 없으면 공용 폴백(저장일)으로 떨어진다 — 「양도예정」을 지어내지 않는다.
    expect(generateTitle("non_business_land_judgment", {}, "2026-11-25T00:00:00.000Z")).not.toContain("양도예정");
  });

  it("[NH-3] businessKey = 주소+예정일 · 주소가 없으면 만들지 않는다 · 예정일이 다르면 별개 record", () => {
    expect(extractBusinessKey("non_business_land_judgment", input)).toBe("addr:서울 강남구 테헤란로 1|2026.06.01");
    expect(extractBusinessKey("non_business_land_judgment", { transferDate: "2026-06-01" })).toBeNull();
    expect(extractBusinessKey("non_business_land_judgment", input)).not.toBe(
      extractBusinessKey("non_business_land_judgment", { ...input, transferDate: "2027-06-01" }),
    );
  });
});

describe("비사업용 토지 판정 — 결론 술어 (단일 소스)", () => {
  it("[NH-4] 사업용·비사업용·일부 비사업용을 엔진 echo로 가른다(요건을 다시 따지지 않는다)", () => {
    expect(nblVerdictOf(judgeFromAsset(CARD_CASES.businessFarmSelf.over)).label).toBe("사업용");
    expect(nblVerdictOf(judgeFromAsset(CARD_CASES.nonBusinessVacant.over)).label).toBe("비사업용");
    // UV-5 실측 — 주택 부수토지 배율 초과: isNonBusinessLand=true · nonBusinessRatio=0.5
    const partial = judgeFromAsset(CARD_CASES.housingArea.over);
    expect(partial.isNonBusinessLand).toBe(true);
    expect(partial.areaProportioning?.nonBusinessRatio).toBe(0.5);
    expect(nblVerdictOf(partial)).toMatchObject({ label: "일부 비사업용", tone: "amber" });
    expect(nblVerdictOf(partial).detail).toContain("50.0%");
    // 무조건 의제 = 사업용
    const exempt = CARD_CASES.unconditionalExempt;
    expect(nblVerdictOf(judgeFromAsset(exempt.over, exempt.transferDate)).label).toBe("사업용");
  });

  it("[NH-5] 안분 비율 0·1은 부분이 아니다 — 경계", () => {
    expect(nblVerdictOf({ isNonBusinessLand: true, areaProportioning: { nonBusinessRatio: 1 } }).label).toBe("비사업용");
    expect(nblVerdictOf({ isNonBusinessLand: true, areaProportioning: { nonBusinessRatio: 0 } }).label).toBe("비사업용");
    expect(nblVerdictOf({ isNonBusinessLand: false, areaProportioning: { nonBusinessRatio: 0.5 } }).label).toBe("사업용");
    expect(nblVerdictOf({ isNonBusinessLand: true, areaProportioning: null }).label).toBe("비사업용");
    expect(nblVerdictOf({}).label).toBe("사업용"); // isNonBusinessLand 누락 = 비사업용 단정 금지
  });

  it("[NH-6] resultData(JSON 왕복) — 판정 전이면 null · 라벨 \"-\"", () => {
    const j = jsonRound(judgeFromAsset(CARD_CASES.nonBusinessVacant.over));
    expect(nblVerdictFromResult({ judgment: j, inputEffects: {} })?.label).toBe("비사업용");
    expect(nblVerdictLabel({ judgment: j })).toBe("비사업용");
    expect(nblVerdictFromResult({})).toBeNull();
    expect(nblVerdictFromResult(null)).toBeNull();
    expect(nblVerdictLabel(undefined)).toBe("-");
  });

  it("[NH-7] 이월과세 A·B — 결론이 같으면 그대로, 다르면 어느 쪽도 고르지 않는다", () => {
    const biz = jsonRound(judgeFromAsset(CARD_CASES.businessFarmSelf.over));
    const non = jsonRound(judgeFromAsset(CARD_CASES.nonBusinessVacant.over));
    expect(nblVerdictLabel({ judgment: non, judgmentIfCarryoverExcluded: non })).toBe("비사업용");
    const differ = nblVerdictFromResult({ judgment: non, judgmentIfCarryoverExcluded: biz });
    expect(differ?.label).toBe("이월과세 적용 여부에 따라 다름");
    expect(differ?.detail).toContain("계산기에서 세액 비교");
    // 순서를 바꿔도 같은 라벨(A/B 한쪽을 대표로 고르지 않는다)
    expect(nblVerdictLabel({ judgment: biz, judgmentIfCarryoverExcluded: non })).toBe("이월과세 적용 여부에 따라 다름");
  });
});

describe("비사업용 토지 판정 — 드로어", () => {
  const judgment = jsonRound(judgeFromAsset(CARD_CASES.housingArea.over));
  const record = (resultData: Record<string, unknown>): CalculationRecord => ({
    id: "n1",
    userId: "local-user" as never,
    taxType: "non_business_land_judgment",
    title: "비사업용 토지 판정 — 시험",
    inputData: input,
    resultData,
    taxLawVersion: "2026-06-01",
    linkedCalculationId: null,
    clientId: null,
    createdAt: "2026-11-25T00:00:00.000Z",
    updatedAt: "2026-11-25T00:00:00.000Z",
  });

  it("[NH-8] 요약 항목 — 판정 · 소유기간 · 비사업용 면적 비율, 세액 항목은 없다", () => {
    const items = extractResultSummaryItems({ judgment }, "non_business_land_judgment");
    expect(items.map((i) => i.label)).toEqual(["판정", "소유기간", "비사업용 면적 비율"]);
    expect(items[0].value).toBe("일부 비사업용");
    expect(items[2].value).toBe("50.0%");
    expect(extractResultSummaryItems({}, "non_business_land_judgment")).toEqual([]);
  });

  it("[NH-9] 머리 값 — 「납부세액」이 아니라 「판정」 + 결론", () => {
    render(
      <HistoryDetailDrawer record={record({ judgment })} taxTypeLabel="비사업용 토지 판정" onClose={() => {}} onDelete={async () => {}} onTitleUpdate={async () => {}} />,
    );
    expect(screen.getByTestId("drawer-headline-value").textContent).toBe("일부 비사업용");
    expect(document.body.textContent).not.toContain("납부세액");
  });
});
