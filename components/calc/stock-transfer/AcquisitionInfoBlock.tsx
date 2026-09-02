"use client";

/**
 * AcquisitionInfoBlock — 취득 정보 통합 카드 (single 모드, Plan v1.2)
 *
 * 취득일 + 취득원인(§104② 기산점) + cause별 보조 일자를 amber tone 단일 카드로 통합.
 * 기존 AcquisitionCauseBlock 폐기 후 후속.
 *
 * 정책:
 *  - feedback_section_card_numbering: amber tone 색상 카드
 *  - feedback_toggle_card_visibility: RadioCardGroup OFF/ON 모두 tone 유지
 *  - feedback_no_silent_apportion_fallback: cause 변경 시 보조 일자 store 값 유지
 *  - feedback_useeffect_store_mirror_forbidden: 모든 변경은 onChange 직접 patch
 *
 * 안내 카드:
 *  1. 단기 30% (§104②)
 *  2. inheritance 1985.12.31. 이전 의제취득일 (시행령 §162⑦3호)
 *  3. gift 수증일 안내 (§104② 본문 — §97의2① 미해당 선언)
 *  4. carryover_gift 증여자 취득일 입력 + 2025.1.1. 게이트 안내 (§104②2)
 *
 * ⚠️ 2026-08-11 — 주식은 2024.12.31. 개정(법률 제20615호·시행 2025.1.1.)으로 §97의2① 대상이
 *    되었다. 종전 안내 「§97의2는 주식에 미적용」은 그 전 법이다.
 *    `carryover_gift`(이월과세)를 골라야 §104②2호 통산이 적용된다 — 단순 증여와 구분한다.
 *    계획서: docs/02-design/features/transfer-104-2-2-gift-carryover-scope.plan.md
 *
 * 의제취득일 자동 적용 (시행령 §162⑦3호):
 *  - 1985.12.31. 이전 입력 시 onChange 시점에 자동 1986-01-01 patch
 *  - 원래 입력값은 component local state로 보관하여 안내 메시지에 표시
 */

import { useState } from "react";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DateInput } from "@/components/ui/date-input";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

const DEEMED_CUTOFF = "1985-12-31";
const DEEMED_DATE = "1986-01-01";

/** 1985.12.31. 이전(포함)이면 1986-01-01 의제취득일로 강제 변환 */
function coerceDeemed(value: string): { coerced: string; applied: boolean } {
  if (!value) return { coerced: value, applied: false };
  if (value <= DEEMED_CUTOFF) {
    return { coerced: DEEMED_DATE, applied: true };
  }
  return { coerced: value, applied: false };
}

