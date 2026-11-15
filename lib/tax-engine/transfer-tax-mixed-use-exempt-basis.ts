/**
 * 겸용주택 주택분 1세대1주택 비과세 **근거** — 결과 화면 「1세대 1주택 비과세: 적용」 줄 아래 「근거:」에 싣는 문구.
 *
 * 일반 주택은 `exemptReason`(「1세대1주택 비과세」·「일시적 2주택 비과세 (…)」·「혼인 합가 (§155⑤) 1세대1주택 비과세」)이
 * 근거를 말한다. 겸용 결과에는 그 칸이 없어 근거가 0건이었다(`docs/00-pm/mixed-use-exempt-basis-row.plan.md` Q-1~Q-3).
 * 비과세/고가주택 여부는 화면의 「적용 (12억 이하 비과세 / 12억 초과 안분 과세)」가 이미 말하므로 여기는 근거만 적는다.
 *
 * 판정은 하지 않는다 — 겸용 엔진(`judgeMixedUseOneHouseExemption`)이 이미 정한 경로 값을 이름으로 옮기기만 한다.
 */
import { TRANSFER, shortArticle } from "./legal-codes";
import { TRANSFER_RENTAL_HOUSING } from "./legal-codes/transfer";
import { mergeDeemingLabel } from "./one-house/deemed-verdict";
import type { OneHouseAppliedException } from "./one-house/types";
import type { DeemedOneHouseBasis } from "./types/multi-house-surcharge.types";

export function mixedUseExemptBasis(args: {
  /** §155①④⑤ 의제(`resolveDeemedOneHouseBy155`) — 겸용은 §155⑦을 여기 넘기지 않는다. */
  deemedOneHouseBy155: DeemedOneHouseBasis | undefined;
  /** 이중 합가 순서 판정용 합가 사실. */
  mergeFacts: Parameters<typeof mergeDeemingLabel>[1];
  /** §155⑳ 장기임대주택 보유자 거주주택 의제. */
  rentalResidenceDeemed: boolean;
  /** §155⑥1호·⑦·⑧ 의제가 주택 수 축을 연 경우의 근거 조문(그 밖에는 undefined). */
  special155Basis: string | undefined;
  /** 결론을 가른 §154① 단서(`decisiveProvisoException`). */
  decisiveProviso: OneHouseAppliedException | undefined;
}): string {
  const { deemedOneHouseBy155: d } = args;
  const base =
    d === "temporary_two_house"
      ? `일시적 2주택 (${shortArticle(TRANSFER.TEMPORARY_TWO_HOUSE)}①)`
      : d === "marriage_merge" || d === "parental_care_merge" || d === "marriage_merge_overlap" || d === "parental_care_merge_overlap" || d === "double_merge"
        ? mergeDeemingLabel(d, args.mergeFacts)
        : args.rentalResidenceDeemed
          ? `장기임대주택 보유자 거주주택 (${shortArticle(TRANSFER_RENTAL_HOUSING.PIT_RD_155_20)})`
          : args.special155Basis === TRANSFER.UNAVOIDABLE_OUTSIDE_CAPITAL
            ? `수도권 밖 부득이한 사유 주택 (${shortArticle(TRANSFER.UNAVOIDABLE_OUTSIDE_CAPITAL)})`
            : args.special155Basis === TRANSFER.CULTURAL_HERITAGE_HOUSE
              ? `문화유산 주택 (${shortArticle(TRANSFER.CULTURAL_HERITAGE_HOUSE)})`
              : args.special155Basis !== undefined
                ? `농어촌주택 (${shortArticle(args.special155Basis)})`
                : "1세대1주택";
  const p = args.decisiveProviso;
  return p ? `${base} · ${p.label} — ${p.legalBasis}` : base;
}
