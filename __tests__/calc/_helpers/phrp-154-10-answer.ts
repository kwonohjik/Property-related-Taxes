/**
 * §154⑩ 사실 질문(판정 메뉴·부담부증여 필수 응답 — `lib/calc/phrp-154-10-fact-question.ts`)을 「아니오」로 채운 특례 입력.
 *
 * 질문 신설 전에 작성된 시료는 「임대 등록 이력이 없는 평범한 주택」을 전제했다 — 그 전제를 응답으로 명시한다.
 * §154⑩ 선언(B · 임대주택 0호)이 있는 시료는 응답이 「예」로 도출되므로 건드리지 않는다. 질문 게이트 자체는
 * `phrp-154-10-fact-question.anchor.test.tsx`가 미응답 상태로 따로 단언한다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { RENTAL_HOUSING_EXCEPTION_DEFAULTS } from "@/lib/stores/calc-wizard-asset-factory";

type Rh = AssetForm["rentalHousingException"];

/** 부담부증여 `burdenedGiftTransferTax.rentalHousingException` — 특례 미선언 + 질문 「아니오」. */
export const RH_ANSWERED_NO: Rh = { ...RENTAL_HOUSING_EXCEPTION_DEFAULTS, phrp154_10Answer: "no" };

export function answeredNo<T extends Rh | undefined>(rh: T): T {
  if (!rh || rh.phrp154_10Answer) return rh;
  return { ...rh, phrp154_10Answer: "no" };
}

/** 판정 메뉴 폼 — 첫 자산(판정 대상)만 묻는다. */
export function withPhrpAnsweredNo<F extends { assets: AssetForm[] }>(form: F): F {
  const [primary, ...rest] = form.assets;
  if (!primary) return form;
  return { ...form, assets: [{ ...primary, rentalHousingException: answeredNo(primary.rentalHousingException) }, ...rest] };
}
