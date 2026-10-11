/**
 * 1세대1주택 판정 — 「왜 적용되지 않았는가」(`unmetExceptions[]`) 중 **기한·기간 사유** 두 갈래.
 *
 * `unmet-exceptions.ts`가 800줄 정책 한도에 가까워 새로 생긴 두 수집기를 분리했다(2026-10-11).
 *   - `collectLapsedDeadlineUnmet` — 판정 기준일 전에 기한이 지나 `pending`에서 빠진 조건의 사유(S07-3)
 *   - `overlappedTemporaryTwoHouseTimingReasons` — 다른 특례와 겹친 3주택에서 §155① 기간 요건이 깨진 날짜(합가 중첩 · D3)
 */
import type { OneHouseSpecialRulesData } from "../schemas/rate-table.schema";
import { evaluateTemporaryTwoHouseTiming } from "../transfer-tax-exemption-requirements";
import type {
  OneHouseJudgeInput,
  OneHousePendingCondition,
  OneHouseRequirementReview,
  OneHouseUnmetException,
} from "./types";

/** 표시용 날짜 — 엔진이 문장을 만들므로 여기서 포맷한다(YYYY-MM-DD). */
const fmtDate = (d: Date): string => d.toISOString().slice(0, 10);

/** 기한 경과 사유의 특례 이름 — `pending` id별. 표에 없는 id는 일반 이름으로 말한다. */
const LAPSED_DEADLINE_LABEL: Record<string, string> = {
  "156-2-3-right-three-year": "주택·조합원입주권(분양권) 보유 세대 — 권리 취득일부터 3년 이내 양도 (§89②)",
  "155-1-disposal-deadline": "일시적 2주택 — 신규주택 취득일부터 처분기한 내 양도",
  "155-5-marriage-merge": "혼인 합가 — 혼인한 날부터 기한 내 양도",
  "155-4-parental-care-merge": "동거봉양 합가 — 합친 날부터 기한 내 양도",
  "155-8-unavoidable-resolved": "수도권 밖 부득이한 사유 주택 — 해소일부터 3년 이내 양도",
  "155-7-3ho-return-to-farm": "농어촌주택 (3호 귀농) — 취득일부터 5년 이내 양도",
};

/**
 * 판정 기준일 **전에 기한이 지난** 「이 날까지 양도」 조건 — 기준일 필터가 `pending`에서 뺀 것의 **사유를 남긴다**(S07-3).
 *
 * 기한이 지났으면 과세가 맞고(결론 불변) 「양도일을 조정하라」는 안내(`pending`)도 틀리다. 그러나 사유까지 지우면 화면에
 * 과세 판정만 남고 이유가 어디에도 없다 — 입주권 취득 후 3년·부득이 사유 해소 후 3년·귀농주택 취득 후 5년이 지난 뒤 조회한 사안이다.
 *
 * 🔑 **검토표가 이미 같은 사유를 말하는 축은 싣지 않는다** — §155① 처분기한은 §155① 검토표가, 합가 기한은 합가 검토표가 「처분기한이
 *    판정 기준일 전에 지나 …」로 낸다(`requirement-review.ts`). 두 곳에서 말하지 않는다.
 * 🔑 날짜·문구는 `pending`이 담은 엔진 값을 그대로 옮긴다 — 기한을 다시 계산하지 않는다.
 */
export function collectLapsedDeadlineUnmet(
  lapsed: readonly OneHousePendingCondition[],
  judgmentBaseDate: Date | undefined,
  reviewScheme: OneHouseRequirementReview["scheme"] | undefined,
): OneHouseUnmetException[] {
  if (!judgmentBaseDate) return [];
  return lapsed
    .filter((p) => {
      if (p.id === "155-1-disposal-deadline") return reviewScheme !== "155-1-temporary-two-house";
      if (p.id === "155-5-marriage-merge" || p.id === "155-4-parental-care-merge") return reviewScheme !== "155-4-5-merge";
      return true;
    })
    .map((p) => ({
      id: `${p.id}:deadline-lapsed`,
      label: LAPSED_DEADLINE_LABEL[p.id] ?? "기한이 지난 요건",
      legalBasis: p.legalBasis,
      reasons: [
        `${p.description} — 이 기한(${fmtDate(p.deadline)})이 판정 기준일(${fmtDate(judgmentBaseDate)}) 전에 지나 양도일을 조정해도 충족할 수 없습니다.${p.deadlineNote ? ` ${p.deadlineNote}` : ""}`,
      ],
    }));
}

/**
 * 다른 특례와 **겹친 3주택**에서 §155①(일시적 2주택) 기간 요건이 어느 날짜로 깨졌는가 — 합가 중첩(F-1)과 ⑦ 농어촌 중첩(D3)이
 * 같은 문장을 쓴다. 성립 판정은 정본(`evaluateTemporaryTwoHouseTiming`)이 하고 여기서는 사실을 문장으로 옮길 뿐이다.
 * 종전 문구는 두 요건을 양도 연도와 무관하게 함께 나열해 2012-06-29 전 양도분(1년 요건 없음)에도 1년 요건을 말했다 —
 * 어느 요건이 어느 날짜로 깨졌는지만 밝힌다. `deadlineTail`은 기한 문장 뒤에 붙는 겹친 특례별 설명이다.
 */
export function overlappedTemporaryTwoHouseTimingReasons(
  input: OneHouseJudgeInput & { temporaryTwoHouse: NonNullable<OneHouseJudgeInput["temporaryTwoHouse"]> },
  twoHouseRule: NonNullable<OneHouseSpecialRulesData["temporary_two_house"]>,
  deadlineTail: string,
): string[] {
  const { timing, era } = evaluateTemporaryTwoHouseTiming(input, twoHouseRule);
  const tt = input.temporaryTwoHouse;
  const lead = "겹쳐 있는 일시적 2주택 특례의 기간 요건을 충족하지 않습니다";
  const reasons: string[] = [];
  if (!timing.oneYearMet) {
    reasons.push(
      `${lead} — 종전주택 취득일(${fmtDate(tt.previousAcquisitionDate)})부터 1년이 지난 뒤(${fmtDate(timing.oneYearThreshold)}부터) 신규주택을 취득해야 하는데 ${fmtDate(tt.newAcquisitionDate)}에 취득했습니다.`,
    );
  }
  if (!timing.threeYearMet) {
    reasons.push(
      `${lead} — 신규주택 취득일(${fmtDate(tt.newAcquisitionDate)})부터 처분기한 ${era.years}년의 말일(${fmtDate(timing.deadline)})이 지난 ${fmtDate(input.transferDate)}에 양도했습니다. ${deadlineTail}`,
    );
  }
  if (timing.moveInMet === false) {
    reasons.push(`${lead} — 세대전원 이사·전입신고 기한 요건(§155①2호 가목)을 충족하지 않습니다.`);
  }
  return reasons;
}
