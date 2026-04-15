"use client";

/**
 * AcquisitionTaxForm — 취득세 계산 4단계 마법사
 *
 * Step 0: 물건 정보 (물건 유형, 취득 원인, 취득자)
 * Step 1: 취득가액·과세표준 (취득가액, 시가표준액, 특수 유형)
 * Step 2: 세율·중과 (주택 수, 조정지역, 생애최초)
 * Step 3: 취득 시기 → 결과
 */

import { useState } from "react";
import { StepIndicator } from "@/components/calc/StepIndicator";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { AcquisitionTaxResultView } from "@/components/calc/results/AcquisitionTaxResultView";
import type { AcquisitionTaxResult } from "@/lib/tax-engine/types/acquisition.types";

// ============================================================
// 상수 레이블
// ============================================================

const PROPERTY_TYPE_LABELS: [string, string][] = [
  ["housing", "주택 (아파트·단독·연립·다세대)"],
  ["land", "토지 (주택 외)"],
  ["land_farmland", "농지 (전·답·과수원)"],
  ["building", "건물 (비주거용)"],
  ["vehicle", "차량"],
  ["machinery", "기계장비"],
  ["aircraft", "항공기"],
  ["vessel", "선박"],
  ["mining_right", "광업권"],
  ["fishing_right", "어업권"],
  ["membership", "회원권 (골프·승마·콘도 등)"],
  ["standing_tree", "입목"],
];

const ACQUISITION_CAUSE_LABELS: [string, string][] = [
  ["purchase", "매매"],
  ["exchange", "교환"],
  ["auction", "공매·경매"],
  ["in_kind_investment", "현물출자"],
  ["inheritance", "상속"],
  ["inheritance_farmland", "농지 상속 (2.3% 특례)"],
  ["gift", "증여"],
  ["burdened_gift", "부담부증여"],
  ["donation", "기부"],
  ["new_construction", "신축"],
  ["extension", "증축"],
  ["reconstruction", "개축"],
  ["reclamation", "공유수면 매립·간척"],
];

const STEPS = ["물건 정보", "취득가액", "세율·중과", "취득 시기·결과"];

// ============================================================
// 폼 상태
// ============================================================

interface FormState {
  propertyType: string;
  acquisitionCause: string;
  acquiredBy: string;
  reportedPrice: string;
  marketValue: string;
  standardValue: string;
  encumbrance: string;
  constructionCost: string;
  houseCountAfter: string;
  isRegulatedArea: boolean;
  isLuxuryProperty: boolean;
  isRelatedParty: boolean;
  isFirstHome: boolean;
  isMetropolitan: boolean;
  areaSqm: string;
  balancePaymentDate: string;
  registrationDate: string;
  contractDate: string;
  usageApprovalDate: string;
}

const INITIAL_FORM: FormState = {
  propertyType: "housing",
  acquisitionCause: "purchase",
  acquiredBy: "individual",
  reportedPrice: "",
  marketValue: "",
  standardValue: "",
  encumbrance: "",
  constructionCost: "",
  houseCountAfter: "1",
  isRegulatedArea: false,
  isLuxuryProperty: false,
  isRelatedParty: false,
  isFirstHome: false,
  isMetropolitan: false,
  areaSqm: "",
  balancePaymentDate: "",
  registrationDate: "",
  contractDate: "",
  usageApprovalDate: "",
};

// ============================================================
// 유효성 검사
// ============================================================

function validateStep(step: number, form: FormState): string | null {
  if (step === 0) {
    if (!form.propertyType) return "물건 유형을 선택하세요.";
    if (!form.acquisitionCause) return "취득 원인을 선택하세요.";
  }
  if (step === 1) {
    const isOriginal = ["new_construction", "extension", "reconstruction", "reclamation"].includes(form.acquisitionCause);
    const isGratuitous = ["inheritance", "inheritance_farmland", "gift", "donation"].includes(form.acquisitionCause);
    if (!isOriginal && !isGratuitous && form.acquisitionCause !== "burdened_gift") {
      if (!form.reportedPrice && !form.standardValue) {
        return "취득가액 또는 시가표준액을 입력하세요.";
      }
    }
    if (form.acquisitionCause === "burdened_gift") {
      if (!form.encumbrance) return "부담부증여 채무액을 입력하세요.";
    }
  }
  return null;
}

// ============================================================
// API 호출
// ============================================================

