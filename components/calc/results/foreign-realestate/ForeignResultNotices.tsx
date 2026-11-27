"use client";

/**
 * 엔진이 돌려준 «확인 필요»·주의 — **하나도 조용히 버리지 않는다**.
 *
 * - `confirmationNeeded` 코드: `CONFIRMATION_NOTICES`가 코드 → 문구 단일 표다. `satisfies Record<ForeignRealEstateConfirmationCode, …>`라
 *   엔진이 코드를 추가하면 컴파일이 여기서 멈춘다(키 커버리지 가드). 런타임에 모르는 코드(옛 이력·서버 앞서감)가 와도 코드 그대로 «확인 필요»로 보인다.
 * - `warnings`: 엔진 문구를 그대로 «확인 필요» 카드로 보인다.
 * - 납세의무 없음 사유(`notLiableReason`)는 `NOT_LIABLE_REASON_TEXT` — 같은 방식의 키 커버리지 가드.
 * 법령 인용은 `TRANSFER_FOREIGN_RE` 상수만 쓴다(문자열 리터럴 금지).
 */
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { TRANSFER_FOREIGN_RE as RE } from "@/lib/tax-engine/legal-codes/transfer-foreign-realestate";
import { FOREIGN_DOMESTIC_NOT_AGGREGATED_TEXT, FOREIGN_UNSUPPORTED_RESULT_TEXT } from "@/lib/calc/transfer-foreign-messages";
import type {
  ForeignRealEstateConfirmationCode,
  ForeignRealEstateNotLiableReason,
  ForeignRealEstateResult,
} from "@/lib/tax-engine/foreign-realestate";

export const CONFIRMATION_NOTICES = {
  LOCAL_TAX_WEIGHTING_NOT_EVALUATED: `개인지방소득세는 표준세율(${RE.LOCAL_92_1_RATE_TABLE}) 기준으로 계산했습니다. 지방자치단체 조례에 따른 세율 가감과 지정지역 등에 대한 가중은 평가하지 않았으니 해당 여부를 확인하세요.`,
  FOREIGN_TAX_CREDIT_FX_DATE_NOT_STATUTORY: `외국납부세액 세액공제방법(${RE.SECTION_118_6_FOREIGN_TAX})에서 공제 대상 외국세를 원화로 바꾸는 기준일은 «양도가액 및 필요경비»의 환산을 정한 ${RE.DECREE_178_5_FX_BASE_RATE}와 달리 정한 조문을 찾지 못했습니다. 입력하신 납부일과 그날의 기준환율을 그대로 썼습니다 — 세무 전문가에게 확인하세요.`,
  DOMESTIC_TRANSFER_NOT_AGGREGATED: FOREIGN_DOMESTIC_NOT_AGGREGATED_TEXT,
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
