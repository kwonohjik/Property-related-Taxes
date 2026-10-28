/**
 * 일반건물 환산 경로의 **payload 정규화 + 카드 조립** — aggregate 직전까지의 순수 계산.
 *
 * ## 왜 `app/api/`에서 옮겨왔나 (2026-08-11)
 *
 * 이 세 함수는 원래 `app/api/calc/transfer/general-building-route-helper.ts`에 있었다. 그런데
 * 그 파일은 `calculateTransferTaxAggregate`(→ `lib/db/tax-rates` → `lib/supabase/server` →
 * `next/headers`)를 함께 import하므로 **클라이언트에서 불러올 수 없다** — 사이드바 환산 프리뷰가
 * 그 경로로 import하자 빌드가 통째로 깨졌다(`Ecmascript file had an error`).
 *
 * 세 함수 자체는 세율도 DB도 쓰지 않는 **순수 계산**이라 Layer 2(`lib/tax-engine/`)가 제자리다
 * (CLAUDE.md 2-Layer 원칙). route-helper는 여기서 re-export해 기존 호출부를 그대로 둔다.
 *
 * ⚠️ 이 파일에 **서버 전용 의존을 새로 들이지 말 것** — 클라이언트 프리뷰가 다시 깨진다.
 *    `lib/db/*`·`lib/supabase/*`·`next/headers`는 금지다.
 */

import { toOptionalDate } from "@/lib/api/date-coerce";
import { toEngineDonorBuilt } from "@/lib/api/donor-built-engine-input";
import type { DonorBuiltWire } from "@/lib/api/transfer-tax-schema-donor-built";
import { applyRatio } from "@/lib/tax-engine/tax-utils";
import { saleSplitContractOf } from "@/lib/tax-engine/sale-split-contract-judgment";
import { apportionByStdPrice } from "@/lib/tax-engine/std-price-apportion";
import { multiplyByArea } from "@/lib/tax-engine/area-utils";
import { apportionGiftTax } from "@/lib/tax-engine/carryover-gift-tax-apportion";
import { giftTaxedValue } from "@/lib/tax-engine/carryover-gift-tax-apportion";
import { buildGeneralBuildingAssetCards } from "@/lib/tax-engine/general-building-valuation";
import { resolveGeneralBuildingSwap } from "@/lib/tax-engine/general-building-swap";
import { attachBuildingDepreciation } from "@/lib/tax-engine/general-building-depreciation";
import type { GeneralBuildingInput } from "@/lib/tax-engine/general-building-valuation";

/** `generalBuildingValuation` payload — 엔진 input과 같은 모양. */
export type GeneralBuildingValuationPayload = GeneralBuildingInput;

/**
 * ⑭ 증여자 신축·증축(§114조의2) 신축일 변환 — **입력 도중(토글 ON · 신축일 아직 비어 있음)인 값은 버린다.**
 *
 * 이 함수의 클라이언트 호출자(사이드바 환산 프리뷰 `transfer-estimated-preview.ts`)는 ⑧이 막기 전의 미완성 폼으로 부른다 —
 * 엄격 변환(`toEngineDonorBuilt`)이 던지면 토글을 켜는 순간 페이지가 에러 바운더리로 떨어진다(E2E 로 실측).
 * 서버 route 는 ⑫(`z.string().date()`)가 빈 일자를 400 으로 먼저 막아 이 분기에 도달하지 않는다 — 여기서 버려도 침묵 오답이 되지 않는다.
 */
function coerceDonorBuilt(db: unknown, label: string) {
  const wire = db as DonorBuiltWire | undefined;
  return wire && wire.constructionDate ? toEngineDonorBuilt(wire, label) : undefined;
}

