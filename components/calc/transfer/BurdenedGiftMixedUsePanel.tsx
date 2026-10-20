"use client";

/**
 * 겸용주택 × 부담부증여 — 증여재산 평가 **읽기 전용 요약** + 구분 감정평가 선언(G-13).
 *
 * ## 왜 입력 칸이 아니라 요약인가 (중복 입력 제거)
 * 일반 주택 부담부증여의 ④ 「증여일 주택 기준시가」 칸(`bgGiftBuildingStdPriceAtTransfer`)과 ② 「양도시/취득시 기준시가」 총액 칸은
 * 겸용 엔진이 읽지 않는다 — 겸용은 4부분 기준시가(`mixedTransfer*`·`mixedAcq*`)를 ③ 겸용 패널에서 받고, 엔진이 거기서 4부분을 다시 계산한다.
 * 이 패널은 그 값을 **합산해 보여 줄 뿐**이다. 합계 산식은 leaf(`mixedTransferStdTotal`/`mixedAcqStdTotal`)에만 있고,
 * ④가 엔진에 싣는 합계·⑧이 요구하는 칸도 같은 함수다(3중 패턴). 비어 있는 칸은 0으로 메우지 않고 이름으로 알린다.
 *
 * ## 부분별 채무비율
 * 채무비율이 하나가 아니라 **주택분·상가분 둘**이다(채무 귀속, D-7). 값은 전부 엔진 `prepareMixedBurdenedGift` 반환이다 — 표시 층이 다시 계산하지 않는다.
 * 한쪽에 양도로 보는 채무액이 없으면 「양도 없음」 배지를 단다 — 세법상 분류(비과세/과세)가 아니라 **양도 여부**다.
 *
 * 설계: docs/02-design/features/transfer-burdened-gift-mixed-use.ui.design.md §5.3·§5.5
 */
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { Frac } from "@/components/calc/results/shared/FormulaParts";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { analyzeMixedBgOfForm } from "@/lib/calc/burdened-gift-mixed-use-preview";
import { mixedAcqStdTotal, mixedTransferStdTotal } from "@/lib/calc/burdened-gift-mixed-use-scope";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

const fmt = (n: number) => n.toLocaleString("ko-KR");
const pct = (num: number, den: number) => (den > 0 ? `${((num / den) * 100).toFixed(2)}%` : "—");

const MISSING_LABEL: Record<string, string> = {
  mixedTransferHousingPrice: "양도시 개별주택공시가격",
  mixedTransferLandPricePerSqm: "양도시 개별공시지가",
  mixedTransferCommercialBuildingPrice: "양도시 상가건물 기준시가",
  mixedAcqHousingPrice: "취득시 개별주택공시가격",
  mixedAcqLandPricePerSqm: "취득시 개별공시지가",
  mixedAcqCommercialBuildingPrice: "취득시 상가건물 기준시가",
};

