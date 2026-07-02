/**
 * 양도소득세 계산기 단계별 유효성 검사 (Step1·Step3 통합 후 4단계)
 *
 * step 0: 자산 목록 (취득상세·환산취득가·1990·신축증축 모두 포함)
 * step 1: 보유 상황
 * step 2: 감면·공제
 * step 3: 가산세 (선택)
 *
 * 구조 (2026-06-12 오류 일괄 수집 도입):
 * - collectStepIssues: 한 단계의 모든 차단 오류를 일괄 수집 (두더지잡기식 1건 노출 제거).
 *   자산 내부는 첫 오류 1건, 자산 간·폼 수준은 전부 수집.
 * - validateStep / validateStepDetailed: collectStepIssues의 첫 항목 위임 —
 *   검증 규칙 단일 진실 유지 (기존 호출처·테스트 호환).
 * - 자산-수준 검증은 transfer-tax-validate-asset.ts로 분리 (800줄 정책).
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { validateAssetEntry, todayLocalISO } from "./transfer-tax-validate-asset";
import { validateStep2Reductions } from "./transfer-tax-validate-reductions";

/**
 * 검증 실패 정보 — 메시지 + 단계 + (자산 단위 오류 시) 자산 인덱스.
 * assetIndex가 있으면 UI에서 해당 자산 카드로 자동 스크롤 + 인라인 에러 배너 표시.
 */
export interface ValidationIssue {
  message: string;
  step: number;
  /** 자산-수준 오류일 때 0-based 자산 인덱스 (스크롤·인라인 표시 대상) */
  assetIndex?: number;
}

/**
 * 한 단계에서 발견되는 모든 차단 오류를 수집한다(첫 오류에서 멈추지 않음).
 *
 * - handleNext: 진행 차단 + 오류 전부를 한 번에 표시.
 * - stepStatuses: 각 단계 완료/주의 배지 산정 — 오류 0건이면 "complete".
 *
 * push 순서는 기존 validateStepDetailed의 검사 순서와 동일하게 유지 —
 * [0]이 기존 첫 오류와 동치 (anchor: transfer-validate-detailed.test.ts).
 */