async function callAcquisitionTaxAPI(form: FormState): Promise<AcquisitionTaxResult> {
  const isOriginal = ["new_construction", "extension", "reconstruction", "reclamation"].includes(form.acquisitionCause);

  const body = {
    propertyType: form.propertyType,
    acquisitionCause: form.acquisitionCause,
    acquiredBy: form.acquiredBy,
    reportedPrice: parseAmount(form.reportedPrice) ?? 0,
    marketValue: parseAmount(form.marketValue) || undefined,
    standardValue: parseAmount(form.standardValue) || undefined,
    encumbrance: parseAmount(form.encumbrance) || undefined,
    constructionCost: isOriginal ? (parseAmount(form.constructionCost) || undefined) : undefined,
    houseCountAfter: form.propertyType === "housing" ? (parseInt(form.houseCountAfter) || 1) : undefined,
    isRegulatedArea: form.propertyType === "housing" ? form.isRegulatedArea : undefined,
    isLuxuryProperty: form.isLuxuryProperty || undefined,
    isRelatedParty: form.isRelatedParty || undefined,
    isFirstHome: form.isFirstHome || undefined,
    isMetropolitan: form.isFirstHome ? form.isMetropolitan : undefined,
    areaSqm: parseAmount(form.areaSqm) || undefined,
    balancePaymentDate: form.balancePaymentDate || undefined,
    registrationDate: form.registrationDate || undefined,
    contractDate: form.contractDate || undefined,
    usageApprovalDate: form.usageApprovalDate || undefined,
  };

  const res = await fetch("/api/calc/acquisition", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error((json.error as string) ?? "계산 중 오류가 발생했습니다.");
  }
  return json.result as AcquisitionTaxResult;
}

// ============================================================
// 공통 스타일 유틸
// ============================================================

const selectCls = "mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
const labelCls = "text-sm font-medium leading-none";
const checkboxWrapCls = "flex items-center gap-2";

// ============================================================
// 메인 폼 컴포넌트
// ============================================================

