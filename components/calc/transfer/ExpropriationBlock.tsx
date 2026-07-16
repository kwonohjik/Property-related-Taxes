import type { AssetForm, AssetReductionForm } from "@/lib/stores/calc-wizard-store";
import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";

/**
 * 공익수용·협의매수 상세 입력 — "양도원인" 라디오는 TransferModeBlock(양도 정보 카드)의
 * 3지선다로 통합됨(2026-07-02). 이 컴포넌트는 "공익수용·협의매수" 선택 시 펼쳐지는 상세만 담당.
 *
 * 자산종류 무관 노출: §77(조특법)은 "토지등"(공익사업법 §2 = 토지·건물·물건·권리) 대상이므로
 * 건물·주택·상가 수용도 §77 감면 대상(asset-kind-gate standalone = 전 자산 허용).
 *
 * ⚠️ 환산 min[] 특례(**소득세법 시행령 §164⑨ 1호**)는 현재 `showValuationMin`이 토지로 게이트한다.
 *    이는 **법령 범위보다 좁다** — §164⑨은 법 §99①1호 "가목부터 라목까지"(토지·건물·오피스텔/
 *    상업용 건물·주택 전부)를 대상으로 한다. 게이트 확대는 계획 P3의 범위.
 *    (종전 "집행기준 99-164-12" 인용은 국세청 행정규칙 — 법령 근거는 시행령 §164⑨)
 *
 * 보상액 → 자동 파생 (현금/채권 onChange 시 canonical 필드에 직접 write, useEffect 미사용):
 *  - 양도가액(actualSalePrice) = 현금 + 채권 보상 (수용 양도가액 = 보상총액). 수정 가능.
 *  - ㎡당 보상가액(compensationPerSqm) = (현금+채권) ÷ 양도면적 (소득령 §164⑨ 1호 후보②). 수정 가능.
 *  직전 자동값과 현재 필드값이 같을 때만 갱신 → 사용자 수정값은 보존(clobber 방지, dual-truth 없음).
 *
 * 설계: docs/02-design/features/transfer-public-expropriation-unified.ui.design.md
 */
type ExprReduction = Extract<AssetReductionForm, { type: "public_expropriation" }>;

/**
 * 환산 min[] 특례 노출 기준일 (수용=양도 시점) — **현행 문언(대통령령 제21301호) 적용 시작일**.
 * 엔진 `transfer-tax-expropriation-valuation.ts`의 `MIN_TRANSFER_DATE`와 동일해야 한다
 * (UI 노출 ↔ 엔진 게이트 일치). 근거 상세·1996~2009 구 문언 미지원은 그 파일 주석 참조.
 */
const EXPR_VALUATION_MIN_DATE = "2009-02-04";

