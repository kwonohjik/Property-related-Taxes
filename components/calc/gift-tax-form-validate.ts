/**
 * gift-tax-form-validate.ts — 증여세 폼 단계별 유효성 검사 (800줄 정책 분리)
 *
 * gift-tax-form-shared.tsx에서 validateStep 추출.
 * 외부 import는 gift-tax-form-shared.tsx의 re-export를 통해 노출됨.
 *
 * 정책:
 *   - 자동 안분 fallback 금지 — 미입력=차단 (메모리 feedback_no_silent_apportion_fallback)
 *   - API/UI fallback ↔ validate 동기화 (메모리 feedback_validation_sync_8th_point)
 */

import type { FormState } from "@/components/calc/gift-tax-form-shared";
import { DONOR_LABELS } from "@/components/calc/gift-tax-form-shared";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { evaluateAllEstateItems } from "@/lib/tax-engine/property-valuation";
import { computeEffectiveValuation } from "@/lib/calc/estate-item-valuation";
import {
  isSpecialTreatmentEligibleCategory,
  SPECIAL_TREATMENT_CATEGORY_BLOCK_REASON,
} from "@/lib/tax-engine/gift-special-stream";
import { isSameDonorGroup, getDonorGroup } from "@/lib/tax-engine/gift-prior-aggregation";
import { resolvePropertyType } from "@/lib/calc/gift-burdened-transfer-api";
import { validateVacancyPortion } from "@/lib/calc/estate-item-vacancy-validate";

/**
 * G-M4: 동일그룹 판정을 isSameDonorGroup 엔진 헬퍼로 재사용.
 * 기존 하드코딩 (A=부/모, B=조부모) → 전 그룹 자동 적용.
 */