/**
 * 이월과세 서브객체 조립 — **파트 입력(신규)** 과 **엔진 모양(하위 호환)** 을 모두 받는다.
 *
 * 설계 D9-10. UI는 「증여 사건 1벌 + 파트 N벌」로 받고 엔진은 「파트마다 완결된 객체」를 원한다.
 * 그 간극을 여기서 메운다.
 *
 * - `carryoverGiftEvent` + `*CarryoverPart`가 있으면 **조립**한다.
 *   증여세 상당액은 영 §163의2②로 **산정**한다 — 사용자가 안분하지 않는다.
 * - 없으면 `*CarryoverTaxation`(엔진 모양)을 그대로 쓴다.
 *   🔴 이 경로를 없애면 API 직접 호출자와 기존 테스트 16건·GBF-27이 깨진다.
 *
 * ⚠️ **환산 모드 분자(`donorStandardPriceAtAcquisition`)는 여기서 카드로 못 보낸다** —
 *    `standardPriceAtAcquisition`은 엔진 카드 input 필드라 `buildProperties`가 싣는다.
 *    여기서는 서브객체에 담아 넘기고, 카드 조립 시점에 꺼낸다(설계 D9-8).
 */
function composeGbCarryover(gbRaw: Record<string, unknown>): {
  land?: Record<string, unknown>;
  building?: Record<string, unknown>;
} {
  const event = gbRaw.carryoverGiftEvent as Record<string, unknown> | undefined;

  const fromPart = (partRaw: unknown): Record<string, unknown> | undefined => {
    if (!event || !partRaw) return undefined;
    const part = partRaw as Record<string, unknown>;
    const assetValue = (part.giftDateAssetValue as number) ?? 0;
    // 영 §163의2②2호 분자 「해당 자산가액(증여세가 과세된 증여세 과세가액)」 = 평가액 − 당초 증여 때 인수한 채무. B 취득가액은 평가액 그대로다.
    const taxedValue = giftTaxedValue(assetValue, part.giftAssumedDebt as number | undefined);
    const donorBuilt = coerceDonorBuilt(part.donorBuilt, "buildingCarryoverPart");
    return {
      giftRegistryDate: toOptionalDate(event.giftRegistryDate),
      donorAcquisitionDate: toOptionalDate(part.donorAcquisitionDate),
      donorAcquisitionPrice: part.donorAcquisitionPrice,
      useEstimatedAcquisition: part.useEstimatedAcquisition === true,
      // 영 §163의2② — 산출세액 × (해당 자산가액 ÷ 과세가액)
      giftTaxAmount: apportionGiftTax(
        {
          giftTaxCalculated: (event.giftTaxCalculated as number) ?? 0,
          giftTaxBase: (event.giftTaxBase as number) ?? 0,
        },
        taxedValue,
      ),
      donorCapitalExpenditure: part.donorCapitalExpenditure,
      // 비교과세 시나리오 B 취득가액 — 평가액(채무를 빼지 않는다)
      giftDateValuation: assetValue,
      // ⑭ 당초 증여 때 인수한 채무 부분(매입분) — 위 필드를 하나씩 옮기는 갈래라 여기서 빠지면 침묵 strip 이다(PR-2 R1).
      //    집계 파생 단위(`transfer-tax-aggregate-debt-units.ts`)가 카드의 `carryoverTaxation.giftAssumedDebt`를 읽어 시나리오 A를 증여분·매입분으로 나눈다.
      ...(typeof part.giftAssumedDebt === "number" && part.giftAssumedDebt > 0 ? { giftAssumedDebt: part.giftAssumedDebt } : {}),
      // §97의2① 관계요건 — 증여 **사건**의 사실이라 토지·건물 두 파트에 같은 값이 실린다.
      donorRelation: event.donorRelation,
      donorDeceased: event.donorDeceased,
      exclusionDeclared: event.exclusionDeclared,
      // 환산 모드 분자 — 카드 조립 시 `standardPriceAtAcquisition`으로 꺼낸다(D9-8)
      donorStandardPriceAtAcquisition: part.donorStandardPriceAtAcquisition,
      // ⑭ 증여자 신축·증축(§114조의2, PR-5a) — 위 필드를 하나씩 옮기는 갈래라 여기서 빠지면 침묵 strip 이다. 신축일 string → Date.
      ...(donorBuilt ? { donorBuilt } : {}),
    };
  };

  const legacy = (raw: unknown): Record<string, unknown> | undefined => {
    if (!raw) return undefined;
    // `donorBuilt` 는 `...ct` 로 날것(문자열 신축일) 그대로 실려 가지 않게 떼어 내 변환한다 — 입력 도중 값이면 통째로 버린다.
    const { donorBuilt: rawDonorBuilt, ...ct } = raw as Record<string, unknown>;
    const donorBuilt = coerceDonorBuilt(rawDonorBuilt, "buildingCarryoverTaxation");
    return {
      ...ct,
      giftRegistryDate: toOptionalDate(ct.giftRegistryDate),
      donorAcquisitionDate: toOptionalDate(ct.donorAcquisitionDate),
      // ⑭ 증여자 신축·증축(§114조의2, PR-5a) — `...ct` 가 그대로 실어 오는 문자열 신축일을 Date 로 바꾼다(`Date < string` 침묵 false 방지)
      ...(donorBuilt ? { donorBuilt } : {}),
    };
  };

  return {
    land: fromPart(gbRaw.landCarryoverPart) ?? legacy(gbRaw.landCarryoverTaxation),
    building: fromPart(gbRaw.buildingCarryoverPart) ?? legacy(gbRaw.buildingCarryoverTaxation),
  };
}