/** 금액 행 — 라벨 좌 · 금액 우(고정폭 숫자). */
function Row({ label, value, testId, strong }: { label: React.ReactNode; value: number | null; testId?: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${strong ? "font-semibold" : ""}`}>
      <dt className="text-xs">{label}</dt>
      <dd data-testid={testId} className="text-right font-mono tabular-nums whitespace-nowrap text-xs">
        {value === null ? "—" : fmt(value)}
      </dd>
    </div>
  );
}

interface Props {
  asset: AssetForm;
  /** 폼-전역 양도일 = 증여일 */
  transferDate?: string;
}

export function BurdenedGiftMixedUsePanel({ asset, transferDate }: Props) {
  const isMarket = asset.bgValuationMode === "sangjeungbeop_market";
  const t = mixedTransferStdTotal(asset);
  const a = mixedAcqStdTotal(asset, transferDate ?? "");
  const missing = [...t.missing, ...a.missing];
  // 엔진 leaf — 입력이 끝나 이슈가 없을 때만 값이 있다(자동으로 메우지 않는다).
  const prepared = analyzeMixedBgOfForm(asset, undefined, transferDate ?? "")?.prepared;
  const d = prepared?.debt;
  const v = prepared?.value;

  return (
    <ToneCard
      tone="emerald"
      title={isMarket ? "증여재산 평가 — 겸용주택 양도시 기준시가 (시가 안분 비율 근거)" : "증여재산 평가 — 겸용주택 양도시 기준시가 합계"}
      titleExtra={<LawArticleModal legalBasis="상속세및증여세법 §61" label="상증법 §61" />}
      bodyClassName="space-y-3"
    >
      <div data-testid="bg-mixed-valuation-summary" className="space-y-3">
        <p className="text-caption text-emerald-800 dark:text-emerald-200">
          겸용주택의 기준시가는 <b>③ 취득정보의 겸용주택 기준시가</b>에서 한 번만 입력합니다. 아래는 그 값의 합계이며 여기서는 고칠 수 없습니다.
          {isMarket && " 시가 모드에서는 이 합계가 시가를 주택분·상가분으로 나누는 비율의 근거입니다(부가가치세법 시행령 §64①1호)."}
        </p>
        <dl className="space-y-1">
          <Row label="개별주택공시가격 (주택건물 + 부수토지)" value={t.housing > 0 ? t.housing : null} testId="bg-mixed-std-housing" />
          <Row
            label={
              <>
                상가 부수토지 기준시가 = 개별공시지가 {t.landPricePerSqm > 0 ? fmt(t.landPricePerSqm) : "—"} × 상가 부수토지 면적 {t.commercialLandArea.toFixed(2)}㎡
              </>
            }
            value={t.landPricePerSqm > 0 ? t.commercialLand : null}
            testId="bg-mixed-std-commercial-land"
          />
          <Row label="상가건물 기준시가" value={t.commercialBuilding > 0 ? t.commercialBuilding : null} testId="bg-mixed-std-commercial-building" />
          <div className="border-t border-emerald-200 pt-1">
            <Row label="양도시 기준시가 합계" value={t.missing.length === 0 ? t.total : null} testId="bg-mixed-std-total-transfer" strong />
          </div>
          <Row label="취득시 기준시가 합계" value={a.missing.length === 0 ? a.total : null} testId="bg-mixed-std-total-acq" />
        </dl>
        {missing.length > 0 && (
          <p data-testid="bg-mixed-valuation-missing" className="rounded border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-2 text-caption text-amber-900 dark:text-amber-200">
            아직 입력하지 않은 칸: <b>{missing.map((m) => MISSING_LABEL[m] ?? m).join(" · ")}</b> — 「③ 취득정보 &gt; 겸용주택」에서 입력하세요.
          </p>
        )}

        {/* 부분별 채무비율 (채무 귀속 반영) — 엔진 준비 값 그대로 */}
        {d && v ? (
          <div data-testid="bg-attr-parts" className="space-y-1">
            <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">부분별 채무비율 (채무 귀속 반영)</p>
            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-emerald-800 dark:text-emerald-200">
                    <th className="text-left font-medium py-1" />
                    <th className="text-right font-medium py-1">주택분</th>
                    <th className="text-right font-medium py-1">상가분</th>
                  </tr>
                </thead>
                <tbody className="[&>tr>td]:py-0.5 [&>tr>td+td]:text-right [&>tr>td+td]:font-mono [&>tr>td+td]:tabular-nums [&>tr>td+td]:whitespace-nowrap">
                  <tr><td>증여가액</td><td>{fmt(v.housing)}</td><td>{fmt(v.commercial)}</td></tr>
                  <tr><td>귀속 채무</td><td>{fmt(d.housing)}</td><td>{fmt(d.commercial)}</td></tr>
                  <tr><td>구분 불분명 안분</td><td>{fmt(d.unallocatedToHousing)}</td><td>{fmt(d.unallocatedToCommercial)}</td></tr>
                  <tr className="font-semibold"><td>양도로 보는 채무액</td><td data-testid="bg-attr-debt-housing">{fmt(d.housingDebt)}</td><td data-testid="bg-attr-debt-commercial">{fmt(d.commercialDebt)}</td></tr>
                  <tr>
                    <td>채무비율</td>
                    <td>
                      {d.housingDebt > 0 ? <><Frac top={fmt(d.housingDebt)} bottom={fmt(v.housing)} /> = {pct(d.housingDebt, v.housing)}</> : "—"}
                    </td>
                    <td>
                      {d.commercialDebt > 0 ? <><Frac top={fmt(d.commercialDebt)} bottom={fmt(v.commercial)} /> = {pct(d.commercialDebt, v.commercial)}</> : "—"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {(d.housingDebt === 0 || d.commercialDebt === 0) && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {d.housingDebt === 0 && (
                  <span data-testid="bg-attr-not-transferred-housing" className="inline-flex rounded bg-slate-200 px-2 py-0.5 text-micro font-semibold text-slate-700">
                    주택분 양도 없음
                  </span>
                )}
                {d.commercialDebt === 0 && (
                  <span data-testid="bg-attr-not-transferred-commercial" className="inline-flex rounded bg-slate-200 px-2 py-0.5 text-micro font-semibold text-slate-700">
                    상가분 양도 없음
                  </span>
                )}
                <span className="text-caption text-muted-foreground">
                  채무가 귀속되지 않은 부분은 양도로 보지 않습니다(소득세법 제88조 제1호 후단). 그 부분의 무상 이전분은 수증자의 증여세 대상입니다.
                </span>
              </div>
            )}
            {d.unallocated > 0 && (
              <p className="text-caption text-amber-800 dark:text-amber-200">구분 불분명 채무를 주택·상가 증여가액 비율로 나눈 것은 해석례가 직접 답하지 않아 확인이 필요합니다.</p>
            )}
          </div>
        ) : (
          <p className="text-caption text-muted-foreground">채무 귀속과 겸용 기준시가 입력이 끝나면 부분별 채무비율이 표시됩니다.</p>
        )}
      </div>
    </ToneCard>
  );
}

/**
 * G-13 — 주택·상가로 **구분된 감정평가가액**이 있는가(부가가치세법 시행령 §64①1호 단서). 시가 모드 × 겸용 전용, **필수·기본값 없음**.
 * 있으면 주택분 시가 한 칸(상가분 = 시가 총액 − 주택분, 4부분 내부는 기준시가 비례). 없으면 기준시가 비율로 시가를 나눈다(같은 호 본문).
 * 기준시가 비례로 두면 12억 문턱이 조용히 틀릴 수 있어(엔진 Q-11) 선언을 필수로 받는다.
 */
export function BurdenedGiftHousingAppraisalField({
  asset,
  onChange,
}: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}) {
  return (
    <div data-testid="bg-housing-appraisal" className="space-y-2">
      <FieldCard
        stacked
        required
        label="주택·상가로 구분된 감정평가가액"
        hint="감정평가서에 주택분과 상가분 가액이 구분되어 있으면 「있음」을 선택합니다. 없으면 시가를 양도시 기준시가 비율로 주택·상가에 나눕니다(부가가치세법 시행령 제64조 제1항 제1호). 같은 호 단서의 감정평가가액은 공급시기가 속하는 과세기간의 직전 과세기간 개시일부터 공급시기가 속하는 과세기간 종료일까지 평가한 것으로 한정되며, 이 기간을 증여일 기준으로 보는 것은 확인이 필요합니다."
      >
        <RadioCardGroup
          name={`bgHousingAppraisalDeclared-${asset.assetId ?? "primary"}`}
          data-field="bgHousingAppraisalDeclared"
          tone="amber"
          layout="inline"
          value={asset.bgHousingAppraisalDeclared}
          onChange={(v) => onChange({ bgHousingAppraisalDeclared: v })}
          options={[
            { value: "none", label: "없음" },
            { value: "exists", label: "있음" },
          ]}
        />
      </FieldCard>
      {asset.bgHousingAppraisalDeclared === "exists" && (
        <FieldCard
          stacked
          required
          label="주택분 감정평가가액"
          field="bgHousingAppraisalValue"
          hint="상가분은 위 양도시 시가 평가액에서 이 금액을 뺀 값으로 봅니다."
        >
          <CurrencyInput label="" hideUnit value={asset.bgHousingAppraisalValue} onChange={(v) => onChange({ bgHousingAppraisalValue: v })} />
        </FieldCard>
      )}
    </div>
  );
}
