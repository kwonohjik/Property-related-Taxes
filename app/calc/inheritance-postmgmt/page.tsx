"use client";

/**
 * 영농상속공제 사후관리 추징 시뮬레이터 (F-7)
 *
 * 법령: 상증법 §18의3④⑥⑦ + 시행령 §16⑥⑦⑧ (KoreanLaw MCP 검증 2026-05-21)
 *
 * 본 페이지는 상속 5년 후 발생하는 사후관리 위반 시 추징·이자상당액·신고기한을 시뮬레이션.
 * 본 마법사(/calc/inheritance)와 시간축 분리 — 별도 페이지.
 */

import { useMemo, useState } from "react";

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

export default function FarmingPostMgmtPage() {
  const [violation, setViolation] = useState<FarmingPostMgmtViolation>("asset_disposed");
  const [violationDate, setViolationDate] = useState("");
  const [filingDeadline, setFilingDeadline] = useState("");
  const [originalDeduction, setOriginalDeduction] = useState("");
  const [determinedTax, setDeterminedTax] = useState("");
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
      filingDeadline.length === 10 &&
      parseAmount(originalDeduction) > 0 &&
      parseAmount(determinedTax) >= 0 &&
      Number(interestRate) >= 0 &&
      Number(interestRate) <= 1
    );
  }, [violationDate, filingDeadline, originalDeduction, determinedTax, interestRate]);

  const handleCalculate = () => {
    const input: FarmingPostMgmtInput = {
      violation,
      violationDate,
      filingDeadline,
      determinedTax: parseAmount(determinedTax),
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
            상속세 신고기한 (§67 — 상속개시일 + 6개월)
          </label>
          <DateInput value={filingDeadline} onChange={setFilingDeadline} />
          <p className="text-[10px] text-muted-foreground">이자상당액 기산일 산정용</p>
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
            위반 발생일
          </label>
          <DateInput value={violationDate} onChange={setViolationDate} />
          <p className="text-[10px] text-muted-foreground">§18의3④ 또는 §18의3⑥2호 사유 발생일</p>
        </div>
        <CurrencyInput
          label="공제받은 영농상속공제액"
          value={originalDeduction}
          onChange={setOriginalDeduction}
          hint="원 상속 시 적용된 §18의3 공제액 (최대 30억)"
        />
        <CurrencyInput
          label="사유 발생 시점 결정세액"
          value={determinedTax}
          onChange={setDeterminedTax}
          hint="이자상당액 산정 기준액"
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
          <p className="text-[10px] text-muted-foreground">
            예: 0.029 = 연 2.9% (시점별 개정 — 국세청 고시 확인)
          </p>
        </div>
      </section>

      {/* 정당사유 — §18의3④ 트랙만 */}
      {isFourthParaViolation && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">정당한 사유 (§16⑥, 선택)</h2>
          <p className="text-[11px] text-muted-foreground">
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
              <p className="text-[10px] text-emerald-700 dark:text-emerald-300">
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
                ✓ 추징 면제 (정당사유 인정)
              </p>
              <p className="text-xs text-muted-foreground">
                §16⑥ 정당사유 적용 — 추징세액·이자상당액 모두 0원
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="text-3xl font-bold tracking-tight">
                {formatKRW(result.totalRecapture)}
              </p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">추징세액 (§16⑦ 100%)</p>
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
          <details className="border-t border-border pt-3">
            <summary className="text-xs font-semibold cursor-pointer">
              ▶ 산식 상세 펼침
            </summary>
            <ul className="mt-2 space-y-1 text-[11px]">
              {result.breakdown.map((step, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span className="text-muted-foreground">
                    {step.label}
                    {step.note && <span className="block text-[10px] text-gray-500">{step.note}</span>}
                  </span>
                  {step.amount !== 0 && (
                    <span className="font-mono">{formatKRW(step.amount)}</span>
                  )}
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
    </div>
  );
}
