"use client";

/**
 * 영농상속공제 사후관리 추징 시뮬레이터 (F-7)
 *
 * 법령: 상증법 §18의3④⑥⑦ + 시행령 §16⑥⑦⑧ (KoreanLaw MCP 검증 2026-05-21)
 *
 * 본 페이지는 상속 5년 후 발생하는 사후관리 위반 시 추징·이자상당액·신고기한을 시뮬레이션.
 * 본 마법사(/calc/inheritance)와 시간축 분리 — 별도 페이지.
 */

import { Suspense, useMemo, useState } from "react";
import { expandToggleClass, expandToggleLabel } from "@/components/calc/results/shared/ExpandToggleButton";
import { useSearchParams } from "next/navigation";

import { CurrencyInput, parseAmount, formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { Button } from "@/components/ui/button";
import { calcFarmingPostMgmt } from "@/lib/tax-engine/deductions/farming-post-mgmt";
import type {
  FarmingPostMgmtInput,
  FarmingPostMgmtJustifiedReason,
  FarmingPostMgmtViolation,
  FarmingPostMgmtResult,
} from "@/lib/tax-engine/types/inheritance-farming.types";

const VIOLATION_OPTIONS: Array<{
  value: FarmingPostMgmtViolation;
  label: string;
  description: string;
}> = [
  { value: "asset_disposed", label: "영농상속재산 처분", description: "§18의3④1호 (5년 내)" },
  { value: "farming_ceased", label: "영농 종사 중단", description: "§18의3④2호 (5년 내)" },
  { value: "tax_fraud_conviction", label: "조세포탈 형 확정", description: "§18의3⑥2호 + §15⑲1호 (5년 무관)" },
  { value: "accounting_fraud", label: "회계부정 형 확정", description: "§18의3⑥2호 + §15⑲2호 (자산총액 5% 이상)" },
];

const JUSTIFIED_REASON_OPTIONS: Array<{
  value: FarmingPostMgmtJustifiedReason;
  label: string;
  description: string;
}> = [
  { value: "heir_death", label: "상속인 사망", description: "§16⑥1호" },
  { value: "overseas_relocation", label: "해외이주", description: "§16⑥2호 (해외이주법)" },
  { value: "expropriation", label: "수용·협의매수", description: "§16⑥3호 (공익사업법)" },
  { value: "government_transfer", label: "국가·지자체 양도·증여", description: "§16⑥4호" },
  { value: "land_exchange", label: "농지 교환·분합·대토", description: "§16⑥5호 (영농상)" },
  { value: "corporate_stock_disposal", label: "법인주식 처분", description: "§16⑥6호 (최대주주 유지 조건)" },
  { value: "other_similar", label: "기타 유사 사유", description: "§16⑥7호 (재정경제부령)" },
];

// PR-G: 메인 마법사 → 본 페이지 진입 시 originalDeduction querystring 자동 채움
const FARMING_MAX_CAP = 3_000_000_000;  // §18의3① 30억

function sanitizeOriginalDeductionParam(raw: string | null): string {
  if (!raw) return "";
  const num = parseAmount(raw);
  if (!Number.isFinite(num) || num <= 0) return "";
  const capped = Math.min(num, FARMING_MAX_CAP);
  return String(capped);
}

/** YYYY-MM-DD 쿼리 파라미터만 수용 (메인 마법사 prefill — DateInput·신고기한 호환) */
function sanitizeDateParam(raw: string | null): string {
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

/**
 * 원래 상속세 과세표준 prefill — 양수 정수만 수용(비수치·음수·0은 "" → canCalculate 차단).
 * 과세표준은 30억(공제 한도)을 초과할 수 있으므로 cap 없음(cap은 공제액 전용).
 */
function sanitizeBaseTaxableParam(raw: string | null): string {
  if (!raw) return "";
  const num = parseAmount(raw);
  return Number.isFinite(num) && num > 0 ? String(num) : "";
}

export default function FarmingPostMgmtPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">로딩 중…</div>}>
      <FarmingPostMgmtPageInner />
    </Suspense>
  );
}

