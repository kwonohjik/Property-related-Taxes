/**
 * 증여세 부담부증여 양도 경로 — §155①2호 새 입력(OH-01 A2b)의 **노출 게이트** (E-1)
 *
 * ⑤ `BurdenedGiftTransferSection`(입력 칸)과 ⑧ `gift-tax-form-validate.ts`(모순 차단)가 **같은 함수**로
 * 게이트를 연다 — 칸이 없는 상태에서 막거나, 칸이 있는데 검증이 빠지는 어긋남을 막는다(3중 패턴).
 *
 * 판정은 양도세 판정 카드와 같은 leaf(`judgeTempTwoHouseFromForm`)를 부른다. 종전(증여) 주택 주소
 * (`regionCode` — E-1 후속)는 ④가 싣는 값과 같은 것을 넘긴다(`giftBurdenedRegionCode`) — 있으면 종전 주택
 * 조정 여부는 주소로 자동 판정되고 위젯은 선언 칸 대신 결과를 보여 준다. 신규 주택 법정동코드는 이 경로에
 * 보유 주택 목록이 없어 신규 주택 소재지 한 칸(`temporaryTwoHouse.newHouseRegionCode` — E-1 잔여 B)에서
 * 온다 — ④와 같은 값을 넘기므로 코드가 있으면 신규 주택도 자동 판정된다. §154① 단서는 `regulated`(노출 게이트)를 바꾸지 않아
 * 넘기지 않는다(1년 요건 면제만 바꾼다 — 엔진은 ④가 싣는 사유로 판정한다).
 */
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";
import { judgeTempTwoHouseFromForm, type TempTwoHouseVerdict } from "@/lib/calc/transfer-temp-two-house-judge";
import { extractSigunguCodeFromPnu } from "@/lib/geo/pnu-sigungu";
import type { TempTwoHouseDeadlineExceptionFields } from "@/lib/calc/transfer-tax-api-body-blocks";
import { eraFormWithOriginDates } from "@/lib/calc/temporary-two-house-era-facts";
import {
  declaredNewHouseEffectiveAcquisitionDate,
  declaredNewHouseOriginIssue,
  declaredNewHouseOriginOf,
} from "@/lib/calc/declared-new-house-origin";

type TempTwoHouseFacts = NonNullable<BurdenedGiftTransferTaxInput["temporaryTwoHouse"]>;
type RegulatedVerdict = Extract<TempTwoHouseVerdict, { status: "eligible" | "ineligible" }>["regulated"];

/** Date(메모리) 또는 YYYY-MM-DD(복원 직후) → YYYY-MM-DD. 무효면 "". */
function ymd(v: Date | string | undefined): string {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  return typeof v === "string" ? v : "";
}

/**
 * §155① 「종전의 주택」 취득일 — **이번 증여(양도) 주택의 취득일**로 고정한다(1h-G1-3).
 *
 * 「소득세법 시행령」 §155①은 「그 주택(이하 이 항에서 "종전의 주택"이라 한다)을 양도하기 전에 다른 주택 … 을
 * 취득 … 신규 주택을 취득한 날부터 … 기간 이내에 종전의 주택을 양도하는 경우」에만 1세대1주택으로 본다 —
 * 양도하는 주택이 종전의 주택이다. 종전 취득일을 자유 입력으로 받으면 나중에 취득한 주택을 증여하면서 다른
 * (먼저 산) 주택 날짜를 넣어 일시적 2주택 비과세가 성립해 버린다. 양도세 계산기(`household-house-count.ts`)·판정 메뉴
 * (`one-house-judgment-temp-two-house.ts`)도 양도 주택 취득일로 고정한다. ⑤ 표시 · ④ 전송 · ⑧ 게이트가 모두 이 값을 쓴다
 * (3중 패턴). 저장된 `temporaryTwoHouse.previousAcquisitionDate`(옛 자유 입력)는 읽지 않는다.
 */
export function giftBurdenedPreviousAcquisitionDate(bgt: BurdenedGiftTransferTaxInput): string {
  return ymd(bgt.acquisitionDate);
}

/**
 * 일시적 2주택 블록(세대 주택 수 2)이 열려 있고, 그 양도(증여) 시기에 두 주택의 조정 여부가 기한을
 * 바꾸면 판정 결과(`regulated`)를 돌려준다. 아니면 `null` — 새 입력 칸을 그리지 않고 검증하지 않는다.
 * 주택 여부(`propertyType === "housing"`)는 호출부가 확인한다(⑤는 주택 필드 세트 안에만 있다).
 */
