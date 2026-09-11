/**
 * 상속세 클라이언트 측 validation (Phase G ⑧ 동기화 지점)
 *
 * UI 마법사에서 단계별 호출. API/Zod 검증 전 1차 차단으로 사용자 즉시 피드백.
 *
 * 정책 (CLAUDE.md ⑧):
 *   - API/UI fallback이 있는 필드는 validate도 동일 fallback 인식
 *   - UI 통과 ↔ validate 차단 모순 금지
 *   - 자동 안분 fallback 금지 — 미입력은 검증 오류
 */

import type {
  InheritanceTaxInput,
  EstateItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import { validateVacancyPortion } from "@/lib/calc/estate-item-vacancy-validate";
import { injectSavingsAccrualIfAuto } from "@/lib/tax-engine/property-valuation";
import { toOptionalDate } from "@/lib/api/date-coerce";
import { validateUnlistedStockV2 } from "./inheritance-validate-unlisted";
export { validateUnlistedStockV2 };
import {
  parseResidentNumber,
  isCompleteResidentNumber,
} from "@/lib/calc/resident-number";
import { endOfMonth, addMonths, format } from "date-fns";
import { validateAllExemptionInputs } from "./inheritance-validate-exemption";
// 800줄 분리 — 외부 import 호환 보존 (feedback_800line_split_export_preservation)
export {
  validateExemptionAreaInput,
  validateExemptionItemAllocations,
  validateRelatedStockInput,
  validateAllExemptionInputs,
} from "./inheritance-validate-exemption";


/**
 * 800줄 분리 — 항목 단위 검증자는 `inheritance-validate-items.ts` 로 이동했다.
 *
 * ⚠️ `export … from` **만으로는 이 파일 스코프에 이름이 들어오지 않는다.** 아래
 *    오케스트레이터가 이 함수들을 직접 호출하므로 `import` 도 함께 있어야 한다
 *    (재export는 외부 import 사이트 보존용 —
 *    [[feedback_800line_split_export_preservation]]).
 */
import {
  validateFamilyBusinessEstateItem,
  validateFamilyBusinessDates,
  validateFamilyBusinessEnterpriseSize,
  validateAdditionalFamilyBusinesses,
  validateFinancialSavingsFields,
  validateCryptoFields,
  validateEstateItemAllocations,
  validateDebtItemAllocations,
  validatePresumedItem,
  validatePriorGift,
  validateHeirReferences,
  validateCollateralDebtOptIn,
} from "./inheritance-validate-items";
export {
  validateFamilyBusinessEstateItem,
  validateFamilyBusinessDates,
  validateFamilyBusinessEnterpriseSize,
  validateAdditionalFamilyBusinesses,
  validateFinancialSavingsFields,
  validateCryptoFields,
  validateEstateItemAllocations,
  validateDebtItemAllocations,
  validatePresumedItem,
  validatePriorGift,
  validateHeirReferences,
  validateCollateralDebtOptIn,
  warnCollateralDebtDuplication,
} from "./inheritance-validate-items";

// ────────────────────────────────────────────────────
// 통합 validation (마법사 마지막 단계 또는 API 호출 전)
// ────────────────────────────────────────────────────

/**
 * 전체 InheritanceTaxInput validation. 첫 오류 발견 시 그 메시지 반환.
 * 다중 오류 수집은 별도 호출자 책임 (필요 시 추후 확장).
 */
export function validateInheritanceTaxInput(
  input: InheritanceTaxInput,
): string | null {
  if (!input.deathDate) return "상속개시일을 입력하세요.";
  if (input.estateItems.length === 0) return "상속재산을 1개 이상 입력하세요.";

  // ⑧ 장례비 음수 가드 (상증령 §9②) — Zod min(0) 통과 후에도 방어적 검증
  if (input.funeralExpense < 0) return "일반 장례비는 0원 이상이어야 합니다.";
  if (input.funeralBonganExpense !== undefined && input.funeralBonganExpense < 0) {
    return "봉안시설·자연장지 비용은 0원 이상이어야 합니다.";
  }
  if (input.heirs.length === 0)
    return "상속인·수유자를 1명 이상 등록하세요. (협의분할·법정상속분 안분의 기준)";

  // ⑧ 주민등록번호 필수 (자연인 전 관계, 법인 제외) — 앞 6자리에서 생년월일·성별 도출
  //    (계획서 의견1: 13자리 입력 받되 앞 7자리만 파싱, 뒷자리 체크섬 미검증)
  for (const heir of input.heirs) {
    if (heir.relation === "corporate") continue;
    const who = heir.name?.trim() || "상속인";
    if (!heir.residentNumber) {
      // 외국인 등록번호 등으로 주민번호가 없으면 생년월일 직접입력을 허용 (fallback)
      if (!heir.birthDate) {
        return `${who}의 주민등록번호를 입력하세요. (생년월일·성별 자동 도출 — 미입력 시 생년월일 직접 입력)`;
      }
    } else if (!isCompleteResidentNumber(heir.residentNumber)) {
      return `${who}의 주민등록번호 형식이 올바르지 않습니다. (13자리 숫자)`;
    } else if (!parseResidentNumber(heir.residentNumber) && !heir.birthDate) {
      return `${who}의 주민등록번호 앞자리에서 생년월일을 도출할 수 없습니다. 앞 7자리를 확인하거나 생년월일을 직접 입력하세요.`;
    }
  }

  // ⑧ 장애인공제(§20①4호)는 성별·연령별 기대여명 필요 → 장애인 heir 성별 필수 (자동추정 금지)
  for (const heir of input.heirs) {
    if (heir.isDisabled === true && !heir.gender) {
      const who = heir.name?.trim() || "장애인 상속인";
      return `${who}의 성별을 입력하세요. (장애인공제 §20①4호 — 성별·연령별 기대여명 기준)`;
    }

    // ⑧ Phase 4: §23의2② 부득이사유 날짜 정합성 검증 (비차단 경고 사유는 엔진 처리)
    if (heir.cohabitReasons && heir.cohabitReasons.length > 0) {
      const who = heir.name?.trim() || "동거 상속인";
      for (const reason of heir.cohabitReasons) {
        if (reason.startDate >= reason.endDate) {
          return `${who}의 부득이사유 종료일(${reason.endDate})은 시작일(${reason.startDate})보다 늦어야 합니다.`;
        }
        // endDate가 deathDate보다 늦으면 경고 (비차단 — clamp 처리되므로 validation 차단 안 함)
        // overseas_grad·medical 1년 미만 경고는 엔진이 hasMedicalUnder1YWarning 등으로 처리
      }
    }
  }

  // ⑧ 동거가족(§20 P1, 시령 §18①) 장애인도 동일 — 성별 필수 (자동추정 금지)
  for (const dep of input.deductionInput?.cohabitantDependents ?? []) {
    if (dep.isDisabled === true && !dep.gender) {
      const who = dep.name?.trim() || "동거가족";
      return `${who}의 성별을 입력하세요. (장애인공제 §20①4호 — 성별·연령별 기대여명 기준)`;
    }
  }

  // 비과세·불산입 입력 검증 (면적 §8③ + 특수관계법인 주식 §16② + 협의분할) — 단일 집계
  const exemptionErr = validateAllExemptionInputs(input.exemptions);
  if (exemptionErr) return exemptionErr;

  // §63④ 예금 auto 모드 pre-inject (H-1 패턴): 협의분할 합계 검증에 정확한 평가액 반영
  const deathDateObj = input.deathDate ? new Date(input.deathDate) : undefined;
  for (const rawItem of input.estateItems) {
    // §63④ 자동 계산 필수 필드 검증 (⑧ 동기화 지점)
    const sf = validateFinancialSavingsFields(rawItem);
    if (sf) return sf;
    // §60② 가상자산 필수 필드 검증 (⑧ 동기화 지점)
    const cf = validateCryptoFields(rawItem);
    if (cf) return cf;
    // auto 모드 pre-inject — 미수이자·원천징수세액 주입 후 협의분할 검증
    const item = deathDateObj ? injectSavingsAccrualIfAuto(rawItem, deathDateObj) : rawItem;
    const e = validateEstateItemAllocations(item);
    if (e) return e;
    // 가업상속공제 배타성·정합성 (2026-05-21, 상증법 §18의2)
    const fbe = validateFamilyBusinessEstateItem(item, input.deductionInput?.familyBusiness);
    if (fbe) return fbe;
    // 담보채무 §14 자동공제 opt-in 검증 (B8, 설계 §3-5)
    const cde = validateCollateralDebtOptIn(item);
    if (cde) return cde;
    // §61⑤ 미임대(공실) 부분 입력 정합 (rental-vacancy-portion)
    const ve = validateVacancyPortion(item);
    if (ve) return ve;
  }
  // 가업상속공제 요건 날짜 정합성 (Phase 1, 2026-06-02)
  const fbDateErr = validateFamilyBusinessDates(
    input.deductionInput?.familyBusiness,
    input.deathDate,
  );
  if (fbDateErr) return fbDateErr;
  // 기업 규모 요건 필수 입력 (IG-035 — 미입력이 「통과」로 굳는 것을 차단)
  const fbSizeErr = validateFamilyBusinessEnterpriseSize(input.deductionInput?.familyBusiness);
  if (fbSizeErr) return fbSizeErr;
  // 복수가업 추가 가업 입력 정합성 (PR-4, 상증령 §15④)
  const fbMultiErr = validateAdditionalFamilyBusinesses(input.deductionInput?.familyBusiness);
  if (fbMultiErr) return fbMultiErr;
  if (input.debtItems) {
    for (const di of input.debtItems) {
      const e = validateDebtItemAllocations(di);
      if (e) return e;
    }
  }
  if (input.presumedItems) {
    for (const pi of input.presumedItems) {
      const e = validatePresumedItem(pi);
      if (e) return e;
    }
  }
  for (const gift of input.preGiftsWithin10Years) {
    const e = validatePriorGift(gift);
    if (e) return e;
  }
  // 비상장주식 V2 입력 검증 (Phase 5-A)
  // ctx.evaluationDateFallback = deathDate — UI display fallback과 동일 fallback 인식 (CLAUDE.md ⑧)
  const evalCtx = { evaluationDateFallback: input.deathDate };
  for (const item of input.estateItems) {
    const e = validateUnlistedStockV2(item, evalCtx);
    if (e) return e;
    const lsErr = validateListedStockBesshi(item);
    if (lsErr) return lsErr;
  }
  const refErrs = validateHeirReferences(
    input.heirs,
    input.preGiftsWithin10Years,
    input.estateItems,
    input.debtItems ?? [],
    input.presumedItems ?? [],
  );
  if (refErrs.length > 0) return refErrs[0];

  // §30 단기재상속 교차검증 — 자동 안분 fallback 금지 (feedback_no_silent_apportion_fallback)
  // 신규 재산별 배열 모델 + legacy 단일 분수 모델 모두 처리.
  // ⑧ 체크리스트 "shortTermReinherit" 비활성 시 buildInput에서 필드 전부 undefined 전달.
  //    → shortTermCreditInput.shortTermReinheritAssets == null → hasArrayAssets = false
  //    → 아래 검증 블록 완전 통과 (UI 통과 ↔ validate 차단 모순 없음, CLAUDE.md ⑧).
  const shortTermCreditInput = input.creditInput;
  if (shortTermCreditInput) {
    const assets = shortTermCreditInput.shortTermReinheritAssets;
    const priorDeath = shortTermCreditInput.shortTermReinheritPriorDeathDate;
    const priorEstate = shortTermCreditInput.shortTermReinheritPriorEstateValue;
    const hasArrayAssets = assets != null && assets.length > 0;
    const hasLegacyAsset =
      shortTermCreditInput.shortTermReinheritAssetValue != null &&
      shortTermCreditInput.shortTermReinheritAssetValue > 0;
    const hasPrior = priorEstate != null && priorEstate > 0;

    // 1차(전의) 상속개시일 ≤ 2차 상속개시일
    if (priorDeath && input.deathDate && priorDeath > input.deathDate) {
      return "단기재상속 §30: 1차(전의) 상속개시일은 상속개시일보다 이후일 수 없습니다.";
    }

    if (hasArrayAssets) {
      // ── 재산별 배열 모델 (집행 30-22-1②) ──
      if (!hasPrior) {
        return "단기재상속 §30: 재상속분 재산을 입력한 경우 전의 상속재산가액(분모)을 입력해야 합니다.";
      }
      if (
        shortTermCreditInput.shortTermReinheritTaxPaid == null ||
        shortTermCreditInput.shortTermReinheritTaxPaid <= 0
      ) {
        return "단기재상속 §30: 재상속분 재산을 입력한 경우 전의 상속세 산출세액을 입력해야 합니다.";
      }
      let sum = 0;
      for (const a of assets!) {
        // 각 재산 priorValue ≤ 전의 상속재산가액 (비율≤1, 집행 30-22-1③)
        if (a.priorValue > priorEstate!) {
          return `단기재상속 §30: 재상속분 재산 "${a.name ?? ""}" 가액이 전의 상속재산가액을 초과할 수 없습니다.`;
        }
        sum += a.priorValue;
      }
      // Σ priorValue ≤ 전의 상속재산가액 (재상속분 합 ≤ 전상속재산)
      if (sum > priorEstate!) {
        return "단기재상속 §30: 재상속분 재산가액 합계가 전의 상속재산가액을 초과할 수 없습니다.";
      }
    } else if (hasLegacyAsset || hasPrior) {
      // ── legacy 단일 분수 모델 (§30②1호) — 분자·분모 동반 입력 강제 ──
      if (hasLegacyAsset && !hasPrior) {
        return "단기재상속 §30②1호 안분: 재상속분 재산가액을 입력한 경우 전의 상속재산가액도 함께 입력해야 합니다.";
      }
      if (!hasLegacyAsset && hasPrior) {
        return "단기재상속 §30②1호 안분: 전의 상속재산가액을 입력한 경우 재상속분 재산가액도 함께 입력해야 합니다.";
      }
      if (hasLegacyAsset && hasPrior) {
        const numerator = shortTermCreditInput.shortTermReinheritAssetValue!;
        if (numerator > priorEstate!) {
          return "단기재상속 §30②1호: 재상속분 재산가액(분자)이 전의 상속재산가액(분모)을 초과할 수 없습니다.";
        }
      }
    }
  }

  // §29 외국납부세액공제 교차검증 (상증령 §21①)
  // ⑧ 체크리스트 "foreignTax" 비활성 시 buildInput에서 foreignTaxPaid·foreignInheritanceTaxBase
  //    모두 undefined 전달 → 아래 if(base != null) / if(paid == null) 분기 전부 미진입.
  //    UI 통과 ↔ validate 차단 모순 없음 (CLAUDE.md ⑧).
  const foreignCreditInput = input.creditInput;
  if (foreignCreditInput) {
    const base = foreignCreditInput.foreignInheritanceTaxBase;
    const paid = foreignCreditInput.foreignTaxPaid;
    // V-29-2: 음수 차단 (Zod nonnegative 동기화)
    if (base != null && base < 0) {
      return "외국납부세액공제 §29: 국외 상속재산 과세표준은 0 이상이어야 합니다.";
    }
    // V-29-3: 과세표준만 입력 + 외국납부세액 미입력 → 무의미 입력 차단
    // (역방향 — 외국세액만 입력·과표 미입력 → 한도 0으로 공제 0, UI hint 안내. 차단 안 함)
    if (base != null && base > 0 && (paid == null || paid <= 0)) {
      return "외국납부세액공제 §29: 국외 상속재산 과세표준을 입력하려면 외국에서 납부한 상속세액도 입력해야 합니다.";
    }
  }

  // ⑧ §23 재해손실공제 검증 (2026-06-07)
  // 3중 패턴: API max(0,loss−comp) fallback ↔ validate 동일 fallback (UI 통과 ↔ validate 차단 모순 금지)
  const casualtyLoss = input.deductionInput?.casualtyLoss;
  if (casualtyLoss !== undefined) {
    // 1. 재해손실재산가액 필수, 0 초과
    if (!casualtyLoss.lossValue || casualtyLoss.lossValue <= 0) {
      return "재해손실재산가액을 입력하세요. (§23 재해손실공제)";
    }
    // 2. 재난 발생일 필수
    if (!casualtyLoss.disasterDate) {
      return "재난 발생일을 입력하세요. (§23 재해손실공제)";
    }
    // 3. 재난 발생일 ≥ 상속개시일 (하한 — §23: 상속개시 후 재해)
    if (input.deathDate && casualtyLoss.disasterDate < input.deathDate) {
      return "재난은 상속개시일 이후 발생해야 합니다. (§23 — 상속개시 후 신고기한 이내)";
    }
    // 4. 재난 발생일 ≤ 신고기한(상속개시월 말일 + 6개월) (상한)
    if (input.deathDate) {
      const deathDateObj = toOptionalDate(input.deathDate);
      if (deathDateObj) {
        const filingDeadline = format(addMonths(endOfMonth(deathDateObj), 6), "yyyy-MM-dd");
        if (casualtyLoss.disasterDate > filingDeadline) {
          return `§23 요건: 신고기한(${filingDeadline}) 이내 발생한 재난이어야 합니다.`;
        }
      }
    }
    // 5. 보전가능금액 > 손실재산가액 차단 (전액보전=0은 허용 — max(0,…) fallback과 동기화)
    const compensated = casualtyLoss.compensatedValue ?? 0;
    if (compensated > casualtyLoss.lossValue) {
      return "보전가능금액이 재해손실재산가액을 초과합니다. 보전가능금액은 손실액 이하여야 합니다.";
    }
  }

  // ⑧ G4 §23의2① 주택부수토지 면적한도 — 4필드 partial 입력 차단 (전부 또는 전무)
  // 자동 안분 fallback 금지: 미입력=차감 없음이므로, 일부만 입력 시 의도 불명확 → 오류 차단
  {
    const di = input.deductionInput;
    const hasArea = di?.ancillaryLandArea !== undefined;
    const hasFootprint = di?.buildingFootprintArea !== undefined;
    const hasRegion = di?.ancillaryLandRegion !== undefined;
    const hasLandPrice = di?.ancillaryLandStdPrice !== undefined;
    const filledCount = [hasArea, hasFootprint, hasRegion, hasLandPrice].filter(Boolean).length;
    if (filledCount > 0 && filledCount < 4) {
      return "주택부수토지 면적한도(§23의2①): 부수토지 면적·건물 정착 면적·지역 구분·부수토지 공시가격 네 항목을 모두 입력하거나 모두 비워야 합니다.";
    }
  }

  /**
   * ⑧ 🔴 G-07 B1 — 신고불성실가산세 축 필수 입력 (「국세기본법」 §47의2·§47의3).
   *
   * 미입력을 통과시키면 엔진이 **조용히 납세자에게 불리한 값**을 낸다 —
   * 기한후신고일이 없으면 §48②2호 감면 구간을 가를 수 없어 감면율 0(가산세 전액)이 되고,
   * 당초 신고세액이 없으면 §47의3① base 가 결정세액 전액이 되어 과대 산출된다.
   * 「자동 안분 fallback 금지 — 미입력은 검증 오류로 차단」과 같은 층위다.
   */
  {
    const fp = input.filingPenalty;
    if (fp?.filingStatus === "late" && !fp.actualFilingDate) {
      return "기한후신고일을 입력하세요. (국세기본법 §48②2호 감면 구간 판정에 필요)";
    }
    if (fp?.filingStatus === "on_time" && fp.isUnderReported) {
      if (fp.originalFiledTax === undefined) {
        return "당초 신고세액을 입력하세요. (국세기본법 §47의3① 「과소신고한 납부세액」 산정에 필요)";
      }
      if (fp.originalFiledTax < 0) {
        return "당초 신고세액은 0원 이상이어야 합니다.";
      }
    }
    /**
     * 🔴 G-07 B3 — 납부지연가산세(§47의4). 미납세액이 있는데 **법정납부기한이 없으면**
     * 산정기간을 세울 수 없어 가산세가 조용히 0이 된다(납세자에게 유리한 방향의 침묵도
     * 결함이다 — 실제 고지세액과 갈린다).
     *
     * 🔑 기한을 **자동으로 채우지 않는다** — 상증법 §70①은 연부연납·납부유예·물납
     *    신청분을 자진납부 대상에서 빼고 §70② 분납은 기한이 2개월 뒤다.
     */
    if ((fp?.unpaidTax ?? 0) > 0 && !fp?.paymentDeadline) {
      return "법정납부기한을 입력하세요. (국세기본법 §47의4①1호 산정기간의 기산점)";
    }
  }

  return null;
}

// ────────────────────────────────────────────────────
// 상장주식 평가조서(갑·을) 입력 검증 — §63②3호·§63③ 분기
// Plan: docs/00-pm/listed-stock-besshi-form-replica.plan.md
// 정책: 자동 fallback 금지 ([[feedback_no_silent_apportion_fallback]])
// ────────────────────────────────────────────────────

export function validateListedStockBesshi(item: EstateItem): string | null {
  if (item.category !== "listed_stock") return null;

  // §63②3호 분기 활성 시 액면가·배당률·배당기산일 필수
  if (item.isCapitalIncreaseUnlistedShare) {
    if (!item.faceValuePerShare || item.faceValuePerShare <= 0) {
      return `자산 "${item.name}" §63②3호 — 1주당 액면가 입력 필요`;
    }
    if (item.priorDividendRate == null || item.priorDividendRate < 0) {
      return `자산 "${item.name}" §63②3호 — 직전기 배당률 입력 필요 (0 허용)`;
    }
    if (!item.dividendBaseDate && !item.dividendBaseDateSameAsListed) {
      return `자산 "${item.name}" §63②3호 — 배당기산일 또는 '상장일자 동일' 토글 필요`;
    }
  }

  // §63③ 최대주주 토글 시 기업규모 필수
  if (item.isMaxShareholder && !item.companySize) {
    return `자산 "${item.name}" §63③ — 기업 규모 (중소·중견·대기업) 입력 필요`;
  }

  // §53⑧2호 전부매각 — 선택 시 매매계약일 필수 (게이트 missing_input 차단).
  // isMaxShareholder 가드: 엔진(resolveListedPremiumRate)이 최대주주 아니면 2호를 읽지 않음 — 정합.
  // allSharesSold·meetsArticle49_1_1 미체크는 차단 아님(요건 불충족=할증 적용).
  if (
    item.isMaxShareholder &&
    item.premiumExclusionReason === "all_sold_within_6m" &&
    !item.section53_8_2?.saleContractDate
  ) {
    return `자산 "${item.name}" §53⑧2호 — 매매계약일 입력 필요`;
  }

  return null;
}

// ────────────────────────────────────────────────────
// 비상장주식 V2 평가 입력 검증 (Phase 5-A)
// Plan: docs/00-pm/inheritance-unlisted-stock-valuation-besshi-4-buppyo-3.plan.md
// KoreanLaw 검증 2026-05-22: §54④ 4호 삭제 / 조특법 §101 삭제
// ────────────────────────────────────────────────────


// ────────────────────────────────────────────────────
// CV-1·CV-3 동거주택 자산 유형 경고 (비차단)
// ────────────────────────────────────────────────────

/**
 * CV-1: isCohabitantHouse=true 자산에 cohabitHouseRightType 미선택 → 경고(차단 아님).
 * CV-3: cohabitHouseRightType ∈ {one_plus_one_right, sale_right} + 공제 금액 입력 → 경고.
 * 설계 §23의2 EN-3(B): fallback 없음, 미선택=경고·undefined → 엔진 적용(house 동일 처리).
 */
export function warnCohabitHouseRightType(
  estateItems: EstateItem[],
  cohabitHouseStdPrice: string | undefined,
  cohabitDirectAmount: string | undefined,
): string[] {
  const warnings: string[] = [];

  const cohabitItems = estateItems.filter((i) => i.isCohabitantHouse === true);
  for (const item of cohabitItems) {
    const rightType = item.cohabitHouseRightType;
    const name = item.name?.trim() || "동거주택 자산";

    // CV-1: 유형 미선택
    if (!rightType) {
      warnings.push(
        `"${name}"의 §23의2 자산 유형(일반주택·입주권·분양권)을 선택하지 않았습니다. ` +
          `미선택 시 일반주택(공제 적용)으로 계산됩니다.`,
      );
    }

    // CV-3: 미적용 유형인데 공제 금액 입력
    if (
      (rightType === "one_plus_one_right" || rightType === "sale_right") &&
      (Number(cohabitHouseStdPrice) > 0 || Number(cohabitDirectAmount) > 0)
    ) {
      warnings.push(
        `"${name}"은 §23의2 미적용 자산이므로 동거주택공제는 0으로 처리됩니다. ` +
          `공제 금액 입력란은 무시됩니다.`,
      );
    }
  }

  return warnings;
}
