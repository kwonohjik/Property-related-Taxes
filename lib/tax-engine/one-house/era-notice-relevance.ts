/**
 * 판정 메뉴 「판정하지 않은 부분」 고지의 **결론 가름 게이트**(`EraNoticeRelevance`) 조립 — `transfer-tax-exemption.ts`
 * 800줄 정책 분리. 로직은 그대로 옮겼다(동작 변경 없음).
 *
 * 각 게이트는 모르는 사실을 바꾼 **반사실 판정**이 현재 판정과 다를 때만 참이다. 판정 본체(`checkExemption`·`checkExemptionCore`)는
 * 순환 import를 피하려고 호출부가 콜백으로 넘긴다.
 */
import type { OneHouseSpecialRulesData } from "../schemas/rate-table.schema";
import { describeOneHouseHoldingRequirement } from "../transfer-tax-exemption-holding";
import type { EraNoticeRelevance } from "./era-undetermined";
import {
  giftHouseholdConsolidationStart,
  giftHouseholdUnconfirmed,
  type GiftHouseholdBasis,
} from "./gift-household-basis";
import { counterfactualVerdictDiffers, withMoveInWithinYear, withNotBothRegulated } from "./temp-two-house-counterfactual";
import type { OneHouseCoreVerdict, OneHouseJudgeInput, OneHouseJudgment } from "./types";

/** 거주 요건을 채운 반사실 판정에 넣는 거주 개월 — 어떤 거주요건(2년·신도시 2년)도 넘는 값이다. */
const RESIDENCE_COUNTERFACTUAL_MONTHS = 1200;

/**
 * 거주기간 요건이 비과세 **결론을 가르는가** (S07-10) — 판정 보류 고지 게이트.
 *
 * 거주 개월만 채워 `checkExemptionCore`(본체 판정)를 다시 돌려 비과세·부분과세가 되면 거주가 결론을 가른다. 3주택·특례 없는
 * 2주택·§155① 처분기한 경과처럼 거주와 무관한 사유로 과세가 정해졌으면 채워도 과세라 가르지 않는다. 결론을 따로 쓰지 않는다.
 *
 * - §89② 배제가 확정이면 본체 판정과 무관하게 과세라 가르지 않는다.
 * - 보유도 모자란 1주택(PD-15)은 거주를 채워도 아직 과세지만 둘 다 시간이 해소하므로 고지를 유지한다.
 */
function residenceDecidesConclusion(
  input: OneHouseJudgeInput,
  oneHouseRules: OneHouseSpecialRulesData,
  article89Excluded: boolean,
  core: (input: OneHouseJudgeInput) => OneHouseCoreVerdict,
): boolean {
  if (article89Excluded) return false;
  const withResidence = core({ ...input, residencePeriodMonths: RESIDENCE_COUNTERFACTUAL_MONTHS });
  if (withResidence.isExempt || withResidence.isPartialExempt) return true;
  const holding = describeOneHouseHoldingRequirement(input, oneHouseRules.one_house_exemption);
  return input.householdHousingCount === 1 && !holding.met && !holding.provisoWaives;
}