export function giftBurdenedTempTwoHouseRegulatedGate(
  bgt: BurdenedGiftTransferTaxInput,
  giftDate: string | undefined,
  /** 증여 주택 법정동코드 — ④와 같은 `giftBurdenedRegionCode(item)` */
  regionCode: string | undefined,
): { regulated: RegulatedVerdict; newAcquisitionDate: string } | null {
  const tt = bgt.temporaryTwoHouse;
  if ((bgt.householdHousingCount ?? 1) !== 2 || !tt) return null;
  // 기존주택의 연장인 경위(원조합원 기존주택·자가 재건축)는 선후를 기존주택 취득일로 본다 — ④와 같은 값(결정 #43-4).
  const newAcquisitionDate = giftBurdenedEffectiveNewAcquisitionDate(bgt);
  const v = judgeTempTwoHouseFromForm({
    previousAcquisitionDate: giftBurdenedPreviousAcquisitionDate(bgt),
    newHouseAcquisitionDate: newAcquisitionDate,
    transferDate: giftDate ?? "",
    provisoReason: "",
    provisoDepartureDate: "",
    provisoExpropriationDate: "",
    provisoBusinessApprovalDate: "",
    residencePeriodMonths: String(bgt.residencePeriodMonths ?? 0),
    regionCode,
    // 지정 지구 안인가(#2055 후속) — ④와 같은 값(코드가 있을 때만 의미)
    regionInDesignatedDistrict: regionCode ? bgt.regionInDesignatedDistrict : undefined,
    isRegulatedArea: bgt.isRegulatedArea === true,
    // 신규 주택 소재지 코드(E-1 잔여 B) — ④ `toTemporaryTwoHouseEraFacts`와 같은 값
    newHouseRegionCode: tt.newHouseRegionCode || undefined,
    newHouseInDesignatedDistrict: tt.newHouseInDesignatedDistrict,
    // §155⑯·⑱(E-1 한계 G3) — ④가 싣는 값과 같다. ⑯이 「3년」을 5년으로 덮는 독법이면 조정 여부가 기한을 바꾸지 않아 ①2호 칸이 닫히고,
    //   조정→조정 단축 기한(2년·1년)이 나오는 독법이면 ⑯이어도 열린다(#29 — 판정 메뉴 `judgmentTempTwoHouseVerdict`와 같은 인자).
    ...giftBurdenedDeadlineJudgeArgs(bgt),
    // 권리 유래 신규 주택은 §155①1호 괄호의 「권리 취득」 시점을 그 권리 취득일로 본다 — ④·⑧과 같은 leaf(결정 #43-4).
    eraFields: eraFormWithOriginDates(tt, declaredNewHouseOriginOf(tt)),
  });
  if (v.status === "pending" || !v.regulated.relevant) return null;
  return { regulated: v.regulated, newAcquisitionDate };
}

/**
 * 신규 주택 소재지 주소 위젯(`AddressSearch`) → 저장 patch (E-1 잔여 B). 법정동코드는 PNU 앞 10자리 —
 * 양도세 계산기 명부 행(`buildHouseAddressPatch`)·증여 주택(`giftBurdenedRegionCode`)과 같은 규칙이다.
 * PNU가 없으면(직접 입력한 주소 · 지우기) 코드를 비운다 — 엔진은 선언으로 판정한다.
 */
export function giftBurdenedNewHouseAddressPatch(
  v: {
    jibun?: string;
    road?: string;
    pnu?: string;
  },
  /** 지금 저장된 신규 주택 법정동코드 — 바뀌면 「지정 지구 안인가」 답을 지운다(#2055 후속) */
  currentRegionCode?: string,
): { newHouseJibun: string; newHouseRegionCode: string; newHouseInDesignatedDistrict?: undefined } {
  const newHouseRegionCode = v.pnu && v.pnu.length >= 10 ? v.pnu.slice(0, 10) : "";
  return {
    newHouseJibun: v.jibun || v.road || "",
    newHouseRegionCode,
    ...(newHouseRegionCode !== (currentRegionCode ?? "") ? { newHouseInDesignatedDistrict: undefined } : {}),
  };
}

/**
 * §155① 일시적 2주택 사실을 **④가 싣고 ⑤가 확정 표시하는** 게이트 — 세대 주택 수 2 · 종전(= 증여 주택) 취득일 · 신규 취득일 입력.
 *
 * ④ 전송(`buildGiftBurdenedTransferBody`)·⑧ 검증(`giftBurdenedTempTwoHouseIncompleteError`)·⑤ 처분기한 예외 칸이 **같은 술어**를 쓴다
 * (1h-G1-4·G1-5 · 결정 #25). 종전에는 ④가 `temporaryTwoHouse` 객체 존재만 보내 (a) 주택 수를 2에서 3으로 바꿔 칸이 사라져도
 * 숨은 날짜가 실려 중첩 비과세가 서고 (b) 신규 취득일이 빈 채 객체만 있으면 ⑫ Zod 400이 났다.
 * 증여 화면에는 보유 주택 목록이 없어 3주택 중 어느 두 채가 일시적 2주택 짝인지 가릴 수 없으므로 주택 수 2에서만 연다.
 */
