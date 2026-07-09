"use client";

/**
 * 가업상속공제 §97의2④ 의제 취득가액 입력 섹션
 *
 * 활성화 조건: acquisitionCause === "inheritance" 이고 ToggleCard ON
 *
 * 4 필수 필드:
 *   - 피상속인 원취득가액 (decedentAcquisitionPrice)
 *   - 상속개시일 현재 자산가액 (inheritanceMarketValue)
 *   - 가업상속공제적용률 (fbDeductionAppliedRate) 0~100% → 0~1 변환
 *   - 상속개시일 (inheritanceDate)
 * 2 선택 필드:
 *   - 피상속인 자본적 지출액 (decedentCapitalExpenditure)
 *   - 상속인 자본적 지출액 (heirCapitalExpenditure)
 *
 * 정책 준수:
 *   - useEffect → store 미러링 금지 (feedback_useeffect_store_mirror_forbidden)
 *   - ToggleCard emerald tone (OFF도 tone 배경 유지)
 *   - CurrencyInput + label prop 사용 (FieldCard 내 CurrencyInput 이중 라벨 회피)
 *   - 800줄 정책 준수 (~180줄)
 */

import { useState } from "react";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { DateInput } from "@/components/ui/date-input";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { FamilyBusinessInheritanceHistoryModal } from "./FamilyBusinessInheritanceHistoryModal";
import type { FamilyBusinessInheritancePrefill } from "@/lib/calc/family-business-inheritance-lookup";

// ── 타입 ──────────────────────────────────────────────────────

interface FamilyBusinessSlice {
  decedentAcquisitionPrice: number;
  inheritanceMarketValue: number;
  fbDeductionAppliedRate: number;  // 0~1
  inheritanceDate: string;
  decedentCapitalExpenditure?: number;
  heirCapitalExpenditure?: number;
}

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /** 폼-전역 양도일 — K10 이력 조회 모달 가드 (상속개시일 < 양도일) */
  transferDate?: string;
}

// ── 헬퍼 ──────────────────────────────────────────────────────

/** 의제 취득가액 미리보기 산출 (UI 표시 전용, 정수 연산) */
function calcImputedPreview(fb: FamilyBusinessSlice): number {
  const r = fb.fbDeductionAppliedRate;
  const term1 = Math.floor(fb.decedentAcquisitionPrice * r);
  const term2 = Math.floor(fb.inheritanceMarketValue * (1 - r));
  return term1 + term2;
}

/** 적용률 문자열(%) → 0~1 소수 변환 (100% → 1.0) */
function parseRateStr(val: string): number {
  const n = parseFloat(val.replace(/[^0-9.]/g, ""));
  if (!isFinite(n) || n < 0) return 0;
  if (n > 100) return 1;
  return n / 100;
}

