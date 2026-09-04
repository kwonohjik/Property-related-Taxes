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

const INHERITANCE_FIELD_LABELS: Record<string, string> = {
  inheritanceDate: "상속개시일",
  reportDate: "신고일",
  decedentRelation: "피상속인 관계",
  hasSpouse: "배우자 유무",
  hasLinealDescendant: "직계비속 유무",
  estateItems: "상속재산",
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
  funeralExpense: "장례비",
  debtAmount: "채무액",
  publicCharges: "공과금",
  spouseDeduction: "배우자공제",
  lumpSumDeduction: "일괄공제",
  basicDeduction: "기초공제",
  financialAssetDeduction: "금융재산공제",
  cohabitingHouseDeduction: "동거주택 상속공제",
  familyBusinessDeduction: "가업상속공제",
  farmlandDeduction: "영농상속공제",
  shortTermRedeemDeduction: "단기재상속공제",
  foreignTaxPaid: "외국납부세액",
  foreignInheritanceTaxBase: "국외 상속재산 과세표준",
  filedWithinDeadline: "법정신고기한 내 신고",
  priorGiftsTotal: "10년 내 사전증여 합계",
  generationSkipAssetAmount: "세대생략 상속재산",
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