export function giftBurdenedTempTwoHouseInScope(bgt: BurdenedGiftTransferTaxInput): boolean {
  const tt = bgt.temporaryTwoHouse;
  return (bgt.householdHousingCount ?? 1) === 2 && !!tt && !!giftBurdenedPreviousAcquisitionDate(bgt) && !!ymd(tt.newAcquisitionDate);
}

/**
 * §155① 신규 주택의 **유효 취득일**(YYYY-MM-DD, 없으면 "") — 기존주택의 연장인 경위(원조합원 기존주택·자가 재건축)는 완공일이 아니라
 * 기존(헐기 전) 주택 취득일이다. ④ 전송·⑤ 조정 판정·⑧ 검증이 같은 값을 쓴다(결정 #43-4 · 양도세 명부 경로 `effectiveNewHouseAcquisitionDate`와 같은 술어).
 */
export function giftBurdenedEffectiveNewAcquisitionDate(bgt: BurdenedGiftTransferTaxInput): string {
  const tt = bgt.temporaryTwoHouse;
  const raw = ymd(tt?.newAcquisitionDate);
  return raw ? declaredNewHouseEffectiveAcquisitionDate(raw, tt ?? {}) : "";
}

/**
 * ⑧ — 신규 주택 취득 경위를 답했는데 앞뒤가 맞지 않는다(권리 취득일 누락·완공일보다 늦음·인가일이 승계취득일보다 늦음). 미답은 막지 않는다.
 * 게이트는 ④가 싣는 범위(`giftBurdenedTempTwoHouseInScope`)와 같다 — 신규 주택 취득일이 비었으면 그쪽 오류가 먼저 막는다.
 */
export function giftBurdenedNewHouseOriginError(bgt: BurdenedGiftTransferTaxInput): string | null {
  if (!giftBurdenedTempTwoHouseInScope(bgt)) return null;
  return declaredNewHouseOriginIssue(bgt.temporaryTwoHouse ?? {}, ymd(bgt.temporaryTwoHouse?.newAcquisitionDate))?.message ?? null;
}

/** §155①2호 처분기한 예외 입력(§155⑯·⑱ — E-1 한계 G3)의 ⑤④ 공용 게이트 — 위 {@link giftBurdenedTempTwoHouseInScope}와 같다. ⑧ 규칙은 없다. */
export function giftBurdenedTempTwoHouseDeadlineInScope(bgt: BurdenedGiftTransferTaxInput): boolean {
  return giftBurdenedTempTwoHouseInScope(bgt);
}

/**
 * ⑧ — 주택 수 2에서 §155① 입력 칸을 건드렸는데(객체가 있다) 신규 주택 취득일이 비었으면 막는다. ④는 이 상태를 싣지 않아
 * (미완성 사실은 불성립) 사용자가 쓴 값이 결과에 안 닿는다 — 침묵하지 않고 입력을 마치거나 비우도록 안내한다.
 * 주택 수가 2가 아니면 칸 자체가 없으므로 막지 않는다(영구 차단 방지 — 숨은 값은 ④가 싣지 않는다).
 */
export function giftBurdenedTempTwoHouseIncompleteError(bgt: BurdenedGiftTransferTaxInput): string | null {
  if ((bgt.householdHousingCount ?? 1) !== 2 || !bgt.temporaryTwoHouse) return null;
  if (ymd(bgt.temporaryTwoHouse.newAcquisitionDate)) return null;
  return "일시적 2주택(§155①) 신규 주택 취득일을 입력하세요. 이 특례를 적용하지 않으려면 입력한 §155① 항목을 비우세요.";
}

/**
 * 신규 주택 취득일 칸 저장 patch — 취득일을 비웠고 그 칸 밖에 쓴 §155① 항목(신규 주택 취득 경위는 취득일과 함께 비운다)이 없으면 객체를 통째로 `undefined`로 되돌린다.
 * DateInput은 날짜가 완성되기 전 매 키 입력마다 빈 값을 내므로, 되돌리지 않으면 한 글자만 쳐도 빈 객체가 생겨 ⑧이 막는다
 * (1h-G1-5). 다른 항목(소재지·처분기한 예외 등)이 있으면 지우지 않는다 — 사용자가 쓴 사실을 날려 보내지 않는다.
 */