function FarmingPostMgmtPageInner() {
  const searchParams = useSearchParams();
  const initialOriginalDeduction = sanitizeOriginalDeductionParam(
    searchParams.get("originalDeduction"),
  );
  // 메인 마법사 진입 시 신고기한(§67)·상속개시일 prefill — 가업 시뮬레이터와 동형(영농 prefill 강화)
  const initialFilingDeadline = sanitizeDateParam(searchParams.get("filingDeadline"));
  // 🔴 호출부(InheritanceTaxResultView.tsx:434)가 붙이는 파라미터명은 **deathDate**다.
  //    가업 시뮬레이터(family-business-postmgmt/page.tsx:120)도 deathDate를 쓴다 —
  //    여기만 inheritanceStartDate를 읽어 **상속개시일 prefill이 동작하지 않았다**(E2E GAP3-1이 잡음).
  //    직접 링크 하위호환을 위해 기존 이름도 계속 인정한다.
  const initialInheritanceStartDate = sanitizeDateParam(
    searchParams.get("deathDate") ?? searchParams.get("inheritanceStartDate"),
  );

  const [violation, setViolation] = useState<FarmingPostMgmtViolation>("asset_disposed");
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [violationDate, setViolationDate] = useState("");
  const [inheritanceStartDate, setInheritanceStartDate] = useState(
    initialInheritanceStartDate,
  );
  const [filingDeadline, setFilingDeadline] = useState(initialFilingDeadline);
  const [originalDeduction, setOriginalDeduction] = useState(initialOriginalDeduction);
  // 원래 상속세 과세표준 (영농공제 반영 후) — §18의3④ 전단 marginal 추징 재계산 기준.
  //   prefill은 양수 정수만 수용(비수치→"" → canCalculate 차단). cap은 없음(과세표준 > 30억 가능).
  const [baseTaxableAmount, setBaseTaxableAmount] = useState(
    sanitizeBaseTaxableParam(searchParams.get("baseTaxable")),
  );
  const [interestRate, setInterestRate] = useState("0.029");  // 기본 연 2.9%
  const [justifiedReason, setJustifiedReason] = useState<FarmingPostMgmtJustifiedReason | "">("");
  const [maintainsMajorShareholder, setMaintainsMajorShareholder] = useState(false);
  const [result, setResult] = useState<FarmingPostMgmtResult | null>(null);

  const isFourthParaViolation =
    violation === "asset_disposed" || violation === "farming_ceased";
  const showCorporateMajorToggle = justifiedReason === "corporate_stock_disposal";

  const canCalculate = useMemo(() => {
    return (
      violationDate.length === 10 &&
      inheritanceStartDate.length === 10 &&
      filingDeadline.length === 10 &&
      parseAmount(originalDeduction) > 0 &&
      // 재계산 base 명시 입력 필수(빈칸=silent 0 방지) — 0도 유효값이라 비어있지 않음으로 판정
      baseTaxableAmount.trim().length > 0 &&
      parseAmount(baseTaxableAmount) >= 0 &&
      Number(interestRate) >= 0 &&
      Number(interestRate) <= 1
    );
  }, [violationDate, inheritanceStartDate, filingDeadline, originalDeduction, baseTaxableAmount, interestRate]);

  const handleCalculate = () => {
    const input: FarmingPostMgmtInput = {
      violation,
      violationDate,
      inheritanceStartDate,
      filingDeadline,
      baseTaxableAmount: parseAmount(baseTaxableAmount),
      interestRate: Number(interestRate),
      justifiedReason: justifiedReason || undefined,
      maintainsMajorShareholder: showCorporateMajorToggle
        ? maintainsMajorShareholder
        : undefined,
    };
    setResult(calcFarmingPostMgmt(parseAmount(originalDeduction), input));
  };

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">영농상속공제 사후관리 시뮬레이터</h1>
        <p className="text-sm text-muted-foreground">
          상증법 §18의3④·⑥ + 시행령 §16⑥⑦⑧ 추징·이자상당액·신고기한 계산.
          5년 사후관리 또는 §18의3⑥ 사후 추징 시 사용.
        </p>
      </header>

      {/* PR-G: 메인 마법사 진입 시 사전 채움 안내 */}
      {initialOriginalDeduction && (
        <div className="rounded-md border border-blue-200 bg-blue-50/40 dark:bg-blue-950/20 dark:border-blue-800 p-3 text-xs text-blue-700 dark:text-blue-300">
          ⓘ 메인 마법사에서 진입 — 공제받은 영농상속공제액{" "}
          <strong>{formatKRW(parseAmount(initialOriginalDeduction))}</strong>
          {initialFilingDeadline && (
            <>
              {" "}및 상속세 신고기한 <strong>{initialFilingDeadline}</strong>
            </>
          )}
          이 사전 입력되었습니다. 필요 시 수정 가능합니다.
        </div>
      )}

      {/* 위반 사유 */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">위반 사유</h2>
        <RadioCardGroup<FarmingPostMgmtViolation>
          name="violation"
          layout="stack"
          tone="rose"
          value={violation}
          options={VIOLATION_OPTIONS}
          onChange={(v) => {
            setViolation(v);
            // §18의3⑥ 트랙 진입 시 정당사유 초기화 (UI 일관성)
            if (v === "tax_fraud_conviction" || v === "accounting_fraud") {
              setJustifiedReason("");
            }
          }}
        />
      </section>

      {/* 일자·금액·이자율 */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
            상속개시일
          </label>
          <DateInput value={inheritanceStartDate} onChange={setInheritanceStartDate} />
          <p className="text-micro text-muted-foreground">
            §18의3④ 5년 사후관리기간 기산 (경과 후 처분·종사중단은 무추징)
          </p>
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
            상속세 신고기한 (§67 — 상속개시일 + 6개월)
          </label>
          <DateInput value={filingDeadline} onChange={setFilingDeadline} />
          <p className="text-micro text-muted-foreground">이자상당액 기산일 산정용</p>
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
            위반 발생일
          </label>
          <DateInput value={violationDate} onChange={setViolationDate} />
          <p className="text-micro text-muted-foreground">§18의3④ 또는 §18의3⑥2호 사유 발생일</p>
        </div>
        <CurrencyInput
          label="공제받은 영농상속공제액"
          value={originalDeduction}
          onChange={setOriginalDeduction}
          hint="원 상속 시 적용된 §18의3 공제액 (최대 30억)"
        />
        <CurrencyInput
          label="원래 상속세 과세표준 (영농공제 반영 후)"
          value={baseTaxableAmount}
          onChange={setBaseTaxableAmount}
          hint="추징세액은 이 과세표준에 산입액을 더해 재계산한 상속세 증가분(§18의3④ 전단·§26 누진)"
        />
        <div className="space-y-1 md:col-span-2">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
            국세기본법 §43의3② 이자율 (소수)
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={interestRate}
            onChange={(e) => setInterestRate(e.target.value)}
            className="w-32 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="0.029"
          />
          <p className="text-micro text-muted-foreground">
            예: 0.029 = 연 2.9% (시점별 개정 — 국세청 고시 확인)
          </p>
        </div>
      </section>

      {/* 정당사유 — §18의3④ 트랙만 */}
      {isFourthParaViolation && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">정당한 사유 (§16⑥, 선택)</h2>
          <p className="text-caption text-muted-foreground">
            적용 시 추징 면제. 사유에 해당하지 않으면 빈칸 유지.
          </p>
          <RadioCardGroup<FarmingPostMgmtJustifiedReason | "">
            name="justifiedReason"
            layout="stack"
            tone="emerald"
            value={justifiedReason}
            options={[
              { value: "", label: "해당 없음", description: "정당사유 없음 (추징 적용)" },
              ...JUSTIFIED_REASON_OPTIONS,
            ]}
            onChange={setJustifiedReason}
          />
          {showCorporateMajorToggle && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20 dark:border-emerald-800 p-3 space-y-2">
              <label className="flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={maintainsMajorShareholder}
                  onChange={(e) => setMaintainsMajorShareholder(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  법인주식 처분 후에도 <strong>최대주주 지위 유지</strong> (§16⑥6호 단서)
                </span>
              </label>
              <p className="text-micro text-emerald-700 dark:text-emerald-300">
                미체크 시 정당사유 불인정 → 추징 적용
              </p>
            </div>
          )}
        </section>
      )}

      <Button
        type="button"
        onClick={handleCalculate}
        disabled={!canCalculate}
        className="w-full"
      >
        추징세액 계산
      </Button>

      {/* 결과 */}
      {result && (
        <section className="rounded-xl border-2 border-primary bg-primary/5 p-5 space-y-3">
          <h2 className="text-sm font-semibold">사후관리 추징 결과</h2>
          {!result.recaptureRequired ? (
            <div className="space-y-1.5">
              <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
                {result.outsideManagementPeriod
                  ? "✓ 추징 대상 아님 (5년 사후관리기간 경과)"
                  : "✓ 추징 면제 (정당사유 인정)"}
              </p>
              <p className="text-xs text-muted-foreground">
                {result.outsideManagementPeriod
                  ? "상속개시일부터 5년 경과 후 처분·종사중단 — §18의3④ 추징 대상 아님 (세액·이자 0원)"
                  : "§16⑥ 정당사유 적용 — 추징세액·이자상당액 모두 0원"}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="text-3xl font-bold tracking-tight">
                {formatKRW(result.totalRecapture)}
              </p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">추징세액 (재계산 증가분)</p>
                  <p className="font-semibold">{formatKRW(result.recaptureAmount)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">이자상당액 (§16⑧)</p>
                  <p className="font-semibold text-amber-600 dark:text-amber-400">
                    + {formatKRW(result.interestAmount)}
                  </p>
                </div>
              </div>
            </div>
          )}
          <div className="border-t border-border pt-3 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">신고기한 (§18의3⑦)</span>
              <span className="font-medium">{result.reportDeadline}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">적용 일수</span>
              <span className="font-medium">{result.interestDays}일</span>
            </div>
          </div>

          {/* breakdown 펼침 */}
          <div className="border-t border-border pt-3">
            <button
              type="button"
              aria-expanded={breakdownOpen}
              onClick={() => setBreakdownOpen((v) => !v)}
              className="flex items-center gap-2 text-xs font-semibold"
            >
              <span>산식 상세 펼침</span>
              <span className={expandToggleClass("slate")} aria-hidden>{expandToggleLabel(breakdownOpen)}</span>
            </button>
            <ul className={`${breakdownOpen ? "" : "hidden print:block "}mt-2 space-y-1 text-caption`}>
              {result.breakdown.map((step, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span className="text-muted-foreground">
                    {step.label}
                    {step.note && <span className="block text-micro text-gray-500">{step.note}</span>}
                  </span>
                  {step.amount !== 0 && (
                    <span className="font-mono">{formatKRW(step.amount)}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