/**
 * ⑭ **`generalBuildingValuation` payload의 Date 변환 단일 소스**.
 *
 * Zod는 대부분의 날짜를 `z.string().date()`로만 **검증**하고 `Date`로 바꾸지 않는다.
 * 미변환 값이 엔진에 도달하면 `from.getFullYear()`·`getTime()`이 런타임에 깨지거나
 * `Date < string` **침묵 false**에 빠진다(`lib/api/date-coerce.ts`).
 *
 * 🔴 **단건(`dispatchGeneralBuilding`)과 지분(`general-building-fractional.ts`)이 이 함수를
 *    공유해야 한다.** 지분 경로를 만들 때 이 변환을 건너뛰어 `conversionDate`가 문자열로
 *    도달, `eventDate.getTime is not a function`으로 500이 났다(2026-08-10 실측).
 *    새 진입점을 만들 때 변환을 다시 손으로 나열하지 말 것.
 *    (사이드바 환산 프리뷰도 이 함수를 쓴다 — `lib/calc/transfer-estimated-preview.ts`.)
 */
export function coerceGeneralBuildingPayload(
  gbRaw: Record<string, unknown>,
): Record<string, unknown> {
  // buildingAcquisitionDate: Zod는 z.string().date()로만 검증 — Date 객체로 변환 안 됨.
  // 미변환 시 string이 buildGeneralBuildingAssetCards()의 acquisitionDate에 도달 →
  // monthsBetween(from, to)에서 from.getFullYear() TypeError 발생.
  const buildingAcqDate = toOptionalDate(gbRaw.buildingAcquisitionDate);
  // M-1a — 토지 파트 취득일. 미주입 시 건물 취득일과 동일(분리 OFF)로 본다.
  const landAcqDateCoerced = toOptionalDate(gbRaw.landAcquisitionDate);

  // buildingAcquisitionCause: Zod 필수 강제 + normalizeAsset M-2 보완으로 항상 정의됨 보장.
  // silent fallback 제거 (정책 #1 — 자동 안분 fallback 금지).
  const buildingAcqCause = gbRaw.buildingAcquisitionCause as
    | "purchase" | "inheritance" | "gift" | "carryover_gift" | "newConstruction";
  // isSelfBuilt = buildingAcquisitionCause 에서 도출 (단일 진실 원천).
  const isSelfBuilt = buildingAcqCause === "newConstruction";

  // #4-a: 토지 상속·증여 보조 필드 Date 변환
  const decedentAcqDate = toOptionalDate(gbRaw.decedentAcquisitionDate);
  const donorAcqDate = toOptionalDate(gbRaw.donorAcquisitionDate);
  // 다른 피상속인/증여자 분리: 건물 전용 보조 필드 Date 변환
  const buildingDecedentAcqDate = toOptionalDate(gbRaw.buildingDecedentAcquisitionDate);
  const buildingDonorAcqDate = toOptionalDate(gbRaw.buildingDonorAcquisitionDate);

  // #7-b: 이월과세 서브객체 — 파트 입력(신규)을 엔진 모양으로 조립하고 Date를 변환한다.
  const { land: coercedLandCt, building: coercedBuildingCt } = composeGbCarryover(gbRaw);

  // ⑭ 사례 35: conversionDate Date 변환 (string → Date)
  const conversionDateCoerced = toOptionalDate(gbRaw.conversionDate);

  // ⑭ 사례 33: extensionInfo 내부 extensionDate Date 변환
  const extInfo = gbRaw.extensionInfo as Record<string, unknown> | undefined;
  const coercedExtInfo = extInfo
    ? {
        ...extInfo,
        extensionDate: toOptionalDate(extInfo.extensionDate),
      }
    : undefined;

  const coercedGbRaw: Record<string, unknown> = {
    ...gbRaw,
    ...(buildingAcqDate ? { buildingAcquisitionDate: buildingAcqDate } : {}),
    ...(landAcqDateCoerced ? { landAcquisitionDate: landAcqDateCoerced } : {}),
    isSelfBuilt,                         // boolean 도출 (gbRaw의 isSelfBuilt 덮어씀)
    buildingAcquisitionCause: buildingAcqCause,
    ...(decedentAcqDate ? { decedentAcquisitionDate: decedentAcqDate } : {}),
    ...(donorAcqDate ? { donorAcquisitionDate: donorAcqDate } : {}),
    ...(buildingDecedentAcqDate ? { buildingDecedentAcquisitionDate: buildingDecedentAcqDate } : {}),
    ...(buildingDonorAcqDate ? { buildingDonorAcquisitionDate: buildingDonorAcqDate } : {}),
    ...(coercedLandCt ? { landCarryoverTaxation: coercedLandCt } : {}),
    ...(coercedBuildingCt ? { buildingCarryoverTaxation: coercedBuildingCt } : {}),
    ...(coercedExtInfo ? { extensionInfo: coercedExtInfo } : {}),
    // ⑭ 양도시 감정평가가액의 **감정일자** — JSON 경유 후 문자열로 도착한다. `Date`로 바꾸지
    //    않으면 엔진의 유효 창 비교(`getTime()`)가 런타임에 깨진다(`lib/api/date-coerce.ts`).
    ...(gbRaw.appraisalDateAtTransfer
      ? { appraisalDateAtTransfer: toOptionalDate(gbRaw.appraisalDateAtTransfer) }
      : {}),
    // ⑭ 사례 35: 주택→상가 용도변경 필드 — Date 변환 후 GeneralBuildingInput에 주입
    ...(gbRaw.houseToCommercialConversion
      ? {
          houseToCommercialConversion: true,
          conversionDate: conversionDateCoerced,
          wasMultiHouseAtConversion: gbRaw.wasMultiHouseAtConversion ?? false,
        }
      : {}),
    // ⑭ 사례 35 후속-1: §99-164-10 환산주택가격 4필드 (number, Date 변환 불요)
    ...(gbRaw.hasFirstDisclosure
      ? {
          hasFirstDisclosure: true,
          firstDisclosurePrice: gbRaw.firstDisclosurePrice as number | undefined,
          firstDisclosureLandStdPrice: gbRaw.firstDisclosureLandStdPrice as number | undefined,
          firstDisclosureBuildingStdPrice: gbRaw.firstDisclosureBuildingStdPrice as number | undefined,
        }
      : {}),
  };
  return coercedGbRaw;
}