export function collectStepIssues(step: number, form: TransferFormData): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // step 0: 자산 목록 (취득 정보 통합)
  if (step === 0) {
    if (!form.assets || form.assets.length === 0) {
      // 자산이 없으면 자산-수준 후속 검증이 무의미 — 단독 반환
      issues.push({ step, message: "자산을 최소 1건 입력하세요." });
      return issues;
    }
    // 양도일·신고일 위젯이 주 자산 카드 ① 안으로 이동 — assetIndex 0으로 해당 카드 스크롤·인라인 유도
    // (step은 유지 — 스크롤 게이트가 assetIndex != null AND step === 0 동시 충족 필요)
    if (!form.transferDate) issues.push({ step, assetIndex: 0, message: "양도일을 선택하세요." });
    // 신고일 < 양도일 모순 — 예정신고는 양도 후에만 가능 (법 §105①: 양도일이 속하는 달의 말일부터 2개월).
    // 양도 당일 신고는 허용, 미만만 차단. 기한 초과는 가산세 자동 적용 경고로 별도 처리(차단 아님).
    if (form.filingDate && form.transferDate && form.filingDate < form.transferDate)
      issues.push({ step, assetIndex: 0, message: `신고(예정)일(${form.filingDate})이 양도일(${form.transferDate})보다 빠릅니다. 예정신고는 양도 후에만 가능합니다.` });
    // 부담부증여(소령 §159) 모드는 양도가액 = 인수채무액으로 엔진 자동 산정이므로 contractTotalPrice 검증 면제.
    const allBurdenedGift = form.assets.every((a) => a.transferType === "burdened_gift");
    if (!allBurdenedGift) {
      if (!form.contractTotalPrice || parseAmount(form.contractTotalPrice) <= 0)
        issues.push({ step, message: "총 양도가액을 입력하세요." });
    }

    // 자산별 검증 — 자산당 첫 오류 1건씩 일괄 수집
    for (let i = 0; i < form.assets.length; i++) {
      const message = validateAssetEntry(form.assets[i], i, form);
      if (message) issues.push({ step, assetIndex: i, message });
    }

    // 지분 분할 모드(토글 B) 미입력 차단 — ownership 분자/분모 빈칸 = "지분율 미입력" 신호.
    // 함께양도는 100/100 비빈칸이라 미해당. UI 토글 상태 없이 form만으로 판정 (옵션 c).
    for (let i = 0; i < form.assets.length; i++) {
      const a = form.assets[i];
      const numEmpty = !a.ownershipNumerator || a.ownershipNumerator.trim() === "";
      const denEmpty = !a.ownershipDenominator || a.ownershipDenominator.trim() === "";
      if (numEmpty || denEmpty)
        issues.push({
          step,
          assetIndex: i,
          message: "지분 분할 취득: 공유 지분율(분자/분모)을 입력하세요.",
        });
    }

    // actual 모드 합계 검증 — 지분 모드 자산이 하나라도 있으면 ratio 자동 적용으로 합계 검증 생략.
    // 동일 물건 지분 단계취득은 ratio 합 = 100% 가정으로 시스템이 자동 분배.
    const anyFractional = form.assets.some((a) => {
      const n = parseFloat(a.ownershipNumerator || "100");
      const d = parseFloat(a.ownershipDenominator || "100");
      return isFinite(n) && isFinite(d) && d > 0 && n > 0 && n < d;
    });
    if (form.assets.length > 1 && form.bundledSaleMode === "actual" && !anyFractional) {
      const sumActual = form.assets.reduce(
        (s, a) => s + parseAmount(a.actualSalePrice),
        0,
      );
      if (sumActual !== parseAmount(form.contractTotalPrice))
        issues.push({ step, message: "구분 기재된 양도가액 합이 총 양도가액과 일치하지 않습니다." });
    }
  }

  // step 1: 보유 상황 (구 step 3)
  if (step === 1) {
    if (!form.householdHousingCount)
      issues.push({ step, message: "세대 보유 주택 수를 선택하세요." });

    // P5 모드 2 (⑧): 보유 감면주택 행 — 조문·취득일 필수 (확인 토글은 낙관 — 엔진 불적용 사유)
    const she = form.specialHouseExclusions ?? [];
    for (let i = 0; i < she.length; i++) {
      if (!she[i].article) {
        issues.push({ step, message: `보유 감면주택 ${i + 1}: 적용 조문을 선택하세요.` });
        continue; // 행 내부는 첫 오류 1건
      }
      if (!she[i].houseAcquisitionDate && !she[i].houseContractDate)
        issues.push({ step, message: `보유 감면주택 ${i + 1}: 감면주택의 취득일(또는 매매계약일)을 입력하세요.` });
    }

    // ⑧ 세대 보유 주택 목록 — 행별 첫 오류 1건씩 (자동 안분 fallback 금지: 미입력=차단)
    const houses = form.houses ?? [];
    for (let i = 0; i < houses.length; i++) {
      const h = houses[i];
      const label = `보유 주택 ${i + 1}`;
      const firstError = (() => {
        if (!h.acquisitionDate) return `${label}: 취득일을 입력하세요.`;
        if (!h.officialPrice || parseAmount(h.officialPrice) <= 0)
          return `${label}: 기준시가(공시가격)를 입력하세요.`;
        // 상속주택 5년 배제는 상속개시일이 있어야 기산 (소령 §167의3①7호) — 미입력 시 배제 미발동 → 차단
        if (h.isInherited && !h.inheritedDate)
          return `${label}: 상속주택이면 상속개시일을 입력하세요. (상속 5년 중과배제 판정 기준)`;
        // 장기임대 등록 경로: 등록사업자 선택 시 등록일 2종·임대기간 필수
        if (h.isLongTermRental && h.isRegisteredRental) {
          if (!h.rentalRegistrationDate) return `${label}: 임대사업자 등록일을 입력하세요.`;
          if (!h.businessRegistrationDate) return `${label}: 사업자 등록일을 입력하세요.`;
          if (!h.rentalPeriodYears || parseFloat(h.rentalPeriodYears) <= 0)
            return `${label}: 임대기간(년)을 입력하세요.`;
        }
        // 장기임대 9유형: 유형별 필수 입력값(가액·면적·날짜) — 미입력 시 엔진 오판정
        // (특히 면적 미입력 → 엔진 0 간주 → 298㎡ 이하 통과 → 과대 적용). exact 비교(.includes(t)=정확매칭).
        if (h.isLongTermRental && h.rentalType) {
          const t = h.rentalType;
          if (["A", "C", "E", "F", "H", "I"].includes(t) && !h.rentalStartOfficialPrice)
            return `${label}: 임대개시 당시 공시가격을 입력하세요.`;
          if (["B", "D"].includes(t) && !h.acquisitionOfficialPrice)
            return `${label}: 취득 당시 공시가격을 입력하세요.`;
          if (["C", "D", "F", "I"].includes(t) && (!h.rentalLandArea || !h.rentalTotalFloorArea))
            return `${label}: 대지면적·연면적(㎡)을 입력하세요.`;
          if (t === "D" && !h.firstSaleContractDate)
            return `${label}: 최초 분양계약일을 입력하세요.`;
          if (t === "G" && !h.rentalCancellationDate)
            return `${label}: 자진·자동 말소일을 입력하세요.`;
        }
        // P2 부득이한 사유: 거주기간(년) 필수 (엔진 ≥1년 판정 — 미입력 시 0 간주로 배제 미발동)
        if (h.isUnavoidableReason && (!h.unavoidableResidenceYears || parseFloat(h.unavoidableResidenceYears) <= 0))
          return `${label}: 부득이한 사유 주택의 거주기간(년)을 입력하세요.`;
        return null;
      })();
      if (firstError) issues.push({ step, message: firstError });
    }

    // ⑧ 양도 주택 3주택+ 전용 배제 특례 — 사원주택/어린이집 선택 시 기간(년) 필수
    const se = form.sellingHouseExclusion;
    if (se?.isEmployeeHousing && (!se.freeProvisionYears || parseFloat(se.freeProvisionYears) <= 0))
      issues.push({ step, message: "양도 주택 사원용 주택: 무상 제공 기간(년)을 입력하세요." });
    if (se?.isDayCareCenter && (!se.dayCareOperationYears || parseFloat(se.dayCareOperationYears) <= 0))
      issues.push({ step, message: "양도 주택 어린이집: 운영 기간(년)을 입력하세요." });

    // ⑧ 세대 보유 분양권·입주권 — 각 행 취득일 필수 (자동 안분 fallback 금지)
    const presaleRights = form.presaleRights ?? [];
    for (let i = 0; i < presaleRights.length; i++) {
      if (!presaleRights[i].acquisitionDate)
        issues.push({ step, message: `분양권·입주권 ${i + 1}: 취득일을 입력하세요.` });
    }

    // ⑧ 다주택 중과 한시 유예 — 입력(ON) 시 매매계약일 필수 (조건B 기산).
    // houses 0건이면 엔진이 gracePeriod를 소비하지 않고 위젯도 숨김 → 검증도 houses>0 게이트(보이지 않는 필드 차단 방지).
    if (houses.length > 0 && form.gracePeriod && !form.gracePeriod.contractDate)
      issues.push({ step, message: "중과 한시 유예: 매매계약 체결일을 입력하세요." });

    // ⑧ §154① 단서 — 사유별 필수 입력 (미입력 시 침묵 비과세 미적용 차단 — feedback_no_silent_apportion_fallback)
    if (
      (form.provisoReason === "overseas_migration" || form.provisoReason === "overseas_residence") &&
      !form.provisoDepartureDate
    )
      issues.push({
        step,
        message: "§154① 단서(해외이주·국외거주): 출국일을 입력하세요. (출국일부터 2년 내 양도 판정)",
      });
    if (form.provisoReason === "pre_designation_contract" && !form.provisoPreContractNoHouse)
      issues.push({
        step,
        message: "§154① 단서(조정 공고 전 계약): 계약금 지급일 현재 무주택 여부를 확인하세요.",
      });

    // 1세대1주택 + housing 자산 + interval 모드 거주 구간 검증 — 구간별 첫 오류 1건씩
    const primary = form.assets?.[0];
    if (form.isOneHousehold && primary && primary.assetKind === "housing"
        && primary.residenceInputMode === "interval") {
      const periods = primary.residencePeriods ?? [];
      for (let i = 0; i < periods.length; i++) {
        const p = periods[i];
        const label = `거주 구간 #${i + 1}`;
        const firstError = (() => {
          if (!p.moveInDate) return `${label}: 입주일을 입력하세요.`;
          if (!p.moveOutDate)
            return `${label}: 퇴거일을 입력하세요. (양도일까지 거주한 경우 양도일을 퇴거일로 입력)`;
          if (p.moveOutDate < p.moveInDate)
            return `${label}: 퇴거일은 입주일보다 이후여야 합니다.`;
          // 거주기간은 보유기간(취득일~양도일) 중 거주만 산입 (소령 §154①·법 §95⑤2호)
          // — 취득 전 임차 거주 구간을 산입하면 거주요건·표2 공제가 과대 계산됨
          if (primary.acquisitionDate && p.moveInDate < primary.acquisitionDate)
            return `${label}: 입주일이 취득일(${primary.acquisitionDate})보다 빠릅니다. 거주기간은 보유기간 중 거주만 산입됩니다 (소령 §154①·법 §95⑤). 취득 전 임차 거주는 제외하고 입력하세요.`;
          if (form.transferDate && p.moveInDate > form.transferDate)
            return `${label}: 입주일은 양도일 이전이어야 합니다.`;
          if (form.transferDate && p.moveOutDate && p.moveOutDate > form.transferDate)
            return `${label}: 퇴거일은 양도일 이전이어야 합니다.`;
          return null;
        })();
        if (firstError) issues.push({ step, assetIndex: 0, message: firstError });
      }

      // 구간 간 겹침 차단 — sumResidenceMonths는 단순 합산이므로 겹침 시 거주개월 이중 계산
      // (입주일 정렬 후 인접 비교. 퇴거일 = 다음 입주일(이사 당일)은 겹침 아님 — 초과만 차단)
      const complete = periods
        .map((p, idx) => ({ ...p, idx }))
        .filter((p) => p.moveInDate && p.moveOutDate)
        .sort((a, b) => (a.moveInDate < b.moveInDate ? -1 : a.moveInDate > b.moveInDate ? 1 : 0));
      for (let i = 1; i < complete.length; i++) {
        const prev = complete[i - 1];
        const cur = complete[i];
        if (prev.moveOutDate > cur.moveInDate) {
          issues.push({
            step,
            assetIndex: 0,
            message: `거주 구간 #${prev.idx + 1}(퇴거 ${prev.moveOutDate})과 #${cur.idx + 1}(입주 ${cur.moveInDate})이 겹칩니다. 구간이 겹치면 거주기간이 이중 계산되므로 구간을 분리하거나 합쳐서 입력하세요.`,
          });
        }
      }
    }
  }

  // step 2: 감면·공제 (구 step 4) — transfer-tax-validate-reductions.ts로 분리 (800줄 정책, 2026-06-11)
  // 모듈이 첫 오류 1건 반환 구조 — 단계 내 첫 오류만 수집 (후속 확장 여지)
  if (step === 2) {
    const issue = validateStep2Reductions(step, form);
    if (issue) issues.push(issue);
  }

  // step 3: 가산세 / 수정신고
  if (step === 3 && form.amendmentMode) {
    if (parseAmount(form.originalDeterminedTax) <= 0)
      issues.push({ step, message: "당초 결정세액을 입력하세요." });
    // [F5] 경정청구 후발적 사유 → 사유 안 날 필수 (§45의2② 3개월 기산)
    if (
      form.correctionKind === "refund_claim" &&
      form.claimReasonType === "posterior" &&
      !form.posteriorEventDate
    )
      issues.push({ step, message: "후발적 사유를 안 날을 입력하세요." });
    if (form.applyUnderReportingPenalty && form.underReductionMode === "auto_48_2") {
      if (!form.statutoryFilingDeadline)
        issues.push({ step, message: "§48② 자동감면 산정을 위해 법정신고기한을 입력하세요." });
      if (!form.amendedFilingDate)
        issues.push({ step, message: "§48② 자동감면 산정을 위해 수정신고일을 입력하세요." });
    }
    if (form.applyLatePaymentPenalty) {
      if (!form.statutoryFilingDeadline)
        issues.push({ step, message: "납부지연가산세 산정을 위해 법정신고기한을 입력하세요." });
      if (!form.amendedPaymentDate)
        issues.push({ step, message: "납부지연가산세 산정을 위해 수정신고 납부(예정)일을 입력하세요." });
    }
  }

  return issues;
}

