/**
 * 상속세·증여세 ⑫ — 엔진이 읽는데 비우면 200 + 조용히 다른 세액이 되던 입력 (2026-09-30 Zod↔엔진 필수 점검 2차).
 *
 * 조건은 ⑧과 **같은 술어**를 부른다(`lib/calc/inheritance-required-inputs.ts`·`gift-required-inputs.ts`·
 * `estate-item-vacancy-validate.ts`). 여기서는 경로만 붙인다.
 * 800줄 정책으로 `property-valuation-input.ts`·`estate-item-schema.ts`에서 분리.
 */
import type { z } from "zod";
import {
  ancillaryLandMissingKeys,
  casualtyLossDateMissing,
  heirLacksBirthDateSource,
  shortTermReinheritIssue,
} from "@/lib/calc/inheritance-required-inputs";
import {
  foreignGiftTaxBaseMissing,
  missingPriorRoundInputs,
  type PriorRoundRequiredField,
} from "@/lib/calc/gift-required-inputs";
import { vacancyPortionIssue } from "@/lib/calc/estate-item-vacancy-validate";
import type {
  EstateItem,
  GiftDonorRelation,
  Heir,
  InheritanceDeductionInput,
} from "@/lib/tax-engine/types/inheritance-gift.types";

type Ctx = z.RefinementCtx;
type Path = (string | number)[];
const add = (ctx: Ctx, path: Path, message: string) => ctx.addIssue({ code: "custom", path, message });

/** §61⑤ 미임대(공실) 부분 — 상속·증여 공용 자산 스키마(`estateItemSchema`)에서 호출 */
export function refineVacancyPortion(item: unknown, ctx: Ctx): void {
  const iss = vacancyPortionIssue(item as EstateItem);
  if (iss) add(ctx, [iss.field], iss.message);
}

interface InheritanceRequiredShape {
  deathDate: string;
  heirs: Pick<Heir, "relation" | "birthDate" | "residentNumber">[];
  deductionInput: Pick<
    InheritanceDeductionInput,
    "casualtyLoss" | "ancillaryLandArea" | "buildingFootprintArea" | "ancillaryLandRegion" | "ancillaryLandStdPrice"
  > & { heirs: Pick<Heir, "relation" | "birthDate" | "residentNumber">[] };
  creditInput: Parameters<typeof shortTermReinheritIssue>[0];
}

/** 상속세 본체(`inheritanceTaxInputSchema`) superRefine 에서 호출 */
export function refineInheritanceRequiredInputs(d: InheritanceRequiredShape, ctx: Ctx): void {
  // #6 생년월일 — 엔진은 상위 `heirs`(세대생략 미성년·사전증여 미성년)와 `deductionInput.heirs`
  // (인적공제 §20①)를 각각 읽는다. ④는 두 곳에 같은 상속인을 싣는다.
  const birth = "자연인 상속인은 생년월일(또는 생년월일을 도출할 주민등록번호)이 필요합니다 (상속세 및 증여세법 §20①2호~4호 만 나이)";
  d.heirs.forEach((h, i) => heirLacksBirthDateSource(h) && add(ctx, ["heirs", i, "birthDate"], birth));
  d.deductionInput.heirs.forEach(
    (h, i) => heirLacksBirthDateSource(h) && add(ctx, ["deductionInput", "heirs", i, "birthDate"], birth),
  );
  // #7 §23 재해손실 — 재난 발생일
  if (casualtyLossDateMissing(d.deductionInput.casualtyLoss))
    add(ctx, ["deductionInput", "casualtyLoss", "disasterDate"], "재난 발생일이 필요합니다 (상속세 및 증여세법 §23① 신고기한 이내 재난)");
  // #11 §23의2① 주택부수토지 면적한도 — 전부 또는 전무
  for (const k of ancillaryLandMissingKeys(d.deductionInput))
    add(ctx, ["deductionInput", k], "주택부수토지 면적한도(§23의2①)는 부수토지 면적·건물 정착 면적·지역 구분·부수토지 공시가격을 모두 입력하거나 모두 비워야 합니다");
  // #10 §30 단기재상속 — 분모·전의 산출세액
  const st = shortTermReinheritIssue(d.creditInput, d.deathDate);
  if (st) add(ctx, ["creditInput", ...st.path], st.message);
}

const PRIOR_MESSAGES: Record<PriorRoundRequiredField, string> = {
  donor: "사전증여 증여자(donor)가 필요합니다 (§47 합산 그룹 판정)",
  farmlandReductionAmount: "§71 농지 감면 회차는 감면받은 증여세액이 필요합니다 (조세특례제한법 §133④ 5년간 증여세감면한도액 1억원)",
  giftTaxBase: "동일인 합산 회차는 그 회차 합산과세표준이 필요합니다 (상속세 및 증여세법 §58②)",
  computedTax: "동일인 합산 회차는 그 회차 산출세액이 필요합니다 (상속세 및 증여세법 §58①)",
  additionalGenerationSkipSurcharge: "세대생략 회차는 그 회차 추가 할증세액이 필요합니다 (상속세 및 증여세법 §57)",
};

interface GiftRequiredShape {
  donor: GiftDonorRelation;
  priorGiftsWithin10Years: Parameters<typeof missingPriorRoundInputs>[0][];
  creditInput: { foreignTaxPaid?: number; foreignGiftTaxBase?: number };
}

/** 증여세 본체(`giftTaxInputSchema`) superRefine 에서 호출 — ⑧ `gift-tax-form-validate.ts` 사전증여·외국납부 블록의 거울 */
export function refineGiftRequiredInputs(data: GiftRequiredShape, ctx: Ctx): void {
  data.priorGiftsWithin10Years.forEach((p, i) => {
    for (const f of missingPriorRoundInputs(p, data.donor))
      add(ctx, ["priorGiftsWithin10Years", i, f], PRIOR_MESSAGES[f]);
  });
  if (foreignGiftTaxBaseMissing(data.creditInput.foreignTaxPaid, data.creditInput.foreignGiftTaxBase))
    add(ctx, ["creditInput", "foreignGiftTaxBase"], "외국납부세액이 있으면 국외 증여재산 과세표준이 필요합니다 (상속세 및 증여세법 §59 · 같은 법 시행령 §48에서 준용하는 §21① 한도)");
}