/**
 * 계약서 구분 기재 양도가액(「소득세법」 §100②)을 **지분 몫**으로 줄인다 — 지분 양도가액을 정하는 진입점(단건·지분 카드)이 부른다.
 *
 * 구분 가액은 물건 단위 100% 기준 입력이라(⑫가 전 지분 동일을 강제) 지분 양도가액(총액 × 지분율)과 합이 맞지 않아
 * 엔진이 「합 불일치」 400을 냈다. 토지만 × 지분율(버림)로 보내고 건물은 비운다 — 엔진이 「총액 − 토지」로 정한다
 * (한쪽 기재 규칙, `allocateBundledTransferPrice`). 그래서 1원 끝수로 합이 어긋나는 일이 구조적으로 없다.
 * 건물만 기재했으면 건물을 줄인다. 단독 소유(지분율 없음·1)면 그대로다.
 */
export function scaleDeclaredSaleSplitToShare(
  gbRaw: Record<string, unknown>,
  ownershipRatio: number | undefined,
  /**
   * 계약 총액(물건 전체 100%) — 한쪽만 기재한 계약서의 반대쪽을 정하는 데 쓴다. 단건 지분은 `totalPropertyTransferPrice`, 축 B는 총양도가.
   * 모르면 한쪽 기재 계약서는 종전처럼 지분 몫으로 판정한다(`saleSplitContractOf`).
   */
  contractTotal?: number,
): Record<string, unknown> {
  if (ownershipRatio === undefined || !(ownershipRatio > 0 && ownershipRatio < 1)) return gbRaw;
  const land = gbRaw.landTransferPrice as number | undefined;
  const building = gbRaw.buildingTransferPrice as number | undefined;
  if (land == null && building == null) return gbRaw;
  const out = { ...gbRaw };
  delete out.landTransferPrice;
  delete out.buildingTransferPrice;
  if (land != null) out.landTransferPrice = applyRatio(land, ownershipRatio);
  else out.buildingTransferPrice = applyRatio(building as number, ownershipRatio);
  // §100③은 줄이기 전 계약서 금액으로 판정한다 — 지분 몫은 따로 버림돼 30% 경계에서 결론이 뒤집힌다
  //   (`sale-split-100-3-share-scale-judgment.plan.md` Q-1 a). 금액(지분 몫)은 위 값 그대로 쓴다(Q-2 a).
  const contract = saleSplitContractOf(land, building, contractTotal, ownershipRatio);
  if (contract) out.saleSplitContract = contract;
  return out;
}