export function AcquisitionTaxForm() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AcquisitionTaxResult | null>(null);

  const isOriginal = ["new_construction", "extension", "reconstruction", "reclamation"].includes(form.acquisitionCause);
  const isGratuitous = ["inheritance", "inheritance_farmland", "gift", "donation"].includes(form.acquisitionCause);
  const isBurdened = form.acquisitionCause === "burdened_gift";
  const isHousing = form.propertyType === "housing";
  const isInheritance = ["inheritance", "inheritance_farmland"].includes(form.acquisitionCause);
  const isGiftOrDonation = ["gift", "burdened_gift", "donation", "exchange"].includes(form.acquisitionCause);
  const isOnerous = ["purchase", "exchange", "auction", "in_kind_investment"].includes(form.acquisitionCause);

  const handleNext = async () => {
    const err = validateStep(step, form);
    if (err) { setError(err); return; }
    setError(null);

    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
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
      setStep(step - 1);
    }
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="space-y-6">
      <StepIndicator steps={STEPS} current={step} />

      {/* ── Step 0: 물건 정보 ── */}
      {step === 0 && (
        <div className="space-y-4">
          <div>
            <label className={labelCls}>물건 유형</label>
            <select
              className={selectCls}
              value={form.propertyType}
              onChange={(e) => set("propertyType", e.target.value)}
            >
              {PROPERTY_TYPE_LABELS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>취득 원인</label>
            <select
              className={selectCls}
              value={form.acquisitionCause}
              onChange={(e) => set("acquisitionCause", e.target.value)}
            >
              {ACQUISITION_CAUSE_LABELS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>취득자 유형</label>
            <select
              className={selectCls}
              value={form.acquiredBy}
              onChange={(e) => set("acquiredBy", e.target.value)}
            >
              <option value="individual">개인</option>
              <option value="corporation">법인</option>
              <option value="government">국가·지방자치단체</option>
              <option value="nonprofit">비영리법인</option>
            </select>
          </div>
        </div>
      )}

      {/* ── Step 1: 취득가액·과세표준 ── */}
      {step === 1 && (
        <div className="space-y-4">
          {!isOriginal && (
            <CurrencyInput
              label={isBurdened ? "취득가액 (시가)" : isGratuitous ? "시가인정액 (선택)" : "취득가액 (실거래가)"}
              value={isBurdened ? form.marketValue : form.reportedPrice}
              onChange={(v) => set(isBurdened ? "marketValue" : "reportedPrice", v)}
              placeholder={isGratuitous ? "없으면 시가표준액 사용" : "계약서상 거래금액 입력"}
            />
          )}

          {isOriginal && (
            <CurrencyInput
              label="공사비 (사실상 취득가액)"
              value={form.constructionCost}
              onChange={(v) => set("constructionCost", v)}
              placeholder="공사비 + 설계비 합계"
            />
          )}

          <CurrencyInput
            label={isHousing ? "주택공시가격 (시가표준액)" : "시가표준액 (개별공시지가 × 면적 등)"}
            value={form.standardValue}
            onChange={(v) => set("standardValue", v)}
            placeholder="없으면 비워두세요"
          />

          {isBurdened && (
            <CurrencyInput
              label="승계 채무액 (부담부증여)"
              value={form.encumbrance}
              onChange={(v) => set("encumbrance", v)}
              placeholder="채무 승계 금액"
            />
          )}

          {isHousing && (
            <div>
              <label className={labelCls}>전용면적 (㎡)</label>
              <input
                type="number"
                className={selectCls}
                value={form.areaSqm}
                onChange={(e) => set("areaSqm", e.target.value)}
                placeholder="85㎡ 이하면 농특세 면제"
              />
            </div>
          )}

          <div className={checkboxWrapCls}>
            <input
              type="checkbox"
              id="isRelatedParty"
              checked={form.isRelatedParty}
              onChange={(e) => set("isRelatedParty", e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <label htmlFor="isRelatedParty" className={`${labelCls} cursor-pointer`}>
              특수관계인 간 거래 (지방세기본법 §2④ — 시가 70%~130% 벗어나면 시가 기준 과세)
            </label>
          </div>

          {form.isRelatedParty && (
            <CurrencyInput
              label="시가인정액 (감정가·매매사례가액)"
              value={form.marketValue}
              onChange={(v) => set("marketValue", v)}
              placeholder="시가 기준 금액"
            />
          )}
        </div>
      )}

      {/* ── Step 2: 세율·중과 ── */}
      {step === 2 && (
        <div className="space-y-4">
          {isHousing && (
            <>
              <div>
                <label className={labelCls}>취득 후 주택 수 (취득 대상 포함)</label>
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
                <div className={`${checkboxWrapCls} pl-6`}>
                  <input
                    type="checkbox"
                    id="isMetropolitan"
                    checked={form.isMetropolitan}
                    onChange={(e) => set("isMetropolitan", e.target.checked)}
                    className="h-4 w-4 rounded border-input"
                  />
                  <label htmlFor="isMetropolitan" className={`${labelCls} cursor-pointer`}>
                    수도권 주택 (한도: 4억) — 비수도권은 3억
                  </label>
                </div>
              )}
            </>
          )}

          {!isHousing && (
            <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
              주택 이외 물건은 조정대상지역 다주택 중과세 조건이 적용되지 않습니다.
              <br />
              기본세율이 자동 적용됩니다.
            </div>
          )}

          {/* 사치성 재산 중과 — 모든 물건 유형에 적용 가능 */}
          <div className={checkboxWrapCls}>
            <input
              type="checkbox"
              id="isLuxuryProperty"
              checked={form.isLuxuryProperty}
              onChange={(e) => set("isLuxuryProperty", e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <label htmlFor="isLuxuryProperty" className={`${labelCls} cursor-pointer`}>
              사치성 재산 (골프장·별장·고급주택·고급오락장·고급선박) — 기본세율 + 4%p 중과 (지방세법 §13①)
            </label>
          </div>
        </div>
      )}

      {/* ── Step 3: 취득 시기 + 결과 ── */}
      {step === 3 && (
        <div className="space-y-4">
          {!result && (
            <>
              <p className="text-sm text-muted-foreground">
                취득 시기 관련 날짜를 입력하세요. 입력하지 않으면 오늘 날짜가 사용됩니다.
              </p>

              {isOnerous && (
                <>
                  <div>
                    <label className={labelCls}>잔금 지급일</label>
                    <DateInput
                      value={form.balancePaymentDate}
                      onChange={(v) => set("balancePaymentDate", v)}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>등기접수일</label>
                    <DateInput
                      value={form.registrationDate}
                      onChange={(v) => set("registrationDate", v)}
                    />
                  </div>
                </>
              )}

              {isGiftOrDonation && !isInheritance && (
                <div>
                  <label className={labelCls}>계약일 (증여·기부채납 계약일)</label>
                  <DateInput
                    value={form.contractDate}
                    onChange={(v) => set("contractDate", v)}
                  />
                </div>
              )}

              {isOriginal && (
                <div>
                  <label className={labelCls}>사용승인서 발급일</label>
                  <DateInput
                    value={form.usageApprovalDate}
                    onChange={(v) => set("usageApprovalDate", v)}
                  />
                </div>
              )}

              {isInheritance && (
                <div>
                  <label className={labelCls}>상속개시일 (피상속인 사망일)</label>
                  <DateInput
                    value={form.balancePaymentDate}
                    onChange={(v) => set("balancePaymentDate", v)}
                  />
                </div>
              )}
            </>
          )}

          {result && (
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
          )}
        </div>
      )}

      {/* 오류 표시 */}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* 네비게이션 */}
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
