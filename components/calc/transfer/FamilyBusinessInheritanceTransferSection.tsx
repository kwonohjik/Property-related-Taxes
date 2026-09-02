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
 * 1 선택 필드:
 *   - 피상속인 자본적 지출액 (decedentCapitalExpenditure) — §97의2④1호 base에 가산
 *   (상속인 자본적 지출액은 2026-08-11에 제거했다 — 자산-수준 필요경비와 이중 공제가 된다.)
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
import { Button } from "@/components/ui/button";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { DateInput } from "@/components/ui/date-input";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { FamilyBusinessInheritanceHistoryModal } from "./FamilyBusinessInheritanceHistoryModal";
import type { FamilyBusinessInheritancePrefill } from "@/lib/calc/family-business-inheritance-lookup";
// 시점 판정은 엔진 leaf 단일 소스 재사용 (skill single-source-engine-helper)
import { isFamilyBusinessAssetScopeDecreeEra, isFamilyBusinessCgtEra } from "@/lib/tax-engine/data/family-business-cgt-era";
import { calcFamilyBusinessImputedAcquisitionPrice } from "@/lib/tax-engine/transfer-tax-family-business";

// ── 타입 ──────────────────────────────────────────────────────

interface FamilyBusinessSlice {
  decedentAcquisitionPrice: number;
  inheritanceMarketValue: number;
  fbDeductionAppliedRate: number;  // 0~1
  inheritanceDate: string;
  decedentCapitalExpenditure?: number;
}

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /** 폼-전역 양도일 — K10 이력 조회 모달 가드 (상속개시일 < 양도일) */
  transferDate?: string;
}

// ── 헬퍼 ──────────────────────────────────────────────────────

/**
 * 의제 취득가액 미리보기 — **엔진 leaf를 직접 호출한다**(dual truth 회피).
 *
 * A22(2026-09-02): 종전에는 산식을 복제했고 두 가지가 어긋나 있었다.
 *   ① `decedentCapitalExpenditure`를 **인자로 받지도 않아** 사용자가 hint를 읽고
 *      자본적지출을 입력해도 **화면 숫자가 1원도 움직이지 않았다**.
 *   ② 엔진이 명시적으로 금지한 부동소수 `1 - r`을 그대로 써서 1원 오차가 났다
 *      (`1 - 0.8 = 0.19999999999999996` — 엔진 `:166` 주석이 지목한 바로 그 패턴).
 *
 * 같은 파일이 이미 `isFamilyBusinessAssetScopeDecreeEra`를 엔진에서 재사용하고 있다.
 */