export function buildEraNoticeRelevance(ctx: {
  input: OneHouseJudgeInput;
  oneHouseRules: OneHouseSpecialRulesData;
  /** §89② 배제 확정 여부 — 확정이면 본체 판정과 무관하게 과세라 반사실 게이트는 거짓이다. */
  article89Excluded: boolean;
  settled: boolean;
  /** 현재 판정(§89② 배제 반영 후). */
  verdict: OneHouseCoreVerdict;
  /** `checkExemption`(전체 판정) — 반사실 입력으로 다시 돌린다. */
  check: (input: OneHouseJudgeInput) => OneHouseJudgment;
  /** `checkExemptionCore`(본체 판정). */
  core: (input: OneHouseJudgeInput) => OneHouseCoreVerdict;
}): EraNoticeRelevance {
  const { input, oneHouseRules, article89Excluded, settled, verdict, check, core } = ctx;
  return {
    // 거주기간 요건 고지(`154-1-residence-deadline-unavailable` · `154-1-capital-newtown-location-unverified`)는 그 요건이
    // 결론을 가를 때만 낸다(S07-10). 판정은 엔진 본체(`checkExemptionCore`) 그대로다 — 거주 개월만 채워 다시 돌린다.
    residenceDecides: () => residenceDecidesConclusion(input, oneHouseRules, article89Excluded, core),
    // §154⑤ 단서 처분 이력 미답(결정 #36) — 「없음」으로 답한 본체 판정이 비과세·부분 비과세일 때만 확인 필요(채우면 고지가 없어 재귀 없음).
    finalHouseRestartNone: () => {
      if (article89Excluded) return false;
      const r = core({ ...input, finalOneHouseRestart: { hadOtherHouseDisposal: false, disposals: [] } });
      return r.isExempt || r.isPartialExempt;
    },
    // 결정 #33·#34·#38 — 증여받은 주택의 세대 사실을 바꾼 반사실 판정이 현재 판정과 다를 때만 확인 필요를 낸다.
    //   반사실 입력은 세대 관계가 확정(통산 성립·별도세대)이라 이 고지를 다시 만들지 않는다 — 통산 성립 가정은 한 번 더 별도세대
    //   가정과 비교할 수 있으나 그 호출은 확정이므로 재귀 깊이가 2를 넘지 않는다.
    giftHouseholdDecides: () => {
      const g = input.giftHouseholdBasis;
      const verdictOf = (basis: GiftHouseholdBasis) => {
        const r = check({ ...input, giftHouseholdBasis: basis });
        return `${r.isExempt}|${r.isPartialExempt}`;
      };
      if (!g) {
        // 일반 증여 화면(세대 사실·증여자 취득일 미입력) — 통산 성립 가정으로 다시 판정할 사실이 없다. 증여로 취득한 주택이
        // 비과세가 아닐 때만 알린다(비과세면 통산이 결론을 바꾸지 못한다 — 통산은 혜택을 늘리는 방향으로만 작용한다).
        if (input.acquisitionCause !== "gift") return false;
        return !settled;
      }
      if (g.householdDateStrict) return false; // 반사실 입력은 고지를 만들지 않는다 — 재귀 차단
      const base = `${verdict.isExempt}|${verdict.isPartialExempt}`;
      const separate = (): string => verdictOf({ ...g, donorDeceased: undefined, continuousSameHousehold: false });
      // 통산 성립 가정 — 시작일을 모르면 증여자 취득일을 시작일로 둔다(세대 보유 시작일의 가장 이른 값).
      const consolidated = (): string | undefined =>
        g.donorAcquisitionDate.getTime() < g.giftDate.getTime()
          ? verdictOf({
              ...g,
              donorDeceased: undefined,
              continuousSameHousehold: true,
              householdHoldingStartDate: giftHouseholdConsolidationStart(g) ?? g.donorAcquisitionDate,
            })
          : undefined;
      if (g.donorDeceased === true) {
        const c = consolidated();
        return c !== undefined && c !== base;
      }
      // 통산 성립 — 별도세대 가정과 비교하고, 거울상(세대 보유 시작일에 지정 중 · 증여일에 비지정)을 세대 취득일로 읽는 가정(strict)과도 비교한다.
      if (giftHouseholdConsolidationStart(g)) {
        return separate() !== base || verdictOf({ ...g, householdDateStrict: true }) !== base;
      }
      if (giftHouseholdUnconfirmed(g)) {
        const c = consolidated();
        return separate() !== base || (c !== undefined && c !== base);
      }
      return false;
    },
    // §154①2호 가목 괄호 「사업인정 고시일 전 취득」 — 고시일이 비어 있어 단서를 적용하지 않았다. 고시일을 취득 뒤/앞으로 가정한
    // 두 판정이 다를 때만 확인 필요를 낸다(S02-2). 고시일을 채운 두 판정은 이 함수 자신이고, 채우면 그 고지가 생기지 않아 재귀하지 않는다.
    expropriationNoticeDate: () => {
      const p = input.oneHouseExemptionProviso;
      if (!p) return false;
      const verdictIf = (businessApprovalDate: Date) => {
        const r = check({ ...input, oneHouseExemptionProviso: { ...p, businessApprovalDate } });
        return `${r.isExempt}|${r.isPartialExempt}`;
      };
      return verdictIf(new Date(input.acquisitionDate.getTime() + 86_400_000)) !== verdictIf(input.acquisitionDate);
    },
    // §155①2호 조정 여부·가목 전입일 고지(#30·#32) — 모르는 사실을 유리하게 읽은 반사실 판정이 비과세·부분과세 결론을 바꿀 때만.
    regulatedReadingDecides: () =>
      counterfactualVerdictDiffers(input, core, article89Excluded, withNotBothRegulated),
    moveInDecides: () =>
      counterfactualVerdictDiffers(input, core, article89Excluded, withMoveInWithinYear),
  };
}