interface AcquisitionInfoBlockProps {
  form: Pick<
    StockTransferFormData,
    | "acquisitionDate"
    | "acquisitionCause"
    | "decedentAcquisitionDate"
    | "donorAcquisitionDate"
    | "donorRelation"
    | "donorDeceased"
    | "donorAcquisitionPrice"
    | "donorAcquisitionStdPrice"
    | "donorCapitalExpenditure"
    | "giftTaxAmount"
    | "transferredAssetValue"
    | "giftTaxableValue"
    | "preMergerAcquisitionDate"
  >;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

export function AcquisitionInfoBlock({ form, onChange }: AcquisitionInfoBlockProps) {
  // 3중 패턴 default — store factory와 일치
  const cause = form.acquisitionCause || "purchase";
  const isGiftLike = cause === "gift" || cause === "carryover_gift";
  const dateLabel = isGiftLike ? "수증일" : "취득일";
  // 증여 계열만 보조 정보 노출. purchase 등 자명 케이스는 hint 생략.
  const dateHint =
    cause === "gift"
      ? "수증일 기산 — §97의2① 미적용 (§104② 본문)"
      : cause === "carryover_gift"
        ? "증여받은 날 — 이 날짜가 2025.1.1. 이후여야 §104②2호가 적용됩니다"
        : undefined;

  // 의제취득일 자동 변환 시 사용자 입력 원본을 임시 보관 (안내 메시지용)
  // store에는 변환된 값만 들어가므로 원본은 local state로만 유지
  const [acqOriginal, setAcqOriginal] = useState<string | null>(null);
  const [decedentOriginal, setDecedentOriginal] = useState<string | null>(null);
  const [donorOriginal, setDonorOriginal] = useState<string | null>(null);
  const [preMergerOriginal, setPreMergerOriginal] = useState<string | null>(null);

  const handleAcqDateChange = (v: string) => {
    const { coerced, applied } = coerceDeemed(v);
    setAcqOriginal(applied ? v : null);
    onChange({ acquisitionDate: coerced });
  };

  const handleDecedentDateChange = (v: string) => {
    const { coerced, applied } = coerceDeemed(v);
    setDecedentOriginal(applied ? v : null);
    onChange({ decedentAcquisitionDate: coerced });
  };

  const handleDonorDateChange = (v: string) => {
    const { coerced, applied } = coerceDeemed(v);
    setDonorOriginal(applied ? v : null);
    onChange({ donorAcquisitionDate: coerced });
  };

  const handlePreMergerDateChange = (v: string) => {
    const { coerced, applied } = coerceDeemed(v);
    setPreMergerOriginal(applied ? v : null);
    onChange({ preMergerAcquisitionDate: coerced });
  };

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4 space-y-4">
      {/* 헤더 — §104② 안내는 FieldCard hint에서 단일 노출 (디자인 §2-E-1) */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-amber-800 font-semibold text-sm">📋 취득 정보</span>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        <LawArticleModal legalBasis="소득세법 시행령 §162 ⑦" label="§162⑦3호" />
        <LawArticleModal legalBasis="소득세법 §104 ②" label="§104②" />
      </div>

      {/* 취득일 (single column) */}
      <FieldCard label={dateLabel} required hint={dateHint}>
        <DateInput value={form.acquisitionDate} onChange={handleAcqDateChange} />
        {acqOriginal && form.acquisitionDate === DEEMED_DATE && (
          <p className="mt-2 rounded-md border border-amber-300 bg-amber-100/70 px-2 py-1.5 text-xs text-amber-900">
            ⓘ 입력하신 {acqOriginal}은 1985.12.31. 이전이므로 의제취득일{" "}
            <strong>1986.1.1.</strong>로 자동 변경되었습니다.{" "}
            (<LawArticleModal legalBasis="소득세법 시행령 §162 ⑦" label="§162⑦3호" />)
          </p>
        )}
      </FieldCard>

      {/* 취득원인 RadioCardGroup */}
      <FieldCard
        label="취득원인"
        hint="§104② 단기 30% 기산점 — 취득원인에 따라 단기 보유기간 기산점이 달라집니다"
      >
        <RadioCardGroup
          name="acquisitionCause"
          value={cause}
          onChange={(v) =>
            onChange({ acquisitionCause: v as StockTransferFormData["acquisitionCause"] })
          }
          tone="amber"
          layout="inline"
          options={[
            { value: "purchase", label: "매매", description: "취득일 기산" },
            { value: "inheritance", label: "상속", description: "피상속인 취득일 (§104②1)" },
            { value: "gift", label: "증여", description: "수증일 기산 (§104② 본문)" },
            {
              value: "carryover_gift",
              label: "이월과세(증여)",
              description: "증여자 취득일 (§104②2)",
            },
            { value: "merger_split", label: "합병·분할", description: "종전 주식 (§104②3)" },
          ]}
        />
      </FieldCard>

      {/* inheritance nested 카드 */}
      {cause === "inheritance" && (
        <div className="ml-4 rounded-lg border border-amber-300 bg-amber-100/60 p-3 space-y-2">
          <FieldCard
            label="피상속인 취득일 (§104②1)"
            required
            hint="단기 30% 세율 적용 여부는 피상속인 취득일 → 양도일로 계산"
          >
            <DateInput
              value={form.decedentAcquisitionDate ?? ""}
              onChange={handleDecedentDateChange}
            />
            {decedentOriginal && form.decedentAcquisitionDate === DEEMED_DATE && (
              <p className="mt-2 rounded-md border border-amber-400 bg-amber-200/70 px-2 py-1.5 text-xs text-amber-900">
                ⓘ 입력하신 피상속인 취득일 {decedentOriginal}은 1985.12.31. 이전이므로
                의제취득일 <strong>1986.1.1.</strong>로 자동 변경되었습니다.{" "}
                (<LawArticleModal legalBasis="소득세법 시행령 §162 ⑦" label="§162⑦3호" />)
              </p>
            )}
          </FieldCard>
          <p className="text-xs text-amber-800">
            ⓘ 1985.12.31. 이전 취득 주식: 의제취득일 1986.1.1. 자동 적용 (<LawArticleModal legalBasis="소득세법 시행령 §162 ⑦" label="§162⑦3호" />)
          </p>
        </div>
      )}

      {/* gift nested 안내 */}
      {cause === "gift" && (
        <div className="ml-4 rounded-lg border border-amber-300 bg-amber-100/60 p-3">
          <p className="text-xs text-amber-800">
            ⓘ 단순 증여 주식은 <strong>수증일</strong>(= 취득일)부터 기산합니다
            (<LawArticleModal legalBasis="소득세법 §104 ②" label="§104② 본문" />).
            배우자·직계존비속에게서 <strong>2025.1.1. 이후</strong> 증여받아 <strong>1년 이내</strong>에
            양도한다면 <strong>「이월과세(증여)」</strong>를 선택하세요 — 증여자 취득일부터 기산해
            단기 30%를 피할 수 있습니다.
          </p>
        </div>
      )}

      {/* carryover_gift nested 카드 — §104②2호 */}
      {cause === "carryover_gift" && (
        <div className="ml-4 rounded-lg border border-amber-300 bg-amber-100/60 p-3 space-y-2">
          <FieldCard
            label="증여자 취득일 (§104②2)"
            required
            hint="단기 30% 세율 적용 여부를 증여자 취득일 → 양도일로 계산합니다"
          >
            <DateInput
              value={form.donorAcquisitionDate ?? ""}
              onChange={handleDonorDateChange}
            />
            {donorOriginal && form.donorAcquisitionDate === DEEMED_DATE && (
              <p className="mt-2 rounded-md border border-amber-400 bg-amber-200/70 px-2 py-1.5 text-xs text-amber-900">
                ⓘ 입력하신 증여자 취득일 {donorOriginal}은 1985.12.31. 이전이므로 의제취득일{" "}
                <strong>1986.1.1.</strong>로 자동 변경되었습니다.{" "}
                (<LawArticleModal legalBasis="소득세법 시행령 §162 ⑦" label="§162⑦3호" />)
              </p>
            )}
          </FieldCard>
          <p className="text-xs text-amber-800">
            ⓘ 주식은 <strong>2024.12.31. 개정(법률 제20615호)</strong>으로 2025.1.1.부터
            이월과세 대상이 되었습니다. <strong>증여일 기준</strong>이므로 2024.12.31. 이전에
            증여받았다면 이 항목을 골라도 수증일 기산이 유지됩니다.
            기간 요건은 부동산 10년이 아니라 <strong>1년</strong>입니다
            (<LawArticleModal legalBasis="소득세법 §97의2" label="§97의2①" />).
          </p>

          {/* ── §97의2① 본문 괄호 — 관계 요건 ── */}
          <FieldCard
            label="증여자와의 관계 (§97의2① 본문)"
            required
            hint="배우자·직계존비속이 아니면 이월과세 대상이 아닙니다"
          >
            {/* 선택지가 3~7자이고 description이 없다 — 세로로 쌓을 이유가 없다.
                anchor: donor-relation-radio-inline.anchor.test.tsx DR-1 */}
            <RadioCardGroup
              name="donorRelation"
              value={form.donorRelation || ""}
              onChange={(v) =>
                onChange({ donorRelation: v as StockTransferFormData["donorRelation"] })
              }
              layout="inline"
              options={[
                { value: "spouse", label: "배우자" },
                { value: "lineal", label: "직계존비속" },
                { value: "other", label: "그 밖의 관계" },
              ]}
            />
          </FieldCard>

          <ToggleCard
            title={
              form.donorRelation === "lineal"
                ? "증여자가 양도 당시 사망"
                : "사망으로 혼인관계가 소멸"
            }
            checked={form.donorDeceased}
            onCheckedChange={(v: boolean) => onChange({ donorDeceased: v })}
            tone="amber"
            description={
              form.donorRelation === "lineal"
                ? "직계존비속이 양도 당시 사망했다면 §97의2①이 적용되지 않습니다 (2025.1.1. 이후 증여분)"
                : "사별이면 §97의2① 미적용입니다. 이혼으로 혼인관계가 소멸한 경우는 그대로 적용됩니다"
            }
          />

          {/* ── §97의2①1호 — 취득가액 승계 ── */}
          <FieldCard
            label="증여자 취득가액 (1주당 · §97의2①1호 가목)"
            hint="증여자가 취득할 당시의 실지거래가액. 이 값이 있어야 취득가액이 승계됩니다"
          >
            <CurrencyInput
              label=""
              hideLabel              value={form.donorAcquisitionPrice}
              onChange={(v) => onChange({ donorAcquisitionPrice: v })}
            />
          </FieldCard>
          <FieldCard
            label="증여자 취득 당시 기준시가 (1주당 · §97의2①1호 나목)"
            hint="증여자의 실지거래가액을 확인할 수 없어 환산하는 경우의 분자입니다"
          >
            <CurrencyInput
              label=""
              hideLabel              value={form.donorAcquisitionStdPrice}
              onChange={(v) => onChange({ donorAcquisitionStdPrice: v })}
            />
          </FieldCard>

          {/* ── §97의2①2호 — 증여자 자본적지출 ── */}
          <FieldCard
            label="증여자 자본적지출액 (§97의2①2호)"
            hint="증여자가 그 주식에 대하여 지출한 자본적지출액. 양도비는 포함하지 않습니다"
          >
            <CurrencyInput
              label=""
              hideLabel              value={form.donorCapitalExpenditure}
              onChange={(v) => onChange({ donorCapitalExpenditure: v })}
            />
          </FieldCard>

          {/* ── §97의2①3호 × 영 §163의2② — 증여세 상당액 안분 ── */}
          <FieldCard
            label="증여세 산출세액 (§97의2①3호)"
            hint="아래 두 값으로 안분한 금액이 필요경비에 산입됩니다"
          >
            <CurrencyInput
              label=""
              hideLabel              value={form.giftTaxAmount}
              onChange={(v) => onChange({ giftTaxAmount: v })}
            />
          </FieldCard>
          <FieldCard
            label="양도한 해당 자산가액 (영 §163의2②2호)"
            hint="증여세가 과세된 과세가액 중 이번에 양도한 부분 — 안분 분자"
          >
            <CurrencyInput
              label=""
              hideLabel              value={form.transferredAssetValue}
              onChange={(v) => onChange({ transferredAssetValue: v })}
            />
          </FieldCard>
          <FieldCard
            label="증여세 과세가액 (영 §163의2②3호)"
            hint="「상속세 및 증여세법」 §47에 따른 과세가액 — 안분 분모"
          >
            <CurrencyInput
              label=""
              hideLabel              value={form.giftTaxableValue}
              onChange={(v) => onChange({ giftTaxableValue: v })}
            />
          </FieldCard>
          <p className="text-xs text-amber-800">
            ⓘ 산입되는 증여세는 <strong>양도가액에서 취득가액·필요경비를 뺀 잔액</strong>을
            한도로 합니다 (<LawArticleModal legalBasis="소득세법 시행령 §163의2" label="영 §163의2②" />).
            <br />
            ⓘ 이월과세를 적용한 결정세액이 적용하지 않은 것보다 <strong>적으면</strong> 적용하지
            않습니다 (<LawArticleModal legalBasis="소득세법 §97의2" label="§97의2②3호" />) —
            그때는 세율 보유기간도 수증일 기산으로 돌아갑니다.
          </p>
        </div>
      )}

      {/* merger_split nested 카드 */}
      {cause === "merger_split" && (
        <div className="ml-4 rounded-lg border border-amber-300 bg-amber-100/60 p-3">
          <FieldCard
            label="종전 주식 취득일 (§104②3)"
            required
            hint="합병·분할로 취득한 신주의 단기 기산점은 종전 주식 취득일"
          >
            <DateInput
              value={form.preMergerAcquisitionDate ?? ""}
              onChange={handlePreMergerDateChange}
            />
            {preMergerOriginal && form.preMergerAcquisitionDate === DEEMED_DATE && (
              <p className="mt-2 rounded-md border border-amber-400 bg-amber-200/70 px-2 py-1.5 text-xs text-amber-900">
                ⓘ 입력하신 종전 주식 취득일 {preMergerOriginal}은 1985.12.31. 이전이므로
                의제취득일 <strong>1986.1.1.</strong>로 자동 변경되었습니다.{" "}
                (<LawArticleModal legalBasis="소득세법 시행령 §162 ⑦" label="§162⑦3호" />)
              </p>
            )}
          </FieldCard>
        </div>
      )}
    </div>
  );
}