function calcImputedPreview(fb: FamilyBusinessSlice): number {
  return calcFamilyBusinessImputedAcquisitionPrice(
    fb.decedentAcquisitionPrice,
    fb.inheritanceMarketValue,
    fb.fbDeductionAppliedRate,
    fb.decedentCapitalExpenditure ?? 0,
  );
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
    // 기존 decedentAcquisitionPrice·decedentCapitalExpenditure는 보존
    onChange({
      familyBusinessInheritance: {
        decedentAcquisitionPrice: fb?.decedentAcquisitionPrice ?? prefill.decedentAcquisitionPrice,
        inheritanceMarketValue: prefill.inheritanceMarketValue,
        fbDeductionAppliedRate: prefill.fbDeductionAppliedRate,
        inheritanceDate: prefill.inheritanceDate,
        decedentCapitalExpenditure: fb?.decedentCapitalExpenditure,
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
  /**
   * G-1 시점 게이트 — 「소득세법」 부칙(법률 제12169호) §12. 기준일은 **상속개시일**이다.
   *
   * A17(2026-09-02): 종전에는 이 축의 안내가 ⑤에 전혀 없었고, 미충족이어도 미리보기와
   * rose 카드(「반드시 적용됩니다」)가 그대로 렌더됐다 — 단순 누락이 아니라 **적극적 허위
   * 서술**이었다. 엔진은 특례를 통째로 미적용하는데 화면은 반드시 적용된다고 말했다.
   * 엔진 게이트와 **같은 술어**를 쓴다(dual truth 회피).
   */
  const cgtEraOk = fb?.inheritanceDate ? isFamilyBusinessCgtEra(new Date(fb.inheritanceDate)) : true;

  // 겸용주택은 §163⑨ 상속개시일 평가액 직접 산정 경로(CompanionAcqInheritanceBlock 안내 참조)를 쓰고
  // 가업상속공제 의제취득가액(§97의2④)은 겸용 엔진(buildMixedUsePayload)이 미소비 — dead 입력 예방.
  const isMixedUse = !!asset.isMixedUseHouse;

  return (
    <ToggleCard
      tone="emerald"
      checked={isOn}
      onCheckedChange={handleToggle}
      disabled={isMixedUse}
      disabledReason={isMixedUse ? "겸용주택은 가업상속공제 의제취득가액 미지원(범위 밖)" : undefined}
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
            <Button
              type="button"
              variant="modalLauncher"
              size="xs"
              onClick={() => setLookupOpen(true)}
            >
              📋 이력 조회
            </Button>
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
            hint="소법 §97의2④1호 — 피상속인의 취득가액(소법 §97①1호). 실지거래가액이 원칙이며, 확인할 수 없는 경우에 한정해 매매사례가액·감정가액·환산취득가액을 순차 적용합니다"
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
            hint="피상속인이 보유 기간 중 지출한 인테리어·증축 등. 소법 §97의2④1호의 취득가액에 합산되어 가업상속공제적용률이 곱해집니다 — 없으면 비워두세요"
            value={String(fb.decedentCapitalExpenditure ?? "")}
            onChange={(v) => {
              const n = parseInt(v.replace(/,/g, ""), 10);
              patchFb({ decedentCapitalExpenditure: isFinite(n) && n > 0 ? n : undefined });
            }}
          />

          {/* 상속인 자본적 지출액은 자산-수준 필요경비로 일원화 (2026-08-11).
              여기에 별도 입력구를 두면 자산-수준 입력과 이중 공제가 되고, 그것을 validation으로
              막으면 "UI 통과 ↔ validate 차단" 모순이 생긴다. */}
          <p className="text-xs text-muted-foreground">
            상속인이 상속 취득 후 지출한 자본적 지출(소법 §97①2호)은 이 카드가 아니라
            <strong> 자산의 필요경비 입력란</strong>에 적으세요.
          </p>

          {/* G-2/G-3 — 대상 자산 범위. 판정 근거가 양도일에 따라 갈린다(계획서 §3.3).
              세액 게이트가 아니라 안내다 — "이 자산이 공제받은 자산인가"는 이 카드를 켜는
              행위로 이미 선언되므로, 별도 토글을 두면 같은 선언을 두 번 받게 된다. */}
          <p className="text-xs text-muted-foreground">
            {(() => {
              const basis = transferDate || asset.acquisitionDate;
              if (!basis) return "대상 자산은 가업상속공제를 실제로 받은 자산에 한정됩니다.";
              return isFamilyBusinessAssetScopeDecreeEra(new Date(basis))
                ? "대상 자산은 개인가업의 사업용 자산 또는 법인가업의 주식등입니다 (소득세법 시행령 §163의2④)."
                : "대상 자산은 가업상속공제를 실제로 받은 자산에 한정됩니다 (대법원 2026두30294 — 공제받은 주식과 받지 않은 주식을 구분·관리).";
            })()}
            {" "}공제받지 않은 자산이 섞여 있으면 자산을 나누어 입력하세요.
          </p>

          {/* G-1 미충족 안내 — 이때는 미리보기·강제적용 카드를 함께 끈다(A17). */}
          {!cgtEraOk && (
            <div className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-800">
              <p className="font-semibold">§97의2④ 의제 취득가액 특례 미적용</p>
              <p className="mt-0.5">
                상속개시일이 2014.1.1. 전이라 「소득세법」 부칙(법률 제12169호) §12의 적용 대상이
                아닙니다. 일반 §97 산식으로 계산됩니다.
              </p>
            </div>
          )}

          {/* 의제 취득가액 미리보기 */}
          {cgtEraOk && previewValue !== null && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-xs space-y-1">
              <p className="font-semibold text-emerald-800">의제 취득가액 미리보기 (소법 §97의2④)</p>
              <p className="text-emerald-700">
                피상속인 원취득가액 {fb!.decedentAcquisitionPrice.toLocaleString()}
                {fb!.decedentCapitalExpenditure
                  ? ` + 자본적지출 ${fb!.decedentCapitalExpenditure.toLocaleString()}`
                  : ""}
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

          {/* §97의2④ 강제 적용 안내 — G-1 충족 시에만(A17: 미충족 시 허위 서술이 된다) */}
          {cgtEraOk && (
          <div className="rounded-md border border-rose-200 bg-rose-50/60 px-3 py-2 text-xs text-rose-800">
            <p className="font-semibold">소법 §97의2④ 본문 강제 적용</p>
            <p className="mt-0.5">
              의제 취득가액이 일반 §97 취득가액보다 불리하더라도 반드시 적용됩니다.
              의제 산식 결정세액이 일반 산식보다 높은 경우 §18의2⑩에 따라 차액을 공제합니다.
            </p>
          </div>
          )}

        </div>
      )}
    </ToggleCard>
  );
}