export function giftBurdenedNewAcquisitionDatePatch(
  tt: TempTwoHouseFacts | undefined,
  newAcquisitionDate: Date | undefined,
  previousAcquisitionDate: Date | undefined,
): TempTwoHouseFacts | undefined {
  const next = {
    ...tt,
    previousAcquisitionDate: previousAcquisitionDate as unknown as Date,
    newAcquisitionDate: newAcquisitionDate as unknown as Date,
  } satisfies TempTwoHouseFacts;
  if (newAcquisitionDate) return next;
  /*
   * 취득일을 비우면 신규 주택 취득 경위(세 필드 — 결정 #43-4)도 함께 비운다. 경위는 그 신규 주택에 붙은 답이라 주택이 없으면 의미가 없고,
   * 남겨 두면 경위 라디오에 선택 해제가 없어 ⑧ 「입력한 §155① 항목을 비우세요」가 막다른 길이 된다.
   */
  next.newHouseOriginKind = undefined;
  next.newHouseRightAcquisitionDate = undefined;
  next.newHouseRightApprovalDate = undefined;
  const hasOtherFacts = Object.entries(next).some(
    ([k, v]) => k !== "previousAcquisitionDate" && k !== "newAcquisitionDate" && v !== undefined && v !== "" && v !== false,
  );
  return hasOtherFacts ? next : undefined;
}

/**
 * 증여세 폼 → 위젯(`TempTwoHouseDeadlineExceptionInputs`) 필드. 신규 주택 시·군 코드는 신규 주택 소재지
 * (`newHouseRegionCode` — 법정동코드 10자리)에서 파생한다 — 양도세 폼은 같은 주소 위젯의 PNU에서
 * `extractSigunguCodeFromPnu`로 얻는다(앞 5자리 + 0 — 법정동코드 앞 5자리와 같다).
 */
export function giftBurdenedDeadlineExceptionFields(
  bgt: BurdenedGiftTransferTaxInput,
): TempTwoHouseDeadlineExceptionFields {
  const tt = bgt.temporaryTwoHouse;
  return {
    publicInstitutionRelocation: tt?.publicInstitutionRelocation === true,
    relocatedInstitutionJibun: tt?.relocatedInstitutionJibun ?? "",
    relocatedSigunguCode: tt?.relocatedSigunguCode ?? "",
    newHouseJibun: tt?.newHouseJibun ?? "",
    newHouseSigunguCode: extractSigunguCodeFromPnu(tt?.newHouseRegionCode || undefined) ?? "",
    disposalDelayReason: tt?.disposalDelayReason ?? "",
    disposalDelayDisposedByThatMethod: tt?.disposalDelayDisposedByThatMethod === true,
  };
}

/** 판정 카드 leaf(`judgeTempTwoHouseFromForm`)에 넘길 §155⑯·⑱ 인자 — 게이트 밖이면 없음(④와 같다). */
function giftBurdenedDeadlineJudgeArgs(bgt: BurdenedGiftTransferTaxInput) {
  if (!giftBurdenedTempTwoHouseDeadlineInScope(bgt)) return {};
  const f = giftBurdenedDeadlineExceptionFields(bgt);
  return {
    publicInstitutionRelocation: f.publicInstitutionRelocation,
    relocatedSigunguCode: f.relocatedSigunguCode,
    newHouseSigunguCode: f.newHouseSigunguCode,
    disposalDelayReason: f.disposalDelayReason,
    disposalDelayDisposedByThatMethod: f.disposalDelayDisposedByThatMethod,
  };
}

/**
 * 위젯 patch → `temporaryTwoHouse` 저장 patch. 신규 주택 시·군 코드는 저장하지 않는다(소재지 법정동코드에서 파생 —
 * 신규 주택 소재지 선택은 `onNewHouseAddress` → `giftBurdenedNewHouseAddressPatch`가 저장한다).
 */
export function giftBurdenedDeadlineExceptionPatch(
  patch: Partial<TempTwoHouseDeadlineExceptionFields>,
): Partial<NonNullable<BurdenedGiftTransferTaxInput["temporaryTwoHouse"]>> {
  const out: Partial<NonNullable<BurdenedGiftTransferTaxInput["temporaryTwoHouse"]>> = {};
  if (patch.publicInstitutionRelocation !== undefined) out.publicInstitutionRelocation = patch.publicInstitutionRelocation;
  if (patch.relocatedInstitutionJibun !== undefined) out.relocatedInstitutionJibun = patch.relocatedInstitutionJibun;
  if (patch.relocatedSigunguCode !== undefined) out.relocatedSigunguCode = patch.relocatedSigunguCode;
  if (patch.disposalDelayReason !== undefined) out.disposalDelayReason = patch.disposalDelayReason;
  if (patch.disposalDelayDisposedByThatMethod !== undefined)
    out.disposalDelayDisposedByThatMethod = patch.disposalDelayDisposedByThatMethod;
  if (patch.newHouseJibun !== undefined) out.newHouseJibun = patch.newHouseJibun;
  return out;
}