export function ExpropriationBlock({
  asset,
  onChange,
  transferDate,
}: {
  asset: AssetForm;
  onChange: (d: Partial<AssetForm>) => void;
  /** form-global 양도일 (YYYY-MM-DD) — #3 게이트 판정 */
  transferDate: string;
}) {
  // #3 환산 min[] 게이트: 토지 + 환산모드 + 양도 ≥ 2009.02.04
  // (건물은 원/㎡·면적 개념 미적용 → 토지로 한정. UI 노출 조건 = validate와 동일)
  const showValuationMin =
    asset.assetKind === "land" &&
    asset.useEstimatedAcquisition &&
    !!transferDate &&
    transferDate >= EXPR_VALUATION_MIN_DATE;
  const expr = asset.reductions?.find(
    (r): r is ExprReduction => r.type === "public_expropriation",
  );

  // #3 min[] 3후보 (원/㎡): ① 공시지가=양도가액 섹션의 양도시 기준시가(읽기전용 참조) ② 보상 ③ 보상기초
  const stdPerSqm = parseAmount(asset.standardPricePerSqmAtTransfer || "");
  const compPerSqm = parseAmount(asset.compensationPerSqm || "");
  const basisPerSqm = parseAmount(asset.compensationBasisStdPrice || "");
  const allThreePresent = stdPerSqm > 0 && compPerSqm > 0 && basisPerSqm > 0;
  const minPerSqm = allThreePresent ? Math.min(stdPerSqm, compPerSqm, basisPerSqm) : 0;

  function updateExpr(patch: Partial<ExprReduction>) {
    onChange({
      reductions: (asset.reductions ?? []).map((r) =>
        r.type === "public_expropriation" ? { ...r, ...patch } : r,
      ),
    });
  }

  /**
   * 보상총액(현금+채권) 변경 시 파생 필드 갱신 patch.
   * 직전 자동값(oldTotal 기반)과 현재 필드값이 일치할 때만 갱신 → 사용자 수정값 보존.
   */
  function deriveFromCompensation(oldTotal: number, newTotal: number): Partial<AssetForm> {
    const patch: Partial<AssetForm> = {};
    // #1 양도가액 = 현금+채권 (전 자산)
    const curSale = asset.actualSalePrice || "";
    if (curSale === "" || parseAmount(curSale) === oldTotal) {
      patch.actualSalePrice = newTotal > 0 ? String(newTotal) : "";
    }
    // #2 ㎡당 보상가액 = (현금+채권) ÷ 양도면적 (면적 있을 때만 — #3 후보②)
    const area = parseFloat(asset.transferArea || "0");
    if (area > 0) {
      const oldPerSqm = oldTotal > 0 ? Math.round(oldTotal / area) : 0;
      const curPerSqm = asset.compensationPerSqm || "";
      if (curPerSqm === "" || parseAmount(curPerSqm) === oldPerSqm) {
        patch.compensationPerSqm = newTotal > 0 ? String(Math.round(newTotal / area)) : "";
      }
    }
    return patch;
  }

  function setCompensationField(field: "expropriationCash" | "expropriationBond", v: string) {
    const cash = parseAmount(expr?.expropriationCash ?? "0");
    const bond = parseAmount(expr?.expropriationBond ?? "0");
    const oldTotal = cash + bond;
    const newTotal = field === "expropriationCash" ? parseAmount(v) + bond : cash + parseAmount(v);
    onChange({
      reductions: (asset.reductions ?? []).map((r) =>
        r.type === "public_expropriation" ? { ...r, [field]: v } : r,
      ),
      ...deriveFromCompensation(oldTotal, newTotal),
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-rose-200 bg-rose-50/50 p-3 dark:border-rose-900/50 dark:bg-rose-950/20">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:items-start">
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
          onChange={(v) => setCompensationField("expropriationCash", v)}
          hint="§77 감면 대상 현금보상 금액 (원) — 양도가액에 자동 반영"
          data-testid="expr-cash"
        />
        <CurrencyInput
          label="채권보상액"
          value={expr?.expropriationBond ?? "0"}
          onChange={(v) => setCompensationField("expropriationBond", v)}
          hint="채권으로 받는 보상 금액 (원) — 양도가액에 자동 반영"
          data-testid="expr-bond"
        />
      </div>

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

      {showValuationMin && (
        <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
            환산 양도당시 기준시가 특례 (소득령 §164⑨ 1호)
          </p>
          <p className="text-caption leading-relaxed text-amber-700 dark:text-amber-400">
            수용(2009.02.04 이후) 토지를 환산취득가액으로 계산 시, 양도시 기준시가는
            다음 <b>세 가지 중 가장 작은 금액</b>(원/㎡)이 적용됩니다.
          </p>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:items-start">
            {/* ① 공시지가 = 위 양도가액 섹션의 양도시 기준시가(원/㎡) — 읽기전용 참조 */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-amber-900 dark:text-amber-200">
                ① 공시지가 (양도시 기준시가)
              </label>
              <div className="flex min-h-[2.5rem] items-center justify-end rounded-md border border-amber-300/60 bg-amber-100/50 px-3 font-mono text-sm tabular-nums text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                {stdPerSqm > 0 ? stdPerSqm.toLocaleString() : "—"}
              </div>
              <p className="text-xs text-muted-foreground">위 ‘양도가액’의 양도시 기준시가 (원/㎡)</p>
            </div>

            <CurrencyInput
              label="② 보상가액"
              value={asset.compensationPerSqm}
              onChange={(v) => onChange({ compensationPerSqm: v })}
              hideUnit
              hint="(현금+채권)÷양도면적 자동 (수정 가능, 원/㎡)"
            />
            <CurrencyInput
              label="③ 보상산정 기초 기준시가"
              value={asset.compensationBasisStdPrice}
              onChange={(v) => onChange({ compensationBasisStdPrice: v })}
              hideUnit
              hint="보상 산정 기초 ㎡당 기준시가 (원/㎡)"
            />
          </div>

          {allThreePresent && (
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
              → 적용 양도시 기준시가 ={" "}
              <span className="font-mono tabular-nums">{minPerSqm.toLocaleString()}</span> 원/㎡ (셋 중 최소)
            </p>
          )}
        </div>
      )}
    </div>
  );
}
