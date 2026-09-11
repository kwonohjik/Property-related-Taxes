/**
 * 상속세 폼 — **단계 오류 수집·문구 변환**.
 *
 * `InheritanceTaxForm.tsx`에서 분리했다(800줄 정책). 그 파일은 폼 상태·렌더링을 맡고,
 * 여기는 필드 라벨·API 오류 포매팅·단계별 필수값 수집만 맡는다(순수 함수 · leaf).
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { validateUnlistedStockV2 } from "@/lib/calc/inheritance-validate";
import type { FormState } from "@/components/calc/inheritance/shared";



// ============================================================
// API 에러 상세화 — Zod issues → 한국어 라벨 + 메시지
// ============================================================

/**
 * Zod issue path 세그먼트 → 한국어 라벨.
 *
 * 🔴 IG-157: 이 표는 **실제 `inheritanceTaxInputSchema` 키와 맞아야** 의미가 있다.
 * 종전엔 표에만 있고 스키마엔 없는 키(`inheritanceDate`·`reportDate`·`priorGiftsTotal`·
 * `decedentRelation`·`hasSpouse`·`hasLinealDescendant`·`filedWithinDeadline` 등)가 섞여 있었고,
 * 반대로 최상위 20개 키 중 라벨이 있는 것은 3개뿐이었다. 그래서 포매터를 배선하기만 해서는
 * `deductionInput.familyBusiness.heirId` 같은 내부 경로가 그대로 남는다.
 *
 * 아래 키는 `lib/validators/property-valuation-input.ts`의
 * `inheritanceTaxInputSchema` / `inheritanceDeductionInputSchema` /
 * `inheritanceTaxCreditInputSchema` / `heirSchema` / `estateItemSchema`에서 실측한 것이다.
 */
const INHERITANCE_FIELD_LABELS: Record<string, string> = {
  // ── inheritanceTaxInputSchema (최상위)
  decedentType: "거주자 구분",
  deathDate: "상속개시일",
  estateItems: "상속재산",
  funeralExpense: "장례비",
  funeralBonganExpense: "봉안시설·자연장지 비용",
  debts: "채무액",
  debtItems: "채무 명세",
  presumedItems: "추정상속재산",
  exemptions: "비과세·과세가액 불산입",
  preGiftsWithin10Years: "10년 내 사전증여",
  heirs: "상속인",
  deductionInput: "공제 입력",
  creditInput: "세액공제 입력",
  valuationBaseDate: "평가기준일",
  isGenerationSkip: "세대생략 상속",
  isMinorHeir: "미성년 수유자",
  generationSkipAssetAmount: "세대생략 상속재산",
  appraisalFee: "감정평가수수료",
  filingPenalty: "신고불성실가산세",

  // ── inheritanceDeductionInputSchema
  spouseActualAmount: "배우자 실제 상속액",
  netFinancialAssets: "순 금융재산",
  cohabitHouseStdPrice: "동거주택 공시가격",
  cohabitSecuredDebt: "동거주택 담보채무",
  cohabitHouseRightType: "동거주택 권리 유형",
  cohabitDirectAmount: "동거주택공제 직접 입력",
  cohabitantDependents: "동거 부양가족",
  farmingAssetValue: "영농상속재산가액",
  farming: "영농상속공제",
  familyBusinessValue: "가업상속재산가액",
  familyBusinessYears: "가업 영위기간",
  familyBusinessDirectAmount: "가업상속공제 직접 입력",
  familyBusiness: "가업상속공제",
  spouseLegalShareOverride: "배우자 법정상속분 직접 입력",
  legateeAmountNonHeir: "상속인 외 수유자 유증액",
  heirWaiverAmount: "상속포기자 관련 금액",
  priorGiftDeductionTotal: "사전증여재산 공제 합계",
  disasterLossDeduction: "재해손실공제",
  casualtyLoss: "재해손실공제",

  // ── inheritanceTaxCreditInputSchema
  priorGifts: "사전증여 이력",
  foreignTaxPaid: "외국납부세액",
  foreignInheritanceTaxBase: "국외 상속재산 과세표준",
  shortTermReinheritPriorDeathDate: "단기재상속 — 전 상속개시일",
  shortTermReinheritAssets: "단기재상속 재산",
  shortTermReinheritYears: "단기재상속 경과연수",
  shortTermReinheritTaxPaid: "단기재상속 — 전 상속세액",
  shortTermReinheritAssetValue: "단기재상속 재산가액",
  shortTermReinheritPriorEstateValue: "단기재상속 — 전 상속재산가액",
  isFiledOnTime: "법정신고기한 내 신고",
  filingStatus: "신고 상태",
  statutoryDeadline: "법정신고기한",
  actualFilingDate: "실제 신고일",
  priorAssessmentNotified: "과세표준 결정 통지",
  isUnderReported: "과소신고 여부",
  isUnfiled: "무신고 여부",

  // ── heirSchema
  id: "식별자",
  relation: "관계",
  residentNumber: "주민등록번호",
  birthDate: "생년월일",
  isDisabled: "장애인 여부",
  gender: "성별",
  isFetus: "태아 여부",
  heirId: "상속인",

  // ── estateItemSchema (주요 필드)
  category: "재산 종류",
  name: "자산 명칭",
  marketValue: "시가",
  standardPrice: "기준시가/공시가격",
  appraisedValue: "감정평가액",
  listedStockAvgPrice: "상장주식 평균종가",
  listedStockShares: "상장주식 수량",
  listedStockCode: "상장주식 종목코드",
  leaseDeposit: "임대보증금",
  mortgageAmount: "저당권 설정액",
  heirAllocations: "협의분할 — 상속인별 분배",
  publicCharges: "공과금",
  debtAmount: "채무액",
};

