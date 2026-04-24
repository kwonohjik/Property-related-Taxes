"use client";

/**
 * AcquisitionTaxForm — 취득세 계산 4단계 마법사
 *
 * Step 0: 취득 정보 (취득자유형, 물건종류, 취득원인, 취득가액, 취득일)
 * Step 1: 물건 상세 (전용면적, 사치성재산, 특수관계인, 시가표준액)
 * Step 2: 주택 현황 (보유 주택 수, 조정대상지역) — 주택 선택 시 활성
 * Step 3: 감면 확인 (생애최초, 수도권) — 주택+개인 시 활성 → 계산
 */


import { useState } from "react";
import { StepIndicator } from "@/components/calc/StepIndicator";
import { AcquisitionTaxResultView } from "@/components/calc/results/AcquisitionTaxResultView";
import type { AcquisitionTaxResult } from "@/lib/tax-engine/types/acquisition.types";
import {
  STEPS,
  INITIAL_FORM,
  validateStep,
  callAcquisitionTaxAPI,
  labelCls,
  selectCls,
  checkboxWrapCls,
  infoBannerCls,
  warnBannerCls,
  type FormState,
} from "./acquisition/shared";
import { Step0 } from "./acquisition/Step0";
import { Step1 } from "./acquisition/Step1";

