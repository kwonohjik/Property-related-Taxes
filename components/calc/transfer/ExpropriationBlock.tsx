import type { AssetForm, AssetReductionForm } from "@/lib/stores/calc-wizard-store";
import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { getStandaloneDefault } from "./UnifiedReductionPanel-defaults";

/**
 * 양도원인(공익수용·협의매수) 단일 입력 — assetKind==="land" 전용.
 * 선택 시 composite onChange로 #1 NBL 의제 프리필 + #2 §77 감면 자동 추가(단일 소스 고시일).
 * 판정(§168의14③3호 5년/2006 · §77 2년)은 엔진 독립 — 단일 토글이 사업용 단정하지 않음.
 * 설계: docs/02-design/features/transfer-public-expropriation-unified.ui.design.md
 */
type ExprReduction = Extract<AssetReductionForm, { type: "public_expropriation" }>;

export function ExpropriationBlock({
  asset,
  onChange,
}: {
  asset: AssetForm;
  onChange: (d: Partial<AssetForm>) => void;
}) {
  const isExpr = asset.transferCause === "public_expropriation";
  const expr = asset.reductions?.find(
    (r): r is ExprReduction => r.type === "public_expropriation",
  );

  function setCause(v: "general" | "public_expropriation") {
    if (v === "public_expropriation") {
      const has = asset.reductions?.some((r) => r.type === "public_expropriation");
      onChange({
        transferCause: "public_expropriation",
        // #1 프리필 — NBL 사업용 여부 자동 판정 활성 + 수용 의제(Step4서 override 가능)
        nblUseDetailedJudgment: true,
        nblExemptPublicExpropriation: true,
        // #2 프리필 — §77 감면 자동 추가(없을 때만). 기본 shape 재사용(dual-truth 회피)
        ...(has
          ? {}
          : { reductions: [...(asset.reductions ?? []), getStandaloneDefault("public_expropriation")] }),
      });
    } else {
      onChange({
        transferCause: "general",
        nblExemptPublicExpropriation: false,
        reductions: (asset.reductions ?? []).filter((r) => r.type !== "public_expropriation"),
      });
    }
  }

  function updateExpr(patch: Partial<ExprReduction>) {
    onChange({
      reductions: (asset.reductions ?? []).map((r) =>
        r.type === "public_expropriation" ? { ...r, ...patch } : r,
      ),
    });
  }

  return (
    <section className="rounded-xl border border-rose-200 bg-rose-50/40 p-4 dark:border-rose-900/50 dark:bg-rose-950/20">
      <SectionHeader
        title="양도원인"
        description="공익사업 협의매수·수용이면 선택 — 비사업용 토지 사업용 의제·§77 감면·환산 기준시가 특례에 공용"
      />
      <RadioCardGroup
        name="transferCause"
        tone="rose"
        value={asset.transferCause}
        onChange={setCause}
        options={[
          { value: "general", label: "일반", description: "일반 양도" },
          {
            value: "public_expropriation",
            label: "공익수용·협의매수",
            description: "공익사업법 등에 따른 협의매수·수용",
            testId: "expr-cause-radio",
          },
        ]}
      />

      {isExpr && (
        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">사업인정고시일</label>
            <DateInput
              value={asset.expropriationNoticeDate}
              onChange={(v) => onChange({ expropriationNoticeDate: v })}
              data-testid="expr-notice-date"
            />
            <p className="text-xs text-muted-foreground">
              §168의14③3호(사업용 의제)·§77 감면 판정에 공용. 취득·양도 시점과 대비해 자동 판정됩니다.
            </p>
          </div>

          <CurrencyInput
            label="현금보상액"
            value={expr?.expropriationCash ?? "0"}
            onChange={(v) => updateExpr({ expropriationCash: v })}
            hint="§77 감면 대상 현금보상 금액 (원)"
          />
          <CurrencyInput
            label="채권보상액"
            value={expr?.expropriationBond ?? "0"}
            onChange={(v) => updateExpr({ expropriationBond: v })}
            hint="채권으로 받는 보상 금액 (원)"
          />

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">채권 만기특약</label>
            <RadioCardGroup
              name="exprBondYears"
              tone="rose"
              value={expr?.expropriationBondHoldingYears ?? "none"}
              onChange={(v) => updateExpr({ expropriationBondHoldingYears: v })}
              layout="inline"
              options={[
                { value: "none", label: "없음", description: "일반 15%(채권 20%)" },
                { value: "3", label: "3년 특약", description: "35%" },
                { value: "5", label: "5년 특약", description: "45%" },
              ]}
            />
          </div>
        </div>
      )}
    </section>
  );
}
