/**
 * 과점주주 간주취득 — **물건별 세액 합산** (「지방세법」 §15②3호·단서)
 *
 * §15② 단서는 「취득**물건이** … 제13조제5항에 해당하는 경우」라 **물건 단위 판정**이다.
 * 법인이 골프장과 일반 토지를 함께 보유하면 전자만 10%, 후자는 2%다. 단일 세율 경로로는
 * 「전부 10%」 아니면 「전부 2%」밖에 없어 둘 다 틀린다.
 *
 * 조심 1998-0634이 실제로 그렇게 갈랐다 — 처분청이 골프장 안 부동산 전부를 중과하자
 * 심판원이 수영장(건축물)만 중과 대상으로 보고 테니스장·게이트볼장·골프연습장을 제외해
 * 경정했다(취득세 5,118,929,000 → 5,065,179,000).
 *
 * 구조는 부담부증여(`acquisition-tax-burdened.ts`)와 같다 — 부분별로 세액·부가세를 내고
 * 합산해 오케스트레이터 Step 7에 돌려준다.
 *
 * ## 지방교육세는 0이다
 * §151①1 본문 괄호가 §15② 해당분을 과세대상에서 제외한다(`calcLocalEducationTax` [M3]).
 * 버킷을 써도 원인이 `deemed_major_shareholder`이므로 그대로 0이다.
 */

import {
  calcTaxWithAdditional,
  type AdditionalTaxResult,
} from "./acquisition-tax-rate";
import { deemedProvisoRate } from "./acquisition-deemed-proviso";
import type {
  DeemedBucketBreakdown,
  PropertyObjectType,
} from "./types/acquisition.types";

export interface DeemedBucketComputation {
  /** Σ floor(버킷 과세표준 × 버킷 세율) */
  acquisitionTax: number;
  /** 버킷별 농특세·지방교육세 합산 */
  additional: AdditionalTaxResult;
  /** `rate`·`tax`가 채워진 버킷 내역 (결과 카드 표시용) */
  buckets: DeemedBucketBreakdown[];
}

/**
 * 버킷별 세액·부가세 산출 후 합산.
 *
 * ⚠️ 세율은 반드시 `deemedProvisoRate`를 거친다. 단일 물건 경로(`assessSurcharge`의 §13⑤
 *    분기)와 **같은 수**가 나와야 하며, 그 일치는 `deemed-15-2-proviso.anchor.test.ts`가
 *    고정한다 — 한쪽이 바뀌면 red.
 */
export function computeDeemedBucketResult(
  buckets: DeemedBucketBreakdown[],
  propertyType: PropertyObjectType,
  options: {
    acquisitionCause: string;
    areaSqm?: number;
    isRuralRegion?: boolean;
  },
): DeemedBucketComputation {
  const priced: DeemedBucketBreakdown[] = [];
  let acquisitionTax = 0;
  let ruralSpecialTax = 0;
  let localEducationTax = 0;
  const ruralBases: string[] = [];
  const eduBases: string[] = [];

  for (const b of buckets) {
    const rate = deemedProvisoRate(b.proviso);
    const tax = Math.floor(b.taxBase * rate);
    acquisitionTax += tax;
    priced.push({ ...b, rate, tax });

    const add = calcTaxWithAdditional(
      b.taxBase,
      rate,
      tax,
      propertyType,
      options.areaSqm,
      {
        acquisitionCause: options.acquisitionCause,
        /**
         * 단서 버킷(§13① 6% · §13⑤ 10%)은 중과분을 농특세 기준율에 얹는다.
         *
         * 농특세법 **§5⑤** — 「§15②에 해당하는 경우에는 같은 항에 따라 계산한 취득세액을
         * §5①6호의 과세표준으로 본다」 ⇒ 농특세 = 그 버킷 취득세액 × 10%.
         * `basicRate`가 중과기준세율 2%이므로 `2% + (적용세율 − 2%) = 적용세율`로 항등이다
         * (`[AT-RST]`가 고정). **`!== "none"`이어야 §13① 버킷도 6%→0.6%가 된다** —
         * `=== "luxury"`로 좁히면 §13① 버킷이 0.2%로 조용히 과소 계산된다.
         */
        isSurcharged: b.proviso !== "none",
        surchargeType: b.proviso === "luxury" ? "luxury_solo" : undefined,
        isRuralRegion: options.isRuralRegion,
        // 간주취득의 '표준세율' 성분은 중과기준세율 2%다 (§15② 본문).
        basicRate: deemedProvisoRate("none"),
      },
    );
    ruralSpecialTax += add.ruralSpecialTax;
    localEducationTax += add.localEducationTax;
    if (!ruralBases.includes(add.ruralTaxBasis)) ruralBases.push(add.ruralTaxBasis);
    if (!eduBases.includes(add.eduTaxBasis)) eduBases.push(add.eduTaxBasis);
  }

  return {
    acquisitionTax,
    additional: {
      ruralSpecialTax,
      localEducationTax,
      ruralTaxBasis: ruralBases.join(" · "),
      eduTaxBasis: eduBases.join(" · "),
    },
    buckets: priced,
  };
}
