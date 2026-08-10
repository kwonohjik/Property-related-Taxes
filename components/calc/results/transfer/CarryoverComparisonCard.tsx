"use client";

/**
 * 이월과세 비교과세 결과 카드 — 소득세법 §97조의2
 *
 * A(이월과세 적용) · B(미적용) 두 시나리오를 나란히 표시.
 * 결정세액이 큰 시나리오에 "✓ 채택" 배지 (emerald).
 */

import { cn } from "@/lib/utils";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import type {
  CarryoverTaxationDetail,
  CarryoverScenarioADetail,
  CarryoverScenarioBDetail,
} from "@/lib/tax-engine/types/transfer-carryover.types";

// ── 포맷 헬퍼 ────────────────────────────────────────────────────

function fmt(n: number): string {
  return formatKRW(n);
}

// ── 서브 컴포넌트: 단일 시나리오 컬럼 ───────────────────────────

interface ScenarioColProps {
  label: string;
  adopted: boolean;
  children: React.ReactNode;
  determinedTax: number;
}

function ScenarioCol({ label, adopted, children, determinedTax }: ScenarioColProps) {
  return (
    <div
      className={cn(
        "flex-1 rounded-lg border p-3 space-y-2",
        adopted
          ? "border-emerald-300 bg-emerald-50/60 ring-1 ring-emerald-200"
          : "border-border bg-background",
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        {adopted && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-caption font-bold text-emerald-700">
            ✓ 채택 (더 큰 세액)
          </span>
        )}
      </div>
      {children}
      <div
        className={cn(
          "rounded-md border p-2 text-center",
          adopted ? "border-emerald-300 bg-emerald-100/60" : "border-border bg-muted/30",
        )}
      >
        <p className="text-caption text-muted-foreground mb-0.5">결정세액</p>
        <p className="text-base font-bold tabular-nums">{fmt(determinedTax)}</p>
      </div>
    </div>
  );
}

// ── 행 헬퍼 ─────────────────────────────────────────────────────

function InfoRow({ label, value, sub = false }: { label: string; value: string; sub?: boolean }) {
  return (
    <div className={cn("flex justify-between text-xs", sub && "pl-2 text-muted-foreground")}>
      <span>{label}</span>
      <span className="tabular-nums font-medium">{value}</span>
    </div>
  );
}

// ── Scenario A 상세 ──────────────────────────────────────────────

function ScenarioAContent({ a, adopted }: { a: CarryoverScenarioADetail; adopted: boolean }) {
  /**
   * ⚠️ 안분 내역은 **시나리오 A 자신**이 들고 있다(`giftTaxApportionment`).
   *    `result.transferBurdenedGiftBreakdown`은 **채택된 시나리오의 것**이라 B가 채택되면
   *    사라지는데, 이 컬럼은 채택과 무관하게 항상 그려지기 때문이다(E2E CB-4가 이 갭을 잡았다).
   */
  const ap = a.giftTaxApportionment;
  return (
    <ScenarioCol label="[A] 이월과세 적용" adopted={adopted} determinedTax={a.determinedTax}>
      <div className="space-y-1">
        <InfoRow label="취득가액 [당초 증여자 취득가]" value={fmt(a.acquisitionPrice)} />
        <InfoRow label="보유기간 [당초 증여자 기산]" value={`${a.holdingPeriodYears}년`} />
        <InfoRow label="양도차익" value={fmt(a.transferGain)} />
        {a.giftTaxAddedToExpense > 0 && (
          <InfoRow
            label={`증여세 상당액 가산 [§163의2]${a.giftTaxLimitApplied ? " (한도 적용)" : ""}`}
            value={`+${fmt(a.giftTaxAddedToExpense)}`}
            sub
          />
        )}
        {a.donorCapexAddedToExpense > 0 && (
          <InfoRow
            label="당초 증여자 자본적지출 [§97조의2 ① 2호]"
            value={`+${fmt(a.donorCapexAddedToExpense)}`}
            sub
          />
        )}
        {a.donorCapexGuardApplied && (
          <p className="text-micro text-amber-600 pl-2">
            * 증여자 자본적지출: 2024.1.1. 이전 양도 — 가드 발동, 0 처리
          </p>
        )}
        {/**
          * 🔑 **부담부증여에서는 산입액이 입력액과 다르다** — 채무비율로 안분되기 때문이다
          * (「소득세법 시행령」 §163의2② 2호 「양도한 해당 자산가액」). 산식을 값 옆에 두지
          * 않으면 사용자는 「8천만을 넣었는데 왜 3,125만인가」를 알 수 없다.
          */}
        {ap && ap.apportioned !== ap.raw && (
          <p className="text-micro text-muted-foreground pl-2 leading-relaxed">
            * 증여세 상당액 {fmt(ap.raw)} × 인수 채무액 {fmt(ap.debtAmount)} ÷ 증여가액{" "}
            {fmt(ap.giftValuation)} = <b>{fmt(ap.apportioned)}</b> (양도로 보는 부분만 산입 —
            시행령 §163의2② 2호)
          </p>
        )}
        {a.giftTaxLimitApplied && (
          <p className="text-micro text-amber-600 pl-2 leading-relaxed">
            * 증여세 한도 발동 — {ap ? "안분액이 " : ""}「양도로 보는 부분」의 양도차익{" "}
            {fmt(a.giftTaxLimitCap)}을 넘어 한도까지만 산입 (시행령 §163의2② 후단)
          </p>
        )}
      </div>
    </ScenarioCol>
  );
}

// ── Scenario B 상세 ──────────────────────────────────────────────

function ScenarioBContent({ b, adopted, isComparisonExclusion }: {
  b: CarryoverScenarioBDetail;
  adopted: boolean;
  isComparisonExclusion: boolean;
}) {
  return (
    <ScenarioCol
      label={`[B] 미적용 (비교과세)${isComparisonExclusion ? " ← 비교과세 세액 역전" : ""}`}
      adopted={adopted}
      determinedTax={b.determinedTax}
    >
      <div className="space-y-1">
        <InfoRow label="취득가액 [증여 당시 평가액]" value={fmt(b.acquisitionPrice)} />
        <InfoRow label="보유기간 [수증자 기산]" value={`${b.holdingPeriodYears}년`} />
        <InfoRow label="양도차익" value={fmt(b.transferGain)} />
      </div>
    </ScenarioCol>
  );
}

// ── 적용배제 배너 ────────────────────────────────────────────────

const EXCLUSION_REASON_LABELS: Record<string, string> = {
  expropriation: "§97조의2 ② 1호 — 사업인정고시일 2년 이전 증여받은 토지·건물의 협의매수·수용",
  one_house_exemption: "§97조의2 ② 2호 — 이월과세 적용 시 1세대1주택 비과세 해당 (고가주택 포함)",
  tax_comparison: "§97조의2 ② 3호 — 비교과세 (Scenario B 세액이 더 큼)",
  period_exceeded: "§97조의2 ③ — 적용기간 초과",
  // 「단서」가 아니라 **괄호**다. 배우자=사망으로 혼인관계 소멸 / 직계존비속=양도 당시 사망.
  relation_invalid: "§97조의2 ① — 증여자 사망으로 이월과세 대상에서 제외",
  family_business: "§97조의2 ④ — 가업상속공제 적용 자산",
};

// ── 메인 컴포넌트 ────────────────────────────────────────────────

interface Props {
  detail: CarryoverTaxationDetail;
}

export function CarryoverComparisonCard({ detail }: Props) {
  const adoptedA = detail.adoptedScenario === "A";

  const periodLabel =
    detail.applicablePeriodYears === 10
      ? "10년 이내 (2022.12.31. 개정 — 증여일 ≥ 2023.1.1.)"
      : "5년 이내 (종전 규정)";

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4" data-print-section="carryover">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">이월과세 비교과세 결과</p>
        <span className="text-caption text-muted-foreground">소득세법 §97조의2</span>
      </div>

      {/* 적용기간 */}
      <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        적용기간 판정: {periodLabel}
        {detail.isEligible ? (
          <span className="ml-2 text-emerald-700 font-medium">→ 이월과세 요건 충족</span>
        ) : detail.exclusionReason === "period_exceeded" ? (
          <span className="ml-2 text-rose-600 font-medium">→ 기간 초과 — 이월과세 미적용</span>
        ) : null}
      </div>

      {/* 적용배제 배너 (배제 사유 있을 때) */}
      {!detail.isEligible && detail.exclusionReason && detail.exclusionReason !== "tax_comparison" && (
        <div className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs">
          <p className="font-semibold text-amber-800 mb-0.5">이월과세 적용배제 — 사용자 선언</p>
          <p className="text-amber-700">{EXCLUSION_REASON_LABELS[detail.exclusionReason] ?? detail.exclusionReason}</p>
          <p className="text-amber-600 mt-1">→ 일반 양도소득세 계산 적용</p>
        </div>
      )}

      {/* A·B 두 시나리오 나란히 */}
      <div className="flex gap-3">
        <ScenarioAContent a={detail.scenarioA} adopted={adoptedA} />
        <ScenarioBContent
          b={detail.scenarioB}
          adopted={!adoptedA}
          isComparisonExclusion={detail.comparisonExclusion}
        />
      </div>

      {/* 하단 요약 */}
      <div className="rounded-md border-t pt-3 space-y-1 text-xs text-muted-foreground">
        <div className="flex justify-between font-semibold text-foreground text-sm">
          <span>채택 시나리오: {detail.adoptedScenario} ({detail.adoptedScenario === "A" ? "이월과세 적용" : "비교과세 미적용"})</span>
          <span>신고세액 = max(A, B) = {fmt(Math.max(detail.scenarioA.determinedTax, detail.scenarioB.determinedTax))}</span>
        </div>
        {detail.comparisonExclusion && (
          <p className="text-rose-600">※ §97조의2 ② 3호 비교과세 — Scenario B 채택 (세액 역전)</p>
        )}
      </div>
    </div>
  );
}