interface ApiIssue {
  path: string[];
  message: string;
  code?: string;
}

export function labelForInheritancePath(path: string[]): string {
  if (path.length === 0) return "입력";
  const parts: string[] = [];
  for (const seg of path) {
    if (/^\d+$/.test(seg)) {
      parts.push(`${Number(seg) + 1}번`);
    } else {
      parts.push(INHERITANCE_FIELD_LABELS[seg] ?? seg);
    }
  }
  return parts.join(" › ");
}

export function formatInheritanceApiError(data: { error?: string; issues?: ApiIssue[] }): string {
  if (Array.isArray(data.issues) && data.issues.length > 0) {
    const lines = data.issues.slice(0, 8).map((iss) => {
      const label = labelForInheritancePath(iss.path);
      return `• ${label}: ${iss.message}`;
    });
    const more = data.issues.length > 8 ? `\n(외 ${data.issues.length - 8}건)` : "";
    return `${data.error ?? "입력값이 올바르지 않습니다."}\n${lines.join("\n")}${more}`;
  }
  return data.error ?? "계산 중 오류가 발생했습니다.";
}

// ============================================================
// 단계별 유효성 검사
// ============================================================

/**
 * 한 단계에서 발견되는 모든 차단 오류를 수집한다(첫 오류에서 멈추지 않음).
 *
 * - handleNext: 진행 차단 + 오류 전부를 한 번에 표시(두더지잡기식 1건씩 노출 제거).
 * - stepStatuses: 각 단계 완료/주의 배지 산정 — 오류 0건이면 "complete".
 *
 * 부수효과 없는 순수 함수(form만 의존) — StepIndicator 상태 계산에서 5단계 전부
 * 매 렌더 호출되므로 입력 규모가 큰 항목(비상장주식 V2)도 가벼운 검증만 수행.
 */
