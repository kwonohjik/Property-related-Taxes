"use client";

/**
 * 엔진이 돌려준 «확인 필요»·주의 — **하나도 조용히 버리지 않는다**.
 *
 * - `confirmationNeeded` 코드: `CONFIRMATION_NOTICES`가 코드 → 문구 단일 표다. `satisfies Record<ForeignRealEstateConfirmationCode, …>`라
 *   엔진이 코드를 추가하면 컴파일이 여기서 멈춘다(키 커버리지 가드). 런타임에 모르는 코드(옛 이력·서버 앞서감)가 와도 코드 그대로 «확인 필요»로 보인다.
 * - `warnings`: 엔진 문구를 그대로 «확인 필요» 카드로 보인다.
 * - 국내자산과의 관계(각각 구분 계산 — 해석례 근거)는 «확인 필요»가 아니라 일반 안내(sky)로 납세의무가 있는 결과에 보인다.
 * - 납세의무 없음 사유(`notLiableReason`)는 `NOT_LIABLE_REASON_TEXT` — 같은 방식의 키 커버리지 가드.
 * 법령 인용은 `TRANSFER_FOREIGN_RE` 상수만 쓴다(문자열 리터럴 금지).
 */
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { TRANSFER_FOREIGN_RE as RE } from "@/lib/tax-engine/legal-codes/transfer-foreign-realestate";
import { FOREIGN_DOMESTIC_SEPARATE_TEXT } from "@/lib/calc/transfer-foreign-messages";
import { FOREIGN_UNSUPPORTED_RESULT_TEXT } from "@/lib/calc/transfer-foreign-messages";
import { FOREIGN_TAX_FX_DATE_TEXT } from "@/lib/calc/transfer-foreign-messages";
import type {
  ForeignRealEstateConfirmationCode,
  ForeignRealEstateNotLiableReason,
  ForeignRealEstateResult,
} from "@/lib/tax-engine/foreign-realestate";

export const CONFIRMATION_NOTICES = {
  UNSUPPORTED_SITUATIONS_NOT_EVALUATED: FOREIGN_UNSUPPORTED_RESULT_TEXT,
} as const satisfies Record<ForeignRealEstateConfirmationCode, string>;

export const NOT_LIABLE_REASON_TEXT = {
  RESIDENCE_UNDER_5_YEARS: `양도일까지 계속 5년 이상 국내에 주소 또는 거소를 둔 거주자가 아니어서 국외자산 양도소득세 과세대상이 아닙니다 (${RE.SECTION_118_2_SCOPE}). 세액은 0입니다.`,
} as const satisfies Record<ForeignRealEstateNotLiableReason, string>;

function isKnownCode(code: string): code is ForeignRealEstateConfirmationCode {
  return Object.prototype.hasOwnProperty.call(CONFIRMATION_NOTICES, code);
}

export function ForeignNotLiableCard({ result }: { result: ForeignRealEstateResult }) {
  const reason = result.notLiableReason;
  return (
    <div data-testid="foreign-not-liable">
      <ToneCard tone="amber" title={`납세의무 없음 (${RE.SECTION_118_2_SCOPE})`}>
        <p className="text-sm leading-relaxed">{reason ? NOT_LIABLE_REASON_TEXT[reason] : (result.ineligibleReason ?? "")}</p>
        {reason && result.ineligibleReason && <p className="text-xs text-muted-foreground">{result.ineligibleReason}</p>}
        <p className="text-xs text-muted-foreground">입력하신 거주 연수: {result.domesticResidenceYears}년</p>
      </ToneCard>
    </div>
  );
}

export function ForeignResultNotices({ result }: { result: ForeignRealEstateResult }) {
  const items: { key: string; text: string; testId: string }[] = [
    ...result.confirmationNeeded.map((code, i) => ({
      key: `c${i}`,
      text: isKnownCode(code) ? CONFIRMATION_NOTICES[code] : String(code),
      testId: `foreign-confirm-${code}`,
    })),
    ...result.warnings.map((w, i) => ({ key: `w${i}`, text: w, testId: `foreign-warning-${i}` })),
  ];
  return (
    <div className="space-y-2" data-testid="foreign-notices">
      {result.isLiable && (
        <div data-testid="foreign-domestic-separate">
          <ToneCard tone="sky" title="국내자산 양도와는 따로 계산">
            <p className="text-xs leading-relaxed">{FOREIGN_DOMESTIC_SEPARATE_TEXT}</p>
          </ToneCard>
        </div>
      )}
      {result.isLiable && result.foreignTaxMethod === "credit" && (
        <div data-testid="foreign-ftc-fx-date">
          <ToneCard tone="sky" title="외국납부세액 원화 환산 기준일">
            <p className="text-xs leading-relaxed">{FOREIGN_TAX_FX_DATE_TEXT}</p>
          </ToneCard>
        </div>
      )}
      {items.map((it) => (
        <div key={it.key} data-testid={it.testId}>
          <ToneCard tone="amber" title="확인 필요">
            <p className="text-xs leading-relaxed">{it.text}</p>
          </ToneCard>
        </div>
      ))}
      {result.appliedRules.length > 0 && (
        <div className="rounded-lg border border-border p-3" data-testid="foreign-applied-rules">
          <p className="mb-1 text-xs font-semibold text-muted-foreground">적용 법령</p>
          <ul className="flex flex-wrap gap-1.5">
            {result.appliedRules.map((rule) => (
              <li key={rule} className="rounded-full bg-muted px-2 py-0.5 text-caption text-muted-foreground">
                {rule}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