/**
 * 경로 A 카드 조립 — cards(`gbOut`) + §97②2호 swap 판정까지. aggregate **직전** 상태.
 *
 * 지분(%) 분할에서 지분마다 이것을 부른 뒤 카드를 concat해 aggregate를 1회만 한다
 * (설계 `transfer-general-building-fractional-share.engine.design.md` D5).
 * `swap`을 **여기서** 계산하는 것이 핵심이다 — 지분 루프 안에서 불리면 판정 단위가
 * 자동으로 「지분 × 파트」가 된다(계획서 §3-4).
 */
export function buildEstimatedGeneralBuildingCards(gbv: GeneralBuildingValuationPayload): {
  gbOut: ReturnType<typeof buildGeneralBuildingAssetCards>;
  swap: ReturnType<typeof resolveGeneralBuildingSwap>;
} {
  // buildingAcquisitionCause에서 isSelfBuilt 도출 (단일 진실 원천).
  // gbv.isSelfBuilt가 명시된 경우에도 buildingAcquisitionCause 우선 (deprecated 패턴 방어).
  const normalizedGbv: GeneralBuildingValuationPayload = {
    ...gbv,
    isSelfBuilt: gbv.buildingAcquisitionCause === "newConstruction",
  };
  const gbOut0 = buildGeneralBuildingAssetCards(normalizedGbv);
  // §97③ 감가상각비 — 원건물 카드에 싣는다. swap 비교(아래)와 buildProperties/buildApportionment가 같은 카드를 읽는다.
  const gbOut = { ...gbOut0, assetCards: attachBuildingDepreciation(gbOut0.assetCards, gbv.depreciationAmount) };
  /**
   * §97②2호 판정 단위 — **혼합 모드**면 파트 축, 그 밖에는 종전 **자산총액**(안 A).
   *
   * 🔴 종전에는 `landDirectExpenses !== undefined`만으로 파트 항목을 실었다. 그래서 파트가
   *    **실가인데 그 칸을 비우면** 항목 자체가 사라져 `resolvePerPart`가 그 파트를 건너뛰고
   *    (`estimatedCards.length === 0 → continue`), §100② 후문으로 그 파트에 안분됐어야 할
   *    **양도비가 통째로 소실**됐다(2026-08-13 실측: 토지 실가 + 건물 환산 · 양도비 3억 ·
   *    토지 자본적지출 공란에서 결정세액 434,548,681 — 토지 칸에 1원만 넣으면 344,916,000).
   *    ④ 변환도 truthy일 때만 실어 「0 입력」과 「미입력」이 같은 상태였다.
   *
   * ⇒ 판정 단위를 **모드**로 정한다. 두 파트의 모드가 다르면(혼합) 조문 취급 자체가 갈리므로
   *   (실가 파트 §97②1호 **가산** ↔ 환산 파트 같은 항 2호 단서 **택일**) 파트 축이 정본이고,
   *   자본적지출은 `?? 0`으로 둔다 — 「비움」이 그 파트를 판정에서 지우면 안 된다.
   *   모드 미지정의 기본값은 `applyPartAcqModes`(`general-building-part-acq.ts`)와 **같은**
   *   `"estimated"`다 — 두 곳이 갈리면 카드와 판정이 서로 다른 파트를 본다
   *   (`feedback_shared_predicate_argument_parity`).
   *
   * ⚠️ **「비-환산이면 파트 축」으로 넓히면 안 된다**(2026-08-13 실측 2건 red).
   *    두 파트가 **같은 모드**면 파트별 입력 칸이 애초에 존재하지 않는다 — 파트 산정방식·파트
   *    자본적지출 위젯은 **분리 ON에서만** 렌더되고(`GeneralBuildingAcquisitionCards`의
   *    `PartAcqModeField`), 분리 OFF에서는 모드가 자산 단위 플래그에서 파생될 뿐이다.
   *    그 상태에서 파트 축으로 전환하면 `resolvePerPart`가 읽지 않는 **자산 단위 자본적지출이
   *    조용히 사라진다**(분리 OFF·실가·증축 픽스처에서 8억이 나목에서 소실 — W-1b anchor).
   *    자산 단위 칸을 막는 validate V-8도 **분리 ON 안에만** 있다.
   *
   * 파트 자본적지출이 **명시**되면 모드가 같아도 파트 축을 유지한다 — 종전 계약이고, ④는
   * `bothEstimated`이면 파트 칸을 보내지 않으므로 실질적으로 분리 ON 입력에서만 성립한다.
   */
  const landMode = gbv.landAcqMode ?? "estimated";
  const buildingMode = gbv.buildingAcqMode ?? "estimated";
  /**
   * 🔴 **증축 × 원건물 두 파트 실가 계열이면 항상 파트 축**(2026-10-22 E-1 · `docs/00-pm/gb-extension-actual-expenses.plan.md`).
   *
   * 증축은 실가여도 이 3-way 경로로 온다. 같은 모드라 자산총액 판정으로 빠지면 그 판정은 **환산 카드에만** 나목을 배분해
   * 실가 카드의 자본적지출·양도비가 사라졌다(⑧ 통과 — 상속 C1 분리 OFF 자본적지출 + 양도비 3천만 → 필요경비 0).
   * 실가 파트는 「소득세법」 §97②1호 **가산**이라 파트 축 갈래 3(`addition`)이 정본이다 — 2-way 실가 경로
   * (`general-building-route-actual.ts` `resolvePartExpenses`)와 같은 규칙.
   * 위 ⚠️(같은 모드에서 파트 축으로 넓히면 자산 단위 자본적지출이 사라진다)는 아래 `assetCapexShare`로 해소한다 —
   * 파트 칸이 없는 파트는 자산 단위 자본적지출을 **취득시** 기준시가(토지 : 원건물)로 나눈 몫을 그 파트의 직접분으로 싣는다.
   */
  const extensionActual = gbv.extensionInfo !== undefined && landMode === "actual" && buildingMode === "actual";
  const usePartAxis =
    extensionActual ||
    landMode !== buildingMode ||
    gbv.landDirectExpenses !== undefined ||
    gbv.buildingDirectExpenses !== undefined;
  /** 자산 단위 자본적지출의 토지 : 건물 — 취득시 기준시가(토지 : 원건물) 비율(E-1). */
  const splitAssetCapex = (amount: number) =>
    amount > 0
      ? apportionByStdPrice(
          amount,
          multiplyByArea(gbv.acquisitionLandPricePerSqm ?? 0, gbv.landArea ?? 0),
          gbv.acquisitionBuildingStdPrice ?? 0,
        )
      : { land: 0, building: 0 };
  const assetCapex = extensionActual ? (gbv.capitalExpenditure ?? 0) : 0;
  const assetCapexShare = splitAssetCapex(assetCapex);
  /**
   * 증축 전 지출(2026-10-23 · `docs/00-pm/gb-extension-capex-timing.plan.md`) — 증축분에 배분하지 않는다.
   * 자산 단위 값은 토지분을 포함하므로 같은 취득시 기준시가 비율로 건물 몫을 구한다. 파트 칸이 있으면 그 칸의 증축 전 값이다.
   */
  const hasExtension = gbv.extensionInfo !== undefined;
  const assetCapexBefore = hasExtension
    ? Math.min(gbv.capitalExpenditureBeforeExtension ?? 0, gbv.capitalExpenditure ?? 0)
    : 0;
  const buildingBefore = !hasExtension
    ? 0
    : gbv.buildingDirectExpenses !== undefined
      ? (gbv.buildingDirectExpensesBeforeExtension ?? 0)
      : Math.min(splitAssetCapex(extensionActual ? assetCapexBefore : 0).building, assetCapexShare.building);
  const swap = resolveGeneralBuildingSwap(
    gbOut.assetCards,
    gbv.capitalExpenditure,
    gbv.transferExpense,
    {
      ...(usePartAxis
        ? {
            land: { direct: gbv.landDirectExpenses ?? assetCapexShare.land, mode: landMode },
            building: {
              direct: gbv.buildingDirectExpenses ?? assetCapexShare.building,
              mode: buildingMode,
              ...(buildingBefore > 0 ? { directBeforeExtension: buildingBefore } : {}),
            },
          }
        : {}),
      // 양도비는 파트로 나누지 않고 넘긴다 — 엔진이 §100② 후문(가액 비례)으로 안분한다.
      ...(gbv.transferExpense !== undefined ? { transferExpense: gbv.transferExpense } : {}),
    },
    // 자산총액 판정(두 파트 환산)의 증축 입력 — 증축 후 지출의 건물 몫은 토지 : 원건물 취득시 기준시가로(D-3).
    hasExtension && !usePartAxis
      ? {
          capexBeforeExtension: assetCapexBefore,
          capexAfterExtensionBuilding: splitAssetCapex((gbv.capitalExpenditure ?? 0) - assetCapexBefore).building,
        }
      : undefined,
  );
  return { gbOut, swap };
}