/**
 * 기존 string 반환 API 보존 — 호출처·테스트 호환.
 * 위치 정보가 필요한 UI는 validateStepDetailed를 사용한다.
 */
export function validateStep(step: number, form: TransferFormData): string | null {
  return validateStepDetailed(step, form)?.message ?? null;
}

/** 첫 번째 차단 오류 1건 — collectStepIssues 위임 (검증 규칙 단일 진실) */
export function validateStepDetailed(step: number, form: TransferFormData): ValidationIssue | null {
  return collectStepIssues(step, form)[0] ?? null;
}

/**
 * 비차단 경고 수집 — 진행은 허용하되 주의를 요하는 입력.
 * collectStepIssues(차단)와 독립 채널. UI는 amber 배너로 표시하되 handleNext/handleSubmit를 막지 않음.
 *
 * - 미래 양도일: 미래 시점 가정 계산(시뮬레이션) 허용 — 입력 확인용 경고만.
 *   (취득일 미래는 입력 오류로 collectStepIssues에서 차단 — validateAssetEntry)
 */
export function collectStepWarnings(step: number, form: TransferFormData): ValidationIssue[] {
  const warnings: ValidationIssue[] = [];
  if (step === 0) {
    if (form.transferDate && form.transferDate > todayLocalISO()) {
      warnings.push({
        step,
        message: `양도일(${form.transferDate})이 오늘 이후입니다. 미래 시점 가정 계산입니다 — 입력값을 확인하세요.`,
      });
    }
  }
  return warnings;
}
