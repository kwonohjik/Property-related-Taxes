/**
 * NBL-STATE-HISTORY-E1 — 이력 고지 상수(`nbl-confirm-notices.ts`) 고정. E1에서는 어느 판정 경로도 싣지 않는다(도달 불가 가드: `__tests__/lib/nbl-state-history-leaf-unreachable.test.ts`).
 * 이력 없음 경로의 기존 고지(`NBL_STATE_AT_TRANSFER_APPLIED_NOTICE`)는 E0 anchor(`nbl-state-history-notice.anchor.test.ts`)가 지키므로 여기서는 «다른 문구가 따로 있다»만 본다.
 * 새 법령 조문은 인용하지 않는다 — 문구의 `§`는 모두 `NBL` 상수에서 와야 한다(문자열 리터럴 조문 금지 · verify:legal 대상 밖 인용 금지).
 */
import { describe } from "vitest";
import { it } from "vitest";
import { expect } from "vitest";
import * as notices from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL } from "@/lib/tax-engine/legal-codes/transfer-nbl";

const STATE_HISTORY_NOTICES = Object.entries(notices).filter(([k]) => k.startsWith("NBL_STATE_HISTORY_")) as Array<[string, string]>;

const BY_KEY: Record<string, string> = Object.fromEntries(STATE_HISTORY_NOTICES);

/** 확인 필요 표기가 필요한 고지(판정 한계를 알리는 것) — 입력 안내 2종(모름 행·유예 행)은 제외. */
const CONFIRM_REQUIRED = [
  "NBL_STATE_HISTORY_APPLIED_NOTICE",
  "NBL_STATE_HISTORY_UNCHANGED_NOTICE",
  "NBL_STATE_HISTORY_UNKNOWN_NOTICE",
  "NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE",
  "NBL_STATE_HISTORY_DEEMED_TRANSFER_NOTICE",
  "NBL_STATE_HISTORY_REVENUE_START_NOTICE",
  "NBL_STATE_HISTORY_TAX_CHANGE_APPLIED_NOTICE", // E3-① — 재산세 과세 구분 변경 사건이 있을 때 APPLIED를 대체
  "NBL_STATE_HISTORY_BARE_BASIS_UNCONFIRMED_NOTICE", // E3-1b — 나대지 구간 근거를 확인하지 못해 종합합산으로 접음
  "NBL_STATE_HISTORY_BARE_ACCEPTED_NOTICE", // E3-1b — 나대지 구간 근거를 선언으로 받아들임(요건·호별 한도 미판정)
  "NBL_STATE_HISTORY_BARE_AREA_LIMIT_NOTICE", // E3-1b — 공지상태 면적한도 일부 초과·모름 → 그 구간 종합합산
  "NBL_STATE_HISTORY_DAYWISE_NO_RULING_NOTICE", // E3-③ Q-2 — 일 단위 합산을 직접 다룬 해석례 없음
  "NBL_STATE_HISTORY_HOUSING_APPLIED_NOTICE", // E3-③ A — 주택 이력 적용 한정 고지(이력 없음 고지를 대체)
  "NBL_STATE_HISTORY_HOUSE_BEFORE_NOTICE", // E3-③ — 철거 전 주택 구간은 입력 정착면적·취득 면적·양도일 배율로 판정
  "NBL_STATE_HISTORY_HOUSE_WITHIN_UNCONFIRMED_NOTICE", // E3-③ — 정착면적 확인 불가·정착 > 토지 → 그 구간 접힘
  "NBL_STATE_HISTORY_HOUSE_EXCEEDED_NOTICE", // E3-③ Q-5 (나) — 배율 초과 → 그 구간 전체 비사업용
  "NBL_STATE_HISTORY_HOUSE_EXCEEDED_GRACE_NOTICE", // E3-③ Q-8 (가) — 초과 구간 뒤 9호 유예 유지
  "NBL_STATE_HISTORY_BUILDING_KIND_HINT_NOTICE", // E3-③ B Q-12 (가) — 철거 행 종류 칸 입력 hint(엔진 warnings에는 싣지 않는다)
  "NBL_STATE_HISTORY_HOUSING_PARTIAL_AREA_NOTICE", // E3-③ UI Low 1 — 주택 카드 변형: 양도일 현재 배율 초과 → 이력 미반영(`PARTIAL_AREA`의 주택 문구)
  "NBL_STATE_HISTORY_VACANT_LOT_APPLIED_NOTICE", // E3-④ Q-5 (가) — 13호 변형: `APPLIED`를 대체(호별 용도 전체 적용 문구가 13호와 모순)
  "NBL_STATE_HISTORY_VACANT_LOT_TAX_CHANGE_APPLIED_NOTICE", // E3-④ — 13호 변형의 재산세 구분 변경 이력 짝
  "NBL_STATE_HISTORY_VACANT_LOT_AREA_NOTICE", // E3-④ D-2 — 660㎡ 초과 × 이력은 13호 구간을 인정하지 않음
  // E3-⑤ E3f-2 — 나대지 구간 근거 «철거ㆍ멸실»(한시 창): 받아들임 · 주택 빈집정비 미확인(일반 W만) · 주택 면적 한도 없음 · 접힘 사유 5종
  "NBL_STATE_HISTORY_BARE_DEMOLISHED_ACCEPTED_NOTICE",
  "NBL_STATE_HISTORY_BARE_DEMOLISHED_VACANT_HOUSE_UNCONFIRMED_NOTICE",
  "NBL_STATE_HISTORY_BARE_DEMOLISHED_HOUSE_AREA_NOTICE",
  "NBL_STATE_HISTORY_BARE_DEMOLISHED_NEVER_PERIOD_NOTICE",
  "NBL_STATE_HISTORY_BARE_DEMOLISHED_PERMIT_NOTICE",
  "NBL_STATE_HISTORY_BARE_DEMOLISHED_OTHER_USE_NOTICE",
  "NBL_STATE_HISTORY_BARE_DEMOLISHED_AREA_MISSING_NOTICE",
  "NBL_STATE_HISTORY_BARE_DEMOLISHED_AREA_EXCEEDED_NOTICE",
  // E3-⑤ E3f-3 — 영 §103의2 2호 단서(국가 등 공용·공공용 사용): 받아들임 · 공용 사용 기간 안에 과세기준일 없음 접힘
  "NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_ACCEPTED_NOTICE",
  "NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_NO_BASE_DATE_NOTICE",
  "NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_MIXED_ACCEPTED_NOTICE", // E3f-3 Low-B — 제한 없는 창 + 단서 창 혼합 구간의 수락 고지(한정은 단서 창에만)
  "NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_UNUSED_NOTICE", // E3f-3 Medium-1 — 단서를 주장했으나 공용 사용 기간 안에 과세기준일이 없어 반영되지 않음(접히지 않은 구간)
];

