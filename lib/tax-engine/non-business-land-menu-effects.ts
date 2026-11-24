/**
 * 비사업용 토지 판정 메뉴 — 「입력했는데 이 판정에 쓰이지 않은 칸」 echo (표시 전용 · 판정 불변).
 *
 * 계획서 `docs/01-plan/features/nbl-judgment-menu.engine.plan.md` §4.3.
 *
 * 위젯이 「사업용 사용 기간에 가산됩니다」라고 안내하던 입력이 판정에 닿지 않는 사고가 이미 있었다(엔진 `engine.ts` NBL2611-V2-C1).
 * 화면이 `consumes*`를 다시 부르면 두 번째 진실이 되므로 **서버가 한 번만** 계산해 응답에 싣는다.
 *
 * 순수 함수 — DB·엔진 파일 수정 없음. 판정 술어는 이미 단일 소스인 `consumes*`(`non-business-land/land-category.ts`)를 그대로 부른다.
 * 새 지목 표를 만들지 않는다.
 */
import type { NonBusinessLandInput, NonBusinessLandJudgment } from "./non-business-land/types";
import { consumesGracePeriods } from "./non-business-land/land-category";
import { consumesPeriodJudgmentDate } from "./non-business-land/land-category";
import { consumesUrbanIncorporationDate } from "./non-business-land/land-category";

/**
 * - `applied` — 판정에 반영됐다
 * - `ignored_by_category` — 입력했지만 이 지목의 판정은 그 칸을 읽지 않는다
 * - `overridden_by_unconditional` — 무조건 사업용 의제(영 §168의14③)로 지목별 판정이 돌지 않아 쓰이지 않았다
 * - `not_declared` — 입력하지 않았다
 */
export type NblInputEffect = "applied" | "ignored_by_category" | "overridden_by_unconditional" | "not_declared";

export interface NblInputEffects {
  /** 부득이한 사유 유예기간(영 §168의14①) */
  gracePeriods: NblInputEffect;
  /** 양도일 의제(영 §168의14② — 경매·공매·신문공고) */
  deemedTransfer: NblInputEffect;
  /** 도시지역 편입일(편입유예) */
  urbanIncorporation: NblInputEffect;
}

/** 선언 여부 · 무조건 의제 성립 · 지목 소비로 효과를 정한다. 무조건 의제가 성립하면 지목별 judge가 돌지 않는다(`engine.ts` Step 2 조기 반환). */
function effectOf(declared: boolean, uncondApplied: boolean, consumed: boolean): NblInputEffect {
  if (!declared) return "not_declared";
  if (uncondApplied) return "overridden_by_unconditional";
  return consumed ? "applied" : "ignored_by_category";
}

export function buildNblInputEffects(input: NonBusinessLandInput, judgment: NonBusinessLandJudgment): NblInputEffects {
  const uncondApplied = judgment.unconditionalExemption?.isApplied === true;
  return {
    gracePeriods: effectOf(input.gracePeriods.length > 0, uncondApplied, consumesGracePeriods(input.landType)),
    // 양도일 의제는 사유와 날짜가 모두 있어야 엔진이 쓴다(`engine.ts` F-1 — 사유만 있으면 선언하지 않은 것으로 읽는다. UI ⑧이 날짜 누락을 막는다).
    deemedTransfer: effectOf(
      !!input.deemedTransferReason && input.deemedTransferReason !== "none" && !!input.deemedTransferDate,
      uncondApplied,
      consumesPeriodJudgmentDate(input.landType),
    ),
    urbanIncorporation: effectOf(!!input.urbanIncorporationDate, uncondApplied, consumesUrbanIncorporationDate(input.landType)),
  };
}
