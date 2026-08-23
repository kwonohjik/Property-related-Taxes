import type { AssetForm, AssetReductionForm } from "@/lib/stores/calc-wizard-store";
import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import {
  isExprValuationEligibleAssetKind,
  isHousingExprEligibleAssetKind,
  isSplitLandExprEligibleAssetKind,
  EXPR_VALUATION_MIN_TRANSFER_DATE,
} from "@/lib/tax-engine/expropriation-scope";

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
 * 환산 min[] 특례 노출 기준일 — **단일 소스**(`expropriation-scope.ts`)에서 가져온다.
 * 근거 상세·1996~2009 구 문언 미지원은 `transfer-tax-expropriation-valuation.ts` 주석 참조.
 */
const EXPR_VALUATION_MIN_DATE = EXPR_VALUATION_MIN_TRANSFER_DATE;

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
  // 공통 게이트: 환산모드 + 양도 ≥ 2009.02.04 (단건 — 다필지는 필지 카드 전용).
  const exprDateOk =
    !asset.parcelMode &&
    asset.useEstimatedAcquisition &&
    !!transferDate &&
    transferDate >= EXPR_VALUATION_MIN_DATE;
  // 건물 split(토지·건물 취득일 분리) — `calcSplitGain` 경로라 단건 per-sqm 특례가 우회된다.
  // 이 경우 per-sqm 칸을 노출하면 입력해도 엔진이 안 읽는 **침묵 무시** → 토지분 총액 블록으로 전환(P6/D6).
  const isSplitBuilding =
    isSplitLandExprEligibleAssetKind(asset.assetKind) && asset.hasSeperateLandAcquisitionDate;
  // 주택 **regular** split(비-PHD)만 총액 트랙에서 제외 — Q6 미지원(validate 차단). 노출 시 침묵 무시.
  // 주택 **PHD** split(§164⑦ 3시점 환산)은 총액 트랙을 정상 소비하므로(P6b/D15) 노출·요구한다.
  const isHousingRegularSplit =
    isHousingExprEligibleAssetKind(asset.assetKind) &&
    asset.hasSeperateLandAcquisitionDate &&
    !asset.usePreHousingDisclosure;
  // §164⑨ 1호 환산 min[] 게이트: 적격 자산(가~다목) + 환산모드 + 양도 ≥ 2009.02.04.
  // ⚠️ 적격 판정은 `expropriation-scope.ts` **단일 소스** 위임 — 여기서 자산종류를 나열하면
  //    validate·엔진과 갈라진다(3층 드리프트). UI 노출 조건 = validate와 동일해야 한다.
  // split 건물은 per-sqm 경로가 우회되므로 제외(아래 split 총액 블록으로).
  const showValuationMin =
    isExprValuationEligibleAssetKind(asset.assetKind) && exprDateOk && !isSplitBuilding;
  // 겸용주택(나·라 복합) — 주택분(라목 총액)+상가분(가목 토지) 두 트랙(P7/D8). 별도 겸용 블록으로 처리하고
  // 아래 단건 주택 총액 블록은 제외한다. 겸용은 환산 기반이라 useEstimatedAcquisition 게이트 불요.
  const isMixedUse = asset.assetKind === "housing" && !!asset.isMixedUseHouse;
  const showMixedUseExpr =
    isMixedUse && !!transferDate && transferDate >= EXPR_VALUATION_MIN_DATE;
  // §164⑨ 1호 주택(라목) 총액 트랙 게이트 (P5·P6b) — 개별주택가격은 총액이라 원/㎡가 아닌 총액 3후보.
  // 단건 주택 + PHD split 주택은 노출. regular split·겸용은 제외(겸용은 겸용 블록으로).
  const showHousingTotal =
    isHousingExprEligibleAssetKind(asset.assetKind) && exprDateOk && !isHousingRegularSplit && !isMixedUse;
  // §164⑨ 1호 건물 split 토지분 총액 트랙 게이트 (P6/D6).
  const showSplitLandExpr = isSplitBuilding && exprDateOk;

  const expr = asset.reductions?.find(
    (r): r is ExprReduction => r.type === "public_expropriation",
  );

  // §164⑨ min[] 3후보 (원/㎡): ① 양도시 기준시가(읽기전용 참조) ② 보상 ③ 보상기초.
  // ⚠️ 양도시 기준시가 소스는 자산종류별로 다르다(표시 전용 분기):
  //    - 상가(commercial_building): 호별고시가 `cbUnitPriceAtTransfer` (§99①1호다목)
  //    - 일반건물(general_building): 양도시 토지 개별공시지가 `gbTransferLandPricePerSqm`
  //      (§164⑨은 GB에서 **토지분만** 적용 — 시행규칙 §80⑧, 계획 D16-GB)
  //    - 그 외(토지·건물): `standardPricePerSqmAtTransfer`
  const stdPerSqm =
    asset.assetKind === "commercial_building"
      ? parseAmount(asset.cbUnitPriceAtTransfer || "")
      : asset.assetKind === "general_building"
        ? parseAmount(asset.gbTransferLandPricePerSqm || "")
        : parseAmount(asset.standardPricePerSqmAtTransfer || "");
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

      {/**
        * 농어촌특별세 비과세 판정 — 「농어촌특별세법 시행령」 §4①1호
        *
        * 같은 호는 §77 감면의 농특세 비과세를 「「조세특례제한법」 제69조제1항 본문에 따른 거주자가
        * **직접 경작한 토지**(8년 이상 경작할 것의 요건은 적용하지 아니한다)로 **한정**」한다.
        * ⇒ 이 칸이 없으면 자경 농민이 비과세를 주장할 경로 자체가 없다(감면세액 × 20%가 그대로 붙는다).
        * ⚠️ §69 자경농지 **감면**의 8년 요건과 별개다 — 조문이 그 요건을 적용하지 않는다고 명시한다.
        */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium">직접 경작한 토지 여부</label>
        <RadioCardGroup
          name="exprSelfCultivated"
          tone="rose"
          value={expr?.expropriationSelfCultivated ? "yes" : "no"}
          onChange={(v) => updateExpr({ expropriationSelfCultivated: v === "yes" })}
          layout="inline"
          options={[
            { value: "no", label: "아니오", description: "감면세액의 20%가 농어촌특별세로 부과됩니다" },
            {
              value: "yes",
              label: "예",
              description: "농어촌특별세 비과세 (농어촌특별세법 시행령 §4①1호 — 8년 경작 요건 불요)",
            },
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

      {showHousingTotal && (
        <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
            환산 양도당시 기준시가 특례 — 주택 총액 (소득령 §164⑨ 1호)
          </p>
          <p className="text-caption leading-relaxed text-amber-700 dark:text-amber-400">
            수용(2009.02.04 이후) 주택을 환산취득가액으로 계산 시, 양도당시 기준시가(개별주택가격)는
            <b> 개별주택가격·보상액·보상기초 기준시가 중 가장 작은 총액</b>이 적용됩니다. 주택은 총액이라
            원/㎡ 분해가 없습니다. (① 개별주택가격은 위 취득 정보의 양도시 기준시가를 그대로 씁니다.)
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:items-start">
            <CurrencyInput
              label="② 보상액 총액"
              value={asset.housingCompensationTotal}
              onChange={(v) => onChange({ housingCompensationTotal: v })}
              hideUnit
              hint="수용 보상액 총액 (원)"
            />
            <CurrencyInput
              label="③ 보상산정 기초 기준시가 총액"
              value={asset.housingCompensationBasisTotal}
              onChange={(v) => onChange({ housingCompensationBasisTotal: v })}
              hideUnit
              hint="보상 산정 기초 기준시가 총액 (원)"
            />
          </div>
        </div>
      )}

      {showSplitLandExpr && (
        <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
            환산 양도당시 기준시가 특례 — 토지·건물 분리 양도 (소득령 §164⑨ 1호)
          </p>
          <p className="text-caption leading-relaxed text-amber-700 dark:text-amber-400">
            토지·건물 취득일이 달라 분리(안분) 계산되는 수용(2009.02.04 이후) 건물을 환산취득가액으로
            계산 시, <b>토지분</b> 양도당시 기준시가는 <b>토지분 기준시가·보상액·보상기초 기준시가 중
            가장 작은 총액</b>이 적용됩니다. 건물분은 <b>보상 기초 기준시가</b> 개념이 없어(시행규칙 §80⑧)
            특례를 적용하지 않습니다. (① 토지분 양도시 기준시가 총액은 안분비로 자동 산정됩니다.)
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:items-start">
            <CurrencyInput
              label="② 토지분 보상액 총액"
              value={asset.splitLandCompensationTotal}
              onChange={(v) => onChange({ splitLandCompensationTotal: v })}
              hideUnit
              hint="토지분 수용 보상액 총액 (원)"
            />
            <CurrencyInput
              label="③ 토지분 보상산정 기초 기준시가 총액"
              value={asset.splitLandCompensationBasisTotal}
              onChange={(v) => onChange({ splitLandCompensationBasisTotal: v })}
              hideUnit
              hint="토지분 보상 산정 기초 개별공시지가 총액 (원)"
            />
          </div>
        </div>
      )}

      {showMixedUseExpr && (
        <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
            환산 양도당시 기준시가 특례 — 겸용주택 주택분·상가분 (소득령 §164⑨ 1호)
          </p>
          <p className="text-caption leading-relaxed text-amber-700 dark:text-amber-400">
            수용(2009.02.04 이후) 겸용주택을 환산취득가액으로 계산 시 <b>주택분</b>(개별주택가격 총액)과
            <b> 상가분 토지</b>(개별공시지가 총액)의 양도당시 기준시가를 각각 <b>보상액·보상기초 중 작은 값</b>
            으로 낮춥니다. 상가 <b>건물분</b>은 보상 기초 기준시가 개념이 없어(시행규칙 §80⑧) 적용하지 않으며,
            양도가액 안분은 원값을 유지합니다. 보상액은 주택분·상가토지분으로 나누어 입력하세요.
          </p>
          <div className="rounded-md border border-amber-200 bg-amber-100/40 p-2.5 space-y-2 dark:border-amber-900/50 dark:bg-amber-950/30">
            <p className="text-caption font-semibold text-amber-800 dark:text-amber-300">주택분 (개별주택가격)</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:items-start">
              <CurrencyInput
                label="② 주택분 보상액 총액"
                value={asset.housingCompensationTotal}
                onChange={(v) => onChange({ housingCompensationTotal: v })}
                hideUnit
                hint="주택분 수용 보상액 총액 (원)"
              />
              <CurrencyInput
                label="③ 주택분 보상산정 기초 기준시가 총액"
                value={asset.housingCompensationBasisTotal}
                onChange={(v) => onChange({ housingCompensationBasisTotal: v })}
                hideUnit
                hint="주택분 보상 산정 기초 기준시가 총액 (원)"
              />
            </div>
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-100/40 p-2.5 space-y-2 dark:border-amber-900/50 dark:bg-amber-950/30">
            <p className="text-caption font-semibold text-amber-800 dark:text-amber-300">상가분 토지 (개별공시지가)</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:items-start">
              <CurrencyInput
                label="② 상가분 토지 보상액 총액"
                value={asset.mixedCommercialLandCompensationTotal}
                onChange={(v) => onChange({ mixedCommercialLandCompensationTotal: v })}
                hideUnit
                hint="상가분 토지 수용 보상액 총액 (원)"
              />
              <CurrencyInput
                label="③ 상가분 토지 보상산정 기초 개별공시지가 총액"
                value={asset.mixedCommercialLandCompensationBasisTotal}
                onChange={(v) => onChange({ mixedCommercialLandCompensationBasisTotal: v })}
                hideUnit
                hint="상가분 토지 보상 산정 기초 개별공시지가 총액 (원)"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