/** 0~1 소수 → 백분율 문자열 (소수점 4자리까지, 불필요한 0 제거) */
function toRateStr(rate: number): string {
  return (rate * 100).toFixed(4).replace(/\.?0+$/, "") || "0";
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────

export function FamilyBusinessInheritanceTransferSection({ asset, onChange, transferDate }: Props) {
  const isOn = asset.familyBusinessInheritance !== undefined;
  const fb = asset.familyBusinessInheritance;
  const [lookupOpen, setLookupOpen] = useState(false);

  /** K10 prefill — 상속세 이력 modal 선택 콜백 */
  function handlePrefillFromHistory(prefill: FamilyBusinessInheritancePrefill) {
    // 기존 decedentAcquisitionPrice·decedentCapitalExpenditure·heirCapitalExpenditure는 보존
    onChange({
      familyBusinessInheritance: {
        decedentAcquisitionPrice: fb?.decedentAcquisitionPrice ?? prefill.decedentAcquisitionPrice,
        inheritanceMarketValue: prefill.inheritanceMarketValue,
        fbDeductionAppliedRate: prefill.fbDeductionAppliedRate,
        inheritanceDate: prefill.inheritanceDate,
        decedentCapitalExpenditure: fb?.decedentCapitalExpenditure,
        heirCapitalExpenditure: fb?.heirCapitalExpenditure,
      },
    });
  }

  /** ToggleCard ON/OFF 핸들러 — onClick에서 직접 store set (useEffect 미러링 금지) */
  function handleToggle(checked: boolean) {
    if (checked) {
      // ON: 초기값 설정 (상속개시일은 acquisitionDate 자동 채우기)
      onChange({
        familyBusinessInheritance: {
          decedentAcquisitionPrice: 0,
          inheritanceMarketValue: 0,
          fbDeductionAppliedRate: 0,
          inheritanceDate: asset.acquisitionDate || "",
          decedentCapitalExpenditure: undefined,
          heirCapitalExpenditure: undefined,
        },
      });
    } else {
      // OFF: 필드 제거 (의제 미사용 = 일반 §97 산식)
      onChange({ familyBusinessInheritance: undefined });
    }
  }

  /** fb 필드 partial 업데이트 헬퍼 */
  function patchFb(patch: Partial<FamilyBusinessSlice>) {
    if (!fb) return;
    onChange({ familyBusinessInheritance: { ...fb, ...patch } });
  }

  // 의제 취득가액 미리보기 (4필드 모두 입력 시)
  const canPreview =
    fb &&
    fb.decedentAcquisitionPrice > 0 &&
    fb.inheritanceMarketValue > 0 &&
    fb.fbDeductionAppliedRate >= 0;
  const previewValue = canPreview ? calcImputedPreview(fb!) : null;

  return (
    <ToggleCard
      tone="emerald"
      checked={isOn}
      onCheckedChange={handleToggle}
      title="가업상속공제 적용 자산 (소법 §97의2④)"
      description={
        isOn
          ? "의제 취득가액 산식 적용 — 피상속인 원취득가 × 적용률 + 상속개시일 평가액 × (1 − 적용률)"
          : "가업상속공제를 받은 자산 양도 시 의제 취득가액 특례 (소득세법 §97의2④, 소령 §163의2③)"
      }
    >
      {isOn && fb && (
        <div className="space-y-3 mt-2">

          {/* 의제 취득가액 근거 조문 */}
          <div className="flex flex-wrap items-center gap-1.5">
            <LawArticleModal legalBasis="소득세법 §97의2 ④" label="§97의2④" />
            <LawArticleModal legalBasis="소득세법 시행령 §163의2 ③" label="시행령 §163의2③" />
            <LawArticleModal legalBasis="상속세및증여세법 §60" label="상증법 §60" />
            <LawArticleModal legalBasis="상속세및증여세법 §18의2" label="상증법 §18의2" />
          </div>

          {/* K10 — 상속세 이력에서 prefill */}
          <div className="flex items-center justify-between rounded-md border border-emerald-300 bg-emerald-50/60 px-3 py-2">
            <div className="text-xs text-emerald-800">
              <p className="font-semibold">상속세 이력에서 자동 채우기</p>
              <p className="text-micro text-emerald-600 mt-0.5">
                적용률·상속개시일·평가액 자동 prefill (원취득가액은 별도 입력)
              </p>
            </div>
            <button
              type="button"
              onClick={() => setLookupOpen(true)}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 transition-colors"
            >
              📋 이력 조회
            </button>
          </div>

          <FamilyBusinessInheritanceHistoryModal
            open={lookupOpen}
            onOpenChange={setLookupOpen}
            currentTransferDate={transferDate || asset.acquisitionDate || ""}
            onSelect={handlePrefillFromHistory}
          />

          {/* ① 피상속인 원취득가액 */}
          <CurrencyInput
            label="피상속인 원취득가액 (원)"
            required
            hint="소법 §97의2④1호 — 피상속인이 해당 자산을 취득하기 위해 실제 지출한 금액"
            value={String(fb.decedentAcquisitionPrice || "")}
            onChange={(v) => patchFb({ decedentAcquisitionPrice: parseInt(v.replace(/,/g, ""), 10) || 0 })}
          />

          {/* ② 상속개시일 현재 자산가액 */}
          <CurrencyInput
            label="상속개시일 현재 자산가액 (원)"
            required
            hint="소법 §97의2④2호 — 상증법 §60·§63에 따라 평가한 가액 (보충적 평가액·기준시가 등)"
            value={String(fb.inheritanceMarketValue || "")}
            onChange={(v) => patchFb({ inheritanceMarketValue: parseInt(v.replace(/,/g, ""), 10) || 0 })}
          />

          {/* ③ 가업상속공제적용률 */}
          <FieldCard
            label="가업상속공제적용률 (%)"
            required
            hint="소령 §163의2③ — 개인가업: 공제금액 ÷ 가업상속 재산가액 / 법인가업: 사업관련자산가액 ÷ 총자산가액"
          >
            <DecimalInput
              unit="%"
              value={toRateStr(fb.fbDeductionAppliedRate)}
              onChange={(v) => patchFb({ fbDeductionAppliedRate: parseRateStr(v) })}
              placeholder="적용률 (0~100)"
            />
          </FieldCard>

          {/* ④ 상속개시일 */}
          <FieldCard
            label="상속개시일"
            required
            hint="의제 취득가액 산정 근거 일자 (상속개시일 = 피상속인 사망일)"
          >
            <DateInput
              value={fb.inheritanceDate}
              onChange={(v) => patchFb({ inheritanceDate: v })}
            />
          </FieldCard>

          {/* ⑤ 피상속인 자본적 지출액 (선택) */}
          <CurrencyInput
            label="피상속인 자본적 지출액 (원) — 선택"
            hint="피상속인이 보유 기간 중 지출한 인테리어·증축 등 — 없으면 비워두세요"
            value={String(fb.decedentCapitalExpenditure ?? "")}
            onChange={(v) => {
              const n = parseInt(v.replace(/,/g, ""), 10);
              patchFb({ decedentCapitalExpenditure: isFinite(n) && n > 0 ? n : undefined });
            }}
          />

          {/* ⑥ 상속인 자본적 지출액 (선택) */}
          <CurrencyInput
            label="상속인 자본적 지출액 (원) — 선택"
            hint="상속 취득 후 상속인이 지출한 자본적 지출 (소법 §97①2호 가목) — 없으면 비워두세요"
            value={String(fb.heirCapitalExpenditure ?? "")}
            onChange={(v) => {
              const n = parseInt(v.replace(/,/g, ""), 10);
              patchFb({ heirCapitalExpenditure: isFinite(n) && n > 0 ? n : undefined });
            }}
          />

          {/* 의제 취득가액 미리보기 */}
          {previewValue !== null && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-xs space-y-1">
              <p className="font-semibold text-emerald-800">의제 취득가액 미리보기 (소법 §97의2④)</p>
              <p className="text-emerald-700">
                피상속인 원취득가액 {fb!.decedentAcquisitionPrice.toLocaleString()}
                {" × "}{(fb!.fbDeductionAppliedRate * 100).toFixed(2)}%
                {" + "}상속개시일 평가액 {fb!.inheritanceMarketValue.toLocaleString()}
                {" × "}{((1 - fb!.fbDeductionAppliedRate) * 100).toFixed(2)}%
                {" = "}
                <strong>{previewValue.toLocaleString()}</strong>
              </p>
              <p className="text-micro text-emerald-600">
                ※ 최종 의제 취득가액은 엔진 계산 결과로 확인하세요. 일반 §97 산식과 비교과세 후 불리한 경우 §18의2⑩ 공제 적용.
              </p>
            </div>
          )}

          {/* §97의2④ 강제 적용 안내 */}
          <div className="rounded-md border border-rose-200 bg-rose-50/60 px-3 py-2 text-xs text-rose-800">
            <p className="font-semibold">소법 §97의2④ 본문 강제 적용</p>
            <p className="mt-0.5">
              의제 취득가액이 일반 §97 취득가액보다 불리하더라도 반드시 적용됩니다.
              의제 산식 결정세액이 일반 산식보다 높은 경우 §18의2⑩에 따라 차액을 공제합니다.
            </p>
          </div>

        </div>
      )}
    </ToggleCard>
  );
}