export function validateStep(step: number, form: FormState): string | null {
  if (step === 0) {
    if (!form.giftDate) return "증여일을 입력하세요.";
    if (!form.donor) return "증여자를 선택하세요.";
    // §57① 단서 (isSubstituteGift): donor !== "grandparent"이면 UI가 토글 미노출.
    // API 변환(④)에서 undefined strip되므로 여기서 추가 검증 불필요 — 3중 패턴 준수.
  }
  if (step === 1) {
    if (form.giftItems.length + form.stockItems.length === 0) {
      return "증여재산을 1개 이상 입력하세요.";
    }
    const allItems = [...form.giftItems, ...form.stockItems];
    // cash·financial·deposit은 위치 기반 자산이 아니므로 자산명 선택 입력
    const needsName = allItems.filter(
      (it) => it.category !== "cash" && it.category !== "financial" && it.category !== "deposit"
    );
    if (needsName.some((it) => !it.name.trim())) {
      return "모든 증여재산에 자산명을 입력하세요.";
    }
    // §61⑤ 미임대(공실) 부분 입력 정합 (rental-vacancy-portion) — 상속과 동일 단일 헬퍼
    for (const it of form.giftItems) {
      const ve = validateVacancyPortion(it);
      if (ve) return ve;
    }
    // ─── 부담부증여 양도소득세 함께 계산 — 토글 ON 검증 ───
    // (설계 §9⑧ — 자동 안분 fallback 금지, 미입력=차단)
    const BURDENED_GIFT_RE_CATEGORIES = [
      "real_estate_land",
      "real_estate_building",
      "real_estate_apartment",
    ] as const;
    const bgItems = form.giftItems.filter(
      (it) =>
        it.burdenedGiftTransferTax !== undefined &&
        BURDENED_GIFT_RE_CATEGORIES.includes(
          it.category as (typeof BURDENED_GIFT_RE_CATEGORIES)[number],
        ),
    );
    // C-4: 다자산 동시 토글 ON 차단 (MVP 단일 자산 제한)
    if (bgItems.length > 1) {
      return "양도소득세 함께 계산은 자산 1건에만 켤 수 있습니다. (복수 토글 ON 비지원)";
    }
    if (bgItems.length === 1) {
      const bgItem = bgItems[0];
      const bgt = bgItem.burdenedGiftTransferTax!;
      const itemLabel = bgItem.name.trim() || "부담부증여 자산";

      // 필수: 취득일
      if (!bgt.acquisitionDate) {
        return `${itemLabel}: 취득일을 입력하세요. (양도소득세 계산 필수)`;
      }
      // housing 전용 — 거주기간 (resolvePropertyType 단일 진실로 dual-truth 방지)
      const propertyType = resolvePropertyType(bgItem.category, bgt.isHousing);
      // ─── 평가방식(valuationMode) 분기 검증 ───
      const valuationMode = bgt.valuationMode ?? "sangjeungbeop_standard";
      const isMarketMode = valuationMode === "sangjeungbeop_market";
      // 필수: 취득시 기준시가 — 단, 시가 모드 + 실지취득가액(K-4) + 비-토지 자산은 제외.
      //   K-1~3(기준시가 안분): 취득가액 = 취득시 기준시가 × 채무비율 → 산식 직접 인자(필수).
      //   K-5(환산): 환산취득가 분자 → 필수.
      //   K-4(실지): 비-토지 자산은 실지취득가액이 전액 건물분으로 귀속(landStd=0)되어
      //     취득시 기준시가가 양도차익 계산에 영향이 없음(inert) → 입력 불필요.
      //     토지는 공시지가 비율로 토지/건물 분배 라우팅에 필요 → 필수 유지.
      const acqStdPriceInert =
        isMarketMode && bgt.acquisitionMethod === "actual" && propertyType !== "land";
      if (
        !acqStdPriceInert &&
        (!bgt.standardPriceAtAcquisition || bgt.standardPriceAtAcquisition <= 0)
      ) {
        return `${itemLabel}: 취득시 기준시가를 입력하세요. (양도소득세 계산 필수)`;
      }

      if (isMarketMode) {
        // K-4/K-5 시가 모드: 분모 C (양도시 시가) 필수
        if (!bgt.marketValueAtTransfer || bgt.marketValueAtTransfer <= 0) {
          return `${itemLabel}: 시가 평가 시 양도시 시가(분모 C)를 입력하세요. (§159①1호 K-4/K-5 필수)`;
        }
        // 취득가액 산정방식 필수
        if (!bgt.acquisitionMethod) {
          return `${itemLabel}: 취득가액 산정방식(실지 또는 환산)을 선택하세요.`;
        }
        // K-4 실지: 실지취득가액 합계 필수
        if (bgt.acquisitionMethod === "actual") {
          if (!bgt.actualAcquisitionTotal || bgt.actualAcquisitionTotal <= 0) {
            return `${itemLabel}: 실지취득가액 합계를 입력하세요. (K-4 실지 모드 필수)`;
          }
        }
        // K-5 환산 + 토지: 양도시 기준시가 별도 필수
        if (bgt.acquisitionMethod === "converted" && propertyType === "land") {
          if (!bgt.landStdPriceAtTransfer || bgt.landStdPriceAtTransfer <= 0) {
            return `${itemLabel}: 토지 양도시(증여시) 기준시가(원/㎡)를 입력하세요. (K-5 환산 분모 필수)`;
          }
        }
        // K-5 환산 + 건물/주택: 양도시 기준시가(standardPrice = 분모) 침묵 0-base 차단 (소령 §176의2②2호)
        if (bgt.acquisitionMethod === "converted" && propertyType !== "land") {
          if (!bgItem.standardPrice || bgItem.standardPrice <= 0) {
            return `${itemLabel}: 양도시(증여시) 기준시가를 입력하세요. (K-5 환산 분모 필수)`;
          }
          // §114조의2 신축·증축: 신축일(취득일) 필수 (5년 기산 — 자동 fallback 금지)
          if (bgt.isSelfBuilt === true && !bgt.constructionDate) {
            return `${itemLabel}: 신축·증축 건물의 신축일(취득일)을 입력하세요. (§114조의2 5년 기산 필수)`;
          }
          // Phase 2 증축 필수 차단 — 자동 안분 fallback 금지
          if (bgt.isSelfBuilt === true && bgt.buildingType === "extension") {
            if (!bgt.extensionFloorArea || bgt.extensionFloorArea <= 0) {
              return `${itemLabel}: 증축부분 바닥면적 합계를 입력해 주세요. §114조의2① 85㎡ 초과 판정에 필요합니다.`;
            }
            if (!bgt.extensionStdPriceAtAcquisition || bgt.extensionStdPriceAtAcquisition <= 0) {
              return `${itemLabel}: 증축부분 취득시 기준시가를 입력해 주세요. §114조의2① 증축부분 한정 환산취득가 산출에 필요합니다.`;
            }
          }
        }
      } else {
        // 기준시가 모드(K-1~K-3): 양도시 기준시가 필수 — 건물·아파트 및 토지 모두
        // 토지: standardPrice = 개별공시지가 총액 (LandPriceLookupField with area prop → 총액 저장)
        // 주택·건물: standardPrice = 공동주택가격·건물기준시가
        if (!bgItem.standardPrice || bgItem.standardPrice <= 0) {
          const transferStdLabel =
            propertyType === "land"
              ? "양도시(증여시) 개별공시지가 총액"
              : "양도시(증여시) 기준시가";
          return `${itemLabel}: ${transferStdLabel}를 입력하세요. (양도소득세 §159 안분 분모 필수)`;
        }
      }

      if (propertyType === "housing" && bgt.isOneHousehold) {
        // 1세대1주택 비과세 판정 시 거주기간 필수 (H11)
        if (bgt.residencePeriodMonths === undefined || bgt.residencePeriodMonths < 0) {
          return `${itemLabel}: 1세대1주택 여부가 활성화되어 있으면 거주기간(개월)을 입력하세요.`;
        }
      }
      // C-4: 채무인수액(§47①) 필수 — assumedDebtForGift가 0이면 양도소득세 과세 대상 없음
      // (소득세법 §88: 유상양도 = 수증자 채무인수가 있어야 양도가액 발생)
      // Note: leaseDeposit·mortgageAmount는 §66 평가 목적 필드로 채무인수와 별개.
      const assumedDebt = bgItem.assumedDebtForGift ?? 0;
      if (assumedDebt <= 0) {
        return `${itemLabel}: 수증자 인수 채무액(§47①)을 입력하세요. 채무인수가 있어야 양도소득세가 발생합니다. "양도소득세 함께 계산" 토글을 끄거나 채무액을 입력하세요.`;
      }
    }
    // ─── end 부동산 부담부증여 양도소득세 ───

    // ─── 주식 부담부증여 양도소득세 검증 C-S1~C-S5 ───
    const stockBgItems = form.stockItems.filter(
      (it) => it.burdenedGiftStockTransferTax !== undefined,
    );
    // C-S1: 다자산 동시 ON 차단 (MVP)
    if (stockBgItems.length > 1) {
      return "주식 양도소득세 함께 계산은 1건에만 켤 수 있습니다. (복수 토글 ON 비지원)";
    }
    if (stockBgItems.length === 1) {
      const sbItem = stockBgItems[0];
      const sbgt = sbItem.burdenedGiftStockTransferTax!;
      const sbLabel = sbItem.name.trim() || "주식(부담부증여)";

      // C-S2: 채무인수액 필수
      const sbDebt = sbItem.assumedDebtForGift ?? 0;
      if (sbDebt <= 0) {
        return `${sbLabel}: 수증자 인수 채무액(§47①)을 입력하세요. 채무인수가 있어야 양도소득세가 발생합니다.`;
      }
      // C-S3: 시장 구분 필수
      if (!sbgt.marketType) {
        return `${sbLabel}: 시장 구분(KOSPI·KOSDAQ·KONEX·비상장)을 선택하세요.`;
      }
      // C-S4: 증여자 취득일 필수
      const sbAcqDate =
        sbgt.acquisitionDate instanceof Date
          ? sbgt.acquisitionDate.toISOString()
          : (sbgt.acquisitionDate as string | undefined);
      if (!sbAcqDate) {
        return `${sbLabel}: 증여자 취득일을 입력하세요. (§95 보유기간 계산 필수)`;
      }
      // C-S5: 취득가액 산정 방식 필수 + 실지 모드 취득가 필수
      if (!sbgt.acquisitionMode) {
        return `${sbLabel}: 취득가액 산정 방식(실지 또는 환산)을 선택하세요.`;
      }
      if (sbgt.acquisitionMode === "actual") {
        if (!sbgt.actualAcquisitionPrice || sbgt.actualAcquisitionPrice <= 0) {
          return `${sbLabel}: 실지취득가액(증여자 당초 취득가 합계)을 입력하세요.`;
        }
      }
    }
    // ─── end 주식 부담부증여 양도소득세 ───

    // §47① 채무인수액 > 재산평가액 경고 (차단 아님 — §47① 입증 후 허용 가능, 엔진 음수가드 위임)
    // 부동산(giftItems) + 주식(stockItems) 전수. 주식 평가액은 엔진 단일 진실(evaluateAllEstateItems)
    // — UI 자체 재계산 금지(dual-truth). 입력 미완성 예외는 try/catch → 0(경고 미발생, 엔진 위임).
    const debtCandidates = [...form.giftItems, ...form.stockItems];
    for (let i = 0; i < debtCandidates.length; i++) {
      const it = debtCandidates[i];
      const debtForGift = it.assumedDebtForGift ?? 0;
      if (debtForGift <= 0) continue;
      let valuation = 0;
      if (it.category === "listed_stock" || it.category === "unlisted_stock") {
        try {
          valuation = evaluateAllEstateItems([it])[0]?.valuatedAmount ?? 0;
        } catch {
          valuation = 0;
        }
      } else {
        // 부동산 gross 평가액 단일 진실(시가→감정→매매사례→기준시가 + 상업용 건물 부수토지 §61①1호).
        // §66 담보하한 미적용 gross — 채무초과 경고 의미 보존.
        valuation = computeEffectiveValuation(it);
      }
      if (valuation > 0 && debtForGift > valuation) {
        return `${it.name.trim() || `재산 ${i + 1}`}: 채무인수액(${debtForGift.toLocaleString()}원)이 평가액(${valuation.toLocaleString()}원)을 초과합니다. 입력값을 확인하세요. (과세가액 0으로 처리됩니다)`;
      }
    }
  }
  if (step === 2) {
    // 사전증여 입력 시 동일인 그룹·⑤·⑦ 필수 (UI ↔ validate 모순 방지)
    // G-M4: isSameDonorGroup 엔진 헬퍼 재사용 — 그룹 C~G 포함 전수 적용
    for (let i = 0; i < form.priorGifts.length; i++) {
      const p = form.priorGifts[i];
      if (p.giftAmount > 0) {
        if (!p.donor) {
          return `사전증여 ${i + 1}: 증여자를 선택하세요 (§47 합산 그룹 판정).`;
        }
        // §71 농지 감면 회차이면 감면받은 증여세액 필수 (5년 1억 한도 누계 — 수증자별, donor 그룹 무관)
        if (
          p.farmlandReductionApplied &&
          (!p.farmlandReductionAmount || p.farmlandReductionAmount <= 0)
        ) {
          return `사전증여 ${i + 1}: §71 농지 감면 회차이면 감면받은 증여세액을 입력하세요.`;
        }
        // 동일 그룹 priorGift이면 §58 한도 산식용으로 ⑤·⑦ 필수
        // (다른 그룹은 자동 무시되므로 검증 제외)
        // D2: 조특법 특례(§30의5/6) 회차는 §47 합산 제외 → §47 카드 미노출 → ⑤·⑦ 검증 면제
        if (isSameDonorGroup(p.donor, form.donor) && !p.specialTreatmentType) {
          if (!p.giftTaxBase || p.giftTaxBase <= 0) {
            return `사전증여 ${i + 1}: 동일인 합산 — 그 회차 합산과세표준 ⑤을 입력하세요.`;
          }
          if (!p.computedTax || p.computedTax <= 0) {
            return `사전증여 ${i + 1}: 동일인 합산 — 그 회차 산출세액 ⑦을 입력하세요.`;
          }
          if (p.wasGenerationSkip && !p.additionalGenerationSkipSurcharge) {
            return `사전증여 ${i + 1}: 세대생략 회차이면 추가 할증세액 ⑫를 입력하세요.`;
          }
        }
      }
    }
  }
  if (step === 3) {
    // §53의2③ 기공제액 — 엔진이 min(입력값, 1억) 가드를 처리하므로 UI 단계에서는 차단하지 않음.
    // 단, 음수 입력은 의미 없으므로 차단.
    const cumUsed = parseAmount(form.priorUsedMarriageBirthDeduction);
    if (cumUsed < 0) {
      return "이미 공제받은 혼인·출산 공제액은 0원 이상이어야 합니다.";
    }
    // 1억 초과 입력은 엔진 가드(min 처리)로 안전 처리됨 — UI 차단 없음 (모순 방지)

    // 엔진 superRefine 동기화 (⑧): 혼합 자산(N≥2)에서 특례 선택 시 귀속 미설정 차단.
    // 자산 1개는 엔진이 자동 귀속으로 처리하므로 차단 없음.
    // Zod superRefine(property-valuation-input.ts)과 동일 조건 — 미귀속(undefined) 1개라도
    // 있으면 차단. (일부만 태깅 후 신규 자산 추가 시 UI 통과↔API 400 모순 방지)
    if (form.specialTreatment !== "") {
      const allItems = [...form.giftItems, ...form.stockItems];
      if (allItems.length >= 2) {
        const unassigned = allItems.filter(
          (it) => it.isSpecialTreatmentAsset === undefined
        );
        if (unassigned.length > 0) {
          const label =
            form.specialTreatment === "startup" ? "창업자금" : "가업승계";
          return `${label} 특례 적용 시 모든 자산의 특례 귀속 여부를 선택하세요. (위 "특례 귀속 자산 선택" 항목 — 미선택 ${unassigned.length}개)`;
        }
      }

      // 특례 귀속 재산 종류 제약 — Zod superRefine 동기화 (⑧, R3 잔여 해소).
      // startup: 소법 §94① 재산(부동산·주식) 제외 (조특령 §27의5①) / family_business: 주식만 (§30의6①).
      // 단일 자산은 엔진 자동 귀속이므로 동일 검사 (Zod와 동일 조건 — UI 통과↔API 400 모순 방지)
      const effectiveSpecialItems =
        allItems.length === 1
          ? allItems
          : allItems.filter((it) => it.isSpecialTreatmentAsset === true);
      const ineligible = effectiveSpecialItems.filter(
        (it) =>
          !isSpecialTreatmentEligibleCategory(it.category, form.specialTreatment as "startup" | "family_business")
      );
      if (ineligible.length > 0) {
        return `특례 귀속 불가 재산 ${ineligible.length}개 — ${SPECIAL_TREATMENT_CATEGORY_BLOCK_REASON[form.specialTreatment as "startup" | "family_business"]}`;
      }
    }

    // §30의6① 가업 영위기간 — Zod min(0) 동기화 (음수만 차단).
    // 10년 미만은 엔진이 특례 불가 판정(일반 스트림 폴백)으로 안전 처리 — UI 차단 없음 (모순 방지)
    if (
      form.specialTreatment === "family_business" &&
      parseDecimal(form.familyBusinessYears) < 0
    ) {
      return "가업 영위기간은 0 이상이어야 합니다.";
    }

    // 상증령 §46①2호 동시증여 안분 (⑧) — Zod taxableValue.positive() 동기화.
    // §53(관계공제)·§53의2(혼인·출산공제) 모두 동시증여 안분(Phase 2) → 별도 차단 없음.
    if (form.simultaneousGifts !== undefined) {
      for (let i = 0; i < form.simultaneousGifts.length; i++) {
        if (parseAmount(form.simultaneousGifts[i].taxableValue) <= 0) {
          return `동시증여 ${i + 1}: 증여세 과세가액을 입력하세요. (자동 분할 없음 — §46①2호)`;
        }
      }
    }

    // D-2: 동시증여 다중 건 검증 (⑧ 지점) — 3-state: undefined skip, [] skip, [...] 전수 검증
    if (form.simultaneousGiftForms && form.simultaneousGiftForms.length > 0) {
      for (let i = 0; i < form.simultaneousGiftForms.length; i++) {
        const sub = form.simultaneousGiftForms[i];
        // 증여자 관계 필수
        if (!sub.donor) {
          return `동시증여 건 ${i + 1}: 증여자 관계를 선택하세요.`;
        }
        // 동일 그룹 차단 — 건 0(j=-1) + 앞선 모든 추가 건과 비교
        for (let j = -1; j < i; j++) {
          const otherDonor = j === -1 ? form.donor : form.simultaneousGiftForms[j].donor;
          if (otherDonor && isSameDonorGroup(sub.donor, otherDonor)) {
            const otherLabel = j === -1 ? "현재 신고 건" : `동시증여 건 ${j + 1}`;
            return `동시증여 건 ${i + 1}(${DONOR_LABELS[sub.donor]})이 ${otherLabel}(${DONOR_LABELS[otherDonor]})과 같은 동일인 그룹(상증법 §47②)입니다. 동일인의 증여는 한 건으로 합산해 입력하세요.`;
          }
        }
        // 증여재산 필수 (자동 안분 fallback 금지 정책 — ⑧)
        if (sub.giftItems.length + sub.stockItems.length === 0) {
          return `동시증여 건 ${i + 1}(${DONOR_LABELS[sub.donor]}): 증여재산을 1개 이상 입력하세요.`;
        }
      }
    }

    // 대납(代納) gross-up 차단 조합 ⑧ — Zod ⑫ superRefine과 동일 메시지
    if (form.donorPaysGiftTax === true) {
      // ⓐ 동시증여 + 대납
      if (form.simultaneousGifts && form.simultaneousGifts.length > 0) {
        return "동시증여와 대납(代納)은 현재 함께 계산할 수 없습니다.";
      }
      // ⓑ 2-스트림 특례 + 대납
      if (form.specialTreatment === "startup" || form.specialTreatment === "family_business") {
        return "가업·창업 특례(2-스트림)와 대납(代納)은 현재 함께 계산할 수 없습니다.";
      }
      // ⓒ 세대생략(donorGroup=B) + 대납
      if (getDonorGroup(form.donor) === "B") {
        return "세대생략 할증 대상 증여와 대납(代納)은 현재 함께 계산할 수 없습니다.";
      }
    }
  }
  return null;
}