export function collectStepErrors(step: number, form: FormState): string[] {
  const errors: string[] = [];
  if (step === 0) {
    if (!form.deathDate) errors.push("상속개시일(사망일)을 입력하세요.");
    if (form.heirs.length === 0)
      errors.push(
        "상속인·수유자를 1명 이상 등록하세요. (협의분할·법정상속분 안분의 기준)",
      );
  }
  if (step === 1) {
    const total = form.estateItems.length + form.stockItems.length;
    if (total === 0) {
      errors.push("상속재산을 1개 이상 입력하세요.");
    } else {
      // 비상장주식 V2 입력 검증 — 진행 차단
      // ctx.evaluationDateFallback = deathDate — display fallback과 동일 fallback 인식 (CLAUDE.md ⑧)
      const evalCtx = { evaluationDateFallback: form.deathDate || undefined };
      for (const item of [...form.estateItems, ...form.stockItems]) {
        const e = validateUnlistedStockV2(item, evalCtx);
        if (e) errors.push(e);
      }
    }
  }
  if (step === 2) {
    // 방안 C — 협의분할 ON 모드일 때만 항목 검증
    if (form.debtItems !== undefined) {
      if (form.debtItems.length === 0) {
        errors.push(
          "협의분할 모드 ON — 채무·공과·장례비 항목을 1개 이상 추가하거나 토글을 끄세요.",
        );
      } else {
        for (const [idx, di] of form.debtItems.entries()) {
          // 이름 미입력 항목도 금액·분할 오류를 식별할 수 있게 순번 라벨 사용
          const label = di.name.trim() || `${idx + 1}번째 항목`;
          if (!di.name.trim()) {
            errors.push(
              `채무·공과·장례비 ${idx + 1}번째 항목 — 채권자/내용을 입력하세요.`,
            );
          }
          if (!Number.isFinite(di.amount) || di.amount <= 0) {
            errors.push(
              `채무·공과·장례비 "${label}" 항목 — 금액을 0보다 큰 값으로 입력하세요.`,
            );
          }
          // 협의분할 합계 ≠ 금액 차단 (기존 validateDebtItemAllocations 동일 규칙)
          if (
            di.heirAllocations &&
            di.heirAllocations.length > 0 &&
            di.category !== "funeral"
          ) {
            const sum = di.heirAllocations.reduce((s, a) => s + a.amount, 0);
            if (sum !== di.amount) {
              errors.push(
                `채무 "${label}" 협의분할 합계 ${sum.toLocaleString()}원 ≠ 금액 ${di.amount.toLocaleString()}원`,
              );
            }
          }
        }
      }
    }
  }
  if (step === 4) {
    // 연부연납 (§71·§72) — 활성 시 희망기간·미래율 검증
    if (form.installmentEnabled) {
      const years = parseInt(form.installmentYears, 10);
      if (!Number.isFinite(years) || years < 1 || years > 10) {
        errors.push(
          "연부연납 희망 기간은 1~10년(일반분 상한, §71②1나)으로 입력하세요.",
        );
      }
      const rate = parseFloat(form.installmentFutureRate);
      if (!Number.isFinite(rate) || rate < 0) {
        errors.push("연부연납 미래 회차 가산율은 0 이상으로 입력하세요.");
      }
    }
    // R-1 분납·연부연납 배타 (§70② 단서) — UI disabled 1차 차단 + 방어
    if (form.splitPaymentEnabled && form.installmentEnabled) {
      errors.push(
        "연부연납(§71)과 분납(§70②)은 동시에 신청할 수 없습니다. 하나만 선택하세요.",
      );
    }
    // 물납 (§73) — 활성 시 보정액·희망액 음수 차단(빈 문자열 허용, 허용한도 초과는 경고만)
    if (form.paymentInKindEnabled) {
      if (
        parseAmount(form.paymentInKindIneligibleAmount) < 0 ||
        parseAmount(form.paymentInKindRequestedAmount) < 0
      ) {
        errors.push(
          "물납 관리·처분 부적당 제외액·희망 물납액은 0 이상으로 입력하세요.",
        );
      }
    }
  }
  return errors;
}

/** 수집된 오류를 오류 박스용 문자열로 — 2건 이상이면 불릿 목록(whitespace-pre-line 렌더). */
export function formatStepErrors(errors: string[]): string {
  return errors.length === 1
    ? errors[0]
    : errors.map((e) => `• ${e}`).join("\n");
}

// ============================================================
// 메인 컴포넌트
// ============================================================