export function AcquisitionTaxForm() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AcquisitionTaxResult | null>(null);
  /** 토지·농지 시가표준액 단가 (StandardPriceInput 내부 상태 유지용) */
  const [standardValuePerSqm, setStandardValuePerSqm] = useState("");

  const isOriginal = ["new_construction", "extension", "reconstruction", "reclamation"].includes(form.acquisitionCause);
  const isBurdened = form.acquisitionCause === "burdened_gift";
  const isOnerous = ["purchase", "exchange", "auction", "in_kind_investment"].includes(form.acquisitionCause);
  const isInheritance = ["inheritance", "inheritance_farmland"].includes(form.acquisitionCause);
  const isGiftLike = ["gift", "burdened_gift", "donation"].includes(form.acquisitionCause);
  const isHousing = form.propertyType === "housing";
  const isIndividual = form.acquiredBy === "individual";
  const isCorporation = form.acquiredBy === "corporation";

  const handleNext = async () => {
    const err = validateStep(step, form);
    if (err) { setError(err); return; }
    setError(null);

    if (step < STEPS.length - 1) {
      // 비주택: Step 1 → Step 2(주택 현황) 건너뛰고 Step 3(감면 확인)으로
      const nextStep = step === 1 && !isHousing ? step + 2 : step + 1;
      setStep(nextStep);
    } else {
      // Step 3(감면 확인) → 계산 실행
      setLoading(true);
      try {
        const res = await callAcquisitionTaxAPI(form);
        setResult(res);
      } catch (e) {
        setError(e instanceof Error ? e.message : "계산 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    }
  };

  const handleBack = () => {
    if (step === 0) {
      window.location.href = "/";
    } else {
      setError(null);
      setResult(null);
      // 비주택: Step 3 → Step 2(주택 현황) 건너뛰고 Step 1(물건 상세)로
      const prevStep = step === 3 && !isHousing ? step - 2 : step - 1;
      setStep(prevStep);
    }
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="space-y-6">
      <StepIndicator steps={STEPS} current={step} />

      {/* ── Step 0: 취득 정보 ── */}
      {step === 0 && (
        <Step0
          form={form}
          set={set}
          setForm={setForm}
          setStep={setStep}
          setResult={setResult}
          setError={setError}
          isOnerous={isOnerous}
          isBurdened={isBurdened}
          isOriginal={isOriginal}
          isGiftLike={isGiftLike}
          isInheritance={isInheritance}
        />
      )}

      {/* ── Step 1: 물건 상세 ── */}
      {step === 1 && (
        <Step1
          form={form}
          set={set}
          standardValuePerSqm={standardValuePerSqm}
          onStandardValuePerSqmChange={setStandardValuePerSqm}
          referenceDate={form.balancePaymentDate || form.contractDate}
          isHousing={isHousing}
        />
      )}

      {/* ── Step 2: 주택 현황 ── */}
      {step === 2 && (
        <div className="space-y-4">
          {isHousing ? (
            <>
              {/* 법인 주택 취득 안내 */}
              {isCorporation && (
                <div className={infoBannerCls}>
                  <strong>법인 주택 취득 안내</strong><br />
                  법인의 주택 유상취득에는 <strong>12% 중과세율</strong>이 적용됩니다 (지방세법 §13의2).
                  아래 주택 수·조정지역 설정에 관계없이 법인 중과가 우선 적용됩니다.
                </div>
              )}

              <div>
                <label className={labelCls}>취득 후 보유 주택 수 (취득 대상 포함)</label>
                <select
                  className={selectCls}
                  value={form.houseCountAfter}
                  onChange={(e) => set("houseCountAfter", e.target.value)}
                >
                  <option value="1">1주택 (기본세율)</option>
                  <option value="2">2주택 (조정지역 8% 중과)</option>
                  <option value="3">3주택 이상 (조정지역 12% 중과)</option>
                </select>
              </div>

              <div className={checkboxWrapCls}>
                <input
                  type="checkbox"
                  id="isRegulatedArea"
                  checked={form.isRegulatedArea}
                  onChange={(e) => set("isRegulatedArea", e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                <label htmlFor="isRegulatedArea" className={`${labelCls} cursor-pointer`}>
                  조정대상지역 내 주택
                </label>
              </div>

              {/* 다주택 + 조정지역 중과 안내 */}
              {form.isRegulatedArea && parseInt(form.houseCountAfter) >= 2 && isIndividual && (
                <div className={warnBannerCls}>
                  {parseInt(form.houseCountAfter) === 2
                    ? "조정대상지역 내 2주택 취득 — 8% 중과세율이 적용됩니다."
                    : "조정대상지역 내 3주택 이상 취득 — 12% 중과세율이 적용됩니다."}
                </div>
              )}
            </>
          ) : (
            <div className={infoBannerCls}>
              주택 이외 물건은 조정대상지역 다주택 중과 조건이 적용되지 않습니다.<br />
              기본세율이 자동 적용됩니다.
            </div>
          )}
        </div>
      )}

      {/* ── Step 3: 감면 확인 → 계산 ── */}
      {step === 3 && (
        <div className="space-y-4">
          {result ? (
            <>
              <AcquisitionTaxResultView result={result} />
              <button
                type="button"
                className="mt-2 w-full rounded-md border border-input bg-background px-4 py-2 text-sm hover:bg-accent"
                onClick={() => {
                  setResult(null);
                  setStep(0);
                  setForm(INITIAL_FORM);
                }}
              >
                다시 계산하기
              </button>
            </>
          ) : (
            <>
              {isHousing && isIndividual ? (
                <>
                  <div className={checkboxWrapCls}>
                    <input
                      type="checkbox"
                      id="isFirstHome"
                      checked={form.isFirstHome}
                      onChange={(e) => set("isFirstHome", e.target.checked)}
                      className="h-4 w-4 rounded border-input"
                    />
                    <label htmlFor="isFirstHome" className={`${labelCls} cursor-pointer`}>
                      생애최초 주택 구매 감면 신청 (지방세특례제한법 §36의3, 최대 200만원)
                    </label>
                  </div>

                  {form.isFirstHome && (
                    <>
                      <div className={`${checkboxWrapCls} pl-6`}>
                        <input
                          type="checkbox"
                          id="isMetropolitan"
                          checked={form.isMetropolitan}
                          onChange={(e) => set("isMetropolitan", e.target.checked)}
                          className="h-4 w-4 rounded border-input"
                        />
                        <label htmlFor="isMetropolitan" className={`${labelCls} cursor-pointer`}>
                          수도권 주택 (취득가액 한도 4억) — 비수도권은 3억
                        </label>
                      </div>

                      <div className={warnBannerCls}>
                        <strong>추징 주의</strong><br />
                        취득일로부터 3년 이내 처분·임대·주거 외 사용 시 감면세액이 추징됩니다
                        (지방세특례제한법 §36의3 ④).
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className={infoBannerCls}>
                  {!isHousing
                    ? "주택 이외 물건은 생애최초 주택 감면 대상이 아닙니다."
                    : "법인 취득은 생애최초 주택 감면 대상이 아닙니다."}
                </div>
              )}

              <p className="text-xs text-muted-foreground pt-2">
                모든 입력이 완료되면 아래 <strong>취득세 계산</strong> 버튼을 눌러주세요.
              </p>
            </>
          )}
        </div>
      )}

      {/* 오류 표시 */}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* 네비게이션 — 결과 표시 중에는 숨김 */}
      {!result && (
        <div className="flex gap-3">
          <button
            type="button"
            className="flex-1 rounded-md border border-input bg-background px-4 py-2 text-sm hover:bg-accent"
            onClick={handleBack}
          >
            {step === 0 ? "홈으로" : "이전"}
          </button>
          <button
            type="button"
            className="flex-1 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            onClick={handleNext}
            disabled={loading}
          >
            {loading ? "계산 중..." : step === STEPS.length - 1 ? "취득세 계산" : "다음"}
          </button>
        </div>
      )}
    </div>
  );
}
