/**
 * ⑫ 일체 주택 **본인 신축** × §114조의2 가산세 base 건물분 입력 스키마 — `selfBuiltHousing`.
 *
 * 계획서: docs/00-pm/self-built-housing-building-base-114-2.plan.md (§3.1 · §7 ⑫ · Q-5)
 *
 * 이 객체는 **단건·다건(= `propertyBaseShape` 공유)과 컴패니언이 함께 쓴다.** 한쪽에만 두면 다른 쪽에서 **침묵 strip**된다(400이 아니라 200 + 종전 base).
 * 이월과세 증여자 신축의 `donorBuiltHousingShape`(`transfer-tax-schema-donor-built.ts`)를 그대로 가져와 칸을 **선택**으로 풀고 `buildingAppraisalValue` 를 더했다 —
 * 환산은 토지·건물 기준시가 5칸이, 감정은 건물 감정가액 한 칸(또는 비례 안분용 3칸)이 필요해 방식별 필수 여부는 방식을 아는 엔진(`assertSelfBuiltHousingInput`)이 판정한다.
 *
 * 받아서 닿을 수 없는 조합(비주택·본인 신축 아님·매매 외 취득·분리·PHD·증축·부담부증여·겸용)은 `.strict()` + {@link refineSelfBuiltHousing} 로 **400** — 받고 무시하지 않는다.
 * 게이트(5년·시행일·방식)가 닫힌 조합은 허용한다(숨은 stale 값에 거짓 요구를 하지 않는다 — ④가 미전송).
 */
import { z } from "zod";
import { donorBuiltHousingShape } from "./transfer-tax-schema-donor-built";

export const selfBuiltHousingShape = donorBuiltHousingShape
  .partial()
  .extend({
    /** 감정평가서에 구분 표시된 건물 감정가액 — 있으면 안분하지 않고 그대로 base */
    buildingAppraisalValue: z.number().int().positive().optional(),
  })
  .strict();

/** 단건·다건(자산 종류가 `propertyType`)과 컴패니언(`assetKind`)이 같은 사실로 환원해 같은 규칙을 건다. */
export interface SelfBuiltHousingFacts {
  /** 이 자산이 «일체 주택»인가 — 단건·다건 `propertyType==="housing"`, 컴패니언 `assetKind==="housing"` */
  isHousing: boolean;
  isSelfBuilt?: boolean;
  acquisitionCause?: string;
  /** 부담부증여(transferType / 서브객체) */
  burdenedGift: boolean;
  /** 겸용주택 서브객체 */
  mixedUse: boolean;
  buildingType?: string;
  /** 토지·건물 분리 계산(취득일 분리·소유자 분리·별개 취득) — 건물 파트가 이미 축이다 */
  separated: boolean;
  /** 개별주택가격 최초공시 전(PHD) */
  preHousingDisclosure: boolean;
}

/** `refine` 가 던지는 사유들(엔진 `assertSelfBuiltHousingInput` 의 정적 조건과 같다 — UI 통과 ⇒ ⑫ 통과 ⇒ 엔진 통과). */
export function refineSelfBuiltHousing(
  has: boolean,
  f: SelfBuiltHousingFacts,
  ctx: z.RefinementCtx,
  path: (string | number)[],
): void {
  if (!has) return;
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
  if (!f.isHousing) issue("일체 주택의 건물분 가산세 입력은 주택에만 보낼 수 있습니다 — 건물 단독은 전체가 건물분이라 필요 없습니다");
  if (f.burdenedGift) issue("부담부증여는 §159 스텝이 토지·건물을 따로 구해 이미 건물분을 base 로 씁니다 — 이 입력으로 받지 않습니다");
  if (f.acquisitionCause !== undefined && f.acquisitionCause !== "purchase")
    issue("이 입력은 본인이 신축해 매매로 취득한 주택에만 적용됩니다 — 이월과세·상속·증여는 취득 경위가 다릅니다");
  if (f.isSelfBuilt !== true) issue("이 입력은 본인 신축(isSelfBuilt)일 때만 보낼 수 있습니다");
  if (f.mixedUse) issue("겸용주택의 가산세 base 는 이 입력으로 받지 않습니다");
  if (f.buildingType === "extension")
    issue("증축은 증축한 부분 한정 base 가 따로 있어 이 입력으로 받지 않습니다 — 기준시가 비례 안분이면 수학적으로 같은 값입니다");
  if (f.separated) issue("토지·건물을 나눠 계산하는 자산은 건물 파트가 이미 가산세 기준이라 이 입력으로 받지 않습니다");
  if (f.preHousingDisclosure) issue("개별주택가격·공동주택가격 최초공시 전 환산은 건물 파트가 이미 base 입니다 — 이 입력과 함께 쓸 수 없습니다");
}

type SplitLike = { landAcquisitionDate?: string; selfOwns?: string; isSeparateAcquisition?: boolean };
export const isSeparatedLike = (d: SplitLike): boolean =>
  d.landAcquisitionDate !== undefined || (d.selfOwns !== undefined && d.selfOwns !== "both") || d.isSeparateAcquisition === true;