describe("NBL-STATE-HISTORY-E1 — 이력 고지 상수", () => {
  it("38종이 있고 서로 다르며 기존 이력 없음 고지와도 다르다(E3-①이 2종 · E3-1b가 3종 · E3-③ A가 7종 · B가 1종 · UI Low가 1종 · E3-④가 3종 · E3-⑤ E3f-1a가 2종 · E3f-2가 8종 · E3f-3이 4종 추가 · U-3이 E3f-1a N-3 임시 보충 1종 폐기 — 기존 8종 문구는 바이트 동일)", () => {
    expect(STATE_HISTORY_NOTICES.map(([k]) => k).sort()).toEqual(
      [
        ...CONFIRM_REQUIRED,
        "NBL_STATE_HISTORY_REMOVED_TAX_TYPE_UNKNOWN_NOTICE",
        "NBL_STATE_HISTORY_TAX_CHANGE_UNKNOWN_NOTICE",
        "NBL_STATE_HISTORY_GRACE_ROW_NOTICE",
        "NBL_STATE_HISTORY_HOUSING_NON_HOUSE_BUILDING_NOTICE", // E3-③ R-6 — 입력 안내(질문 hint와 같은 상수) — «확인 필요»로 끝나지 않는다
        "NBL_STATE_HISTORY_DEMOLITION_GRACE_NUDGE_NOTICE", // E3-⑤ E3f-1a N-2 — 철거 행 + 9호 부재 입력 안내(입력 화면 전용)
      ].sort(),
    );
    const texts = STATE_HISTORY_NOTICES.map(([, v]) => v);
    expect(new Set(texts).size).toBe(texts.length);
    expect(texts).not.toContain(notices.NBL_STATE_AT_TRANSFER_APPLIED_NOTICE);
  });

  it.each(CONFIRM_REQUIRED)("%s — 판정 한계를 알리는 고지는 «확인 필요»로 끝난다(「모름 = 혜택 불성립 + 확인 필요」)", (key) => {
    const text = BY_KEY[key];
    expect(text).toContain("확인 필요");
  });

  it("조문 `§`는 전부 `NBL` 상수에서 온다 — 문자열 리터럴 조문·새 인용 없음", () => {
    const nblValues = (Object.values(NBL) as unknown[]).filter((v): v is string => typeof v === "string").sort((a, b) => b.length - a.length);
    for (const [key, text] of STATE_HISTORY_NOTICES) {
      let rest = text;
      for (const v of nblValues) rest = rest.split(v).join("");
      expect(rest, `${key}에 NBL 상수 밖의 조문 표기가 있다`).not.toMatch(/§\s*\d/);
    }
  });

  it("DM-01 칸 안내는 «이력과 합쳐 판정» — 개시일을 건너뛰지 않는다(Q-15 (가′))", () => {
    expect(notices.NBL_STATE_HISTORY_REVENUE_START_NOTICE).toContain("함께 판정");
    expect(notices.NBL_STATE_HISTORY_REVENUE_START_NOTICE).not.toContain("판정에 쓰이지 않");
  });

  it("모름 행 안내는 «종합합산으로 보아 판정 + 확인 필요 표시» · 납세고지서 확인 경로를 말한다", () => {
    expect(notices.NBL_STATE_HISTORY_REMOVED_TAX_TYPE_UNKNOWN_NOTICE).toContain("종합합산");
    expect(notices.NBL_STATE_HISTORY_REMOVED_TAX_TYPE_UNKNOWN_NOTICE).toContain("납세고지서");
  });

  it("유예 안내는 자동 생성하지 않는다고 말한다(Q-10 (가))", () => {
    expect(notices.NBL_STATE_HISTORY_GRACE_ROW_NOTICE).toContain("자동으로 만들지 않습니다");
  });
});
