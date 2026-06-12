"use client";

/**
 * EstimatedUnlistedBlock — 비상장 보충적 평가 입력 블록 (PR-2)
 *
 * 시행령 §165④1: 가중평균 (순손익×3 + 순자산×2)÷5 + 80% 하한
 * 시행령 §165④3: 순자산 단독 4사유
 * 시행령 §165⑤: 부동산과다보유법인 가중치 반전 (isHeavyRealEstateForValuation)
 *
 * 입력값 규약:
 *   NetIncomePerShare = 1주당 순손익가치 (= 1주당 순손익액 ÷ 10% 이미 반영한 값)
 *   NetAssetPerShare  = 1주당 순자산가치
 */

import { useMemo } from "react";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import { EstimatedUnlistedNetIncomeStatement } from "./EstimatedUnlistedNetIncomeStatement";
import { EstimatedUnlistedNetAssetStatement } from "./EstimatedUnlistedNetAssetStatement";
import { adaptUnlistedFlatToApiBody } from "@/lib/tax-engine/stock-transfer/unlisted-flat-adapter";
import { UNLISTED_MESSAGES } from "@/lib/tax-engine/stock-transfer/unlisted-messages";

interface EstimatedUnlistedBlockProps {
  form: StockTransferFormData;
  onChange: (patch: Partial<StockTransferFormData>) => void;
  /**
   * simple 전용 모드 (거래정지 §165③ 우회 등 — full(V2)·사례 49 토글 숨김).
   * api.ts full/사례49 게이트가 marketType==="unlisted" 한정이라
   * 상장+거래정지 조합에서 선택 시 silent 미반영 방지.
   */
  simpleOnly?: boolean;
  /**
   * [C-1] 취득일 거래정지 — 취득측 입력 전용 모드 (simpleOnly보다 좁음).
   * 렌더: 순자산 단독 사유 라디오 + 취득연도 NI/NA + 취득기준시가 미리보기만.
   * 양도연도 섹션·양도 미리보기·full(V2)·사례 49 전부 숨김 (양도측은 1개월 종가평균 유지).
   * acqFaceValueOnly 잔존값 무시·무조건 렌더 (validate 필수와 모순 차단 — 3중 정합).
   */
  acquisitionSideOnly?: boolean;
}

const NET_ASSET_ONLY_REASON_OPTIONS = [
  { value: "", label: "해당 없음", description: "가중평균 (§165④1 본칙) 적용" },
  {
    value: "liquidation_or_owner_death",
    label: "가목: 청산 진행 또는 사업자 사망",
    description: "청산 중인 법인 또는 사업자가 사망한 경우",
  },
  {
    value: "no_business_or_short_or_closed",
    label: "나목: 사업 개시 전·1년 미만·휴폐업",
    description: "순손익가치 산출이 불가능한 경우",
  },
  {
    value: "stock_holding_company",
    label: "다목: 주식가액 80% 이상 (지주회사형)",
    description: "주식·출자지분이 순자산의 80% 이상인 법인",
  },
  {
    value: "remaining_term_under_3y",
    label: "라목: 잔여 존속기한 3년 이내",
    description: "정관상 존속기한이 3년 이내로 남은 법인",
  },
];

export function EstimatedUnlistedBlock({ form, onChange, simpleOnly = false, acquisitionSideOnly = false }: EstimatedUnlistedBlockProps) {
  const netAssetOnlyReason = form.netAssetOnlyReason || "";
  const isNetAssetOnly = netAssetOnlyReason !== "";
  const isHeavyRE = form.isHeavyRealEstateForValuation;
  // 3중 패턴 default — store factory와 일치 (default: "simple"). simpleOnly·acquisitionSideOnly 시 강제 simple.
  const mode = simpleOnly || acquisitionSideOnly ? "simple" : (form.unlistedValuationMode || "simple");

  // full 모드 — adapter가 계산한 4 값을 미리보기에 주입 (UI·adapter 단일 진실)
  const fullReduced = useMemo(() => {
    if (mode !== "full") return null;
    return adaptUnlistedFlatToApiBody(form);
  }, [mode, form]);

  // 가중치 안내
  const niWeight = isHeavyRE ? "2/5" : "3/5";
  const naWeight = isHeavyRE ? "3/5" : "2/5";

  // 양도기준시가 미리보기 (useMemo — useEffect→store 미러링 금지)
  // [DM-1] full 모드에서도 동일 미리보기 노출 — adapter 결과를 NI/NA로 사용
  const transferStdPricePreview = useMemo(() => {
    const ni = mode === "full" && fullReduced
      ? fullReduced.transferNi
      : parseAmount(form.transferYearNetIncomePerShare);
    const na = mode === "full" && fullReduced
      ? fullReduced.transferNa
      : parseAmount(form.transferYearNetAssetPerShare);
    if (ni <= 0 && na <= 0) return null;

    if (isNetAssetOnly) {
      // 순자산 단독 → 80% 하한 없음
      return { perShare: Math.floor(na), floor80Applied: false, method: "net_asset_only" as const };
    }

    const niW = isHeavyRE ? 2 : 3;
    const naW = isHeavyRE ? 3 : 2;
    const weighted = (ni * niW + na * naW) / 5;
    const floor80 = na * 0.8;

    if (weighted > 0 && floor80 > weighted) {
      return { perShare: Math.floor(floor80), floor80Applied: true, method: "weighted_avg" as const };
    }
    return { perShare: Math.floor(weighted), floor80Applied: false, method: "weighted_avg" as const };
  }, [
    mode,
    fullReduced,
    form.transferYearNetIncomePerShare,
    form.transferYearNetAssetPerShare,
    isNetAssetOnly,
    isHeavyRE,
  ]);

  // [사례 49] acqFaceValueOnly 활성 시 분기
  const acqFaceValueOnly = form.acqFaceValueOnly === true;
  const acqFaceValuePerShareNum = parseAmount(form.acqFaceValuePerShare ?? "");
  const shareCountNum = parseInt(form.shareCount || "0", 10);

  // 취득기준시가 미리보기 — full 모드에서도 동일 + [M-4] 사례 49 시 액면가 직접 표시
  // [C-1] acquisitionSideOnly에서는 acqFaceValueOnly 잔존값 무시 (보충평가 산식으로만 표시)
  const acquisitionStdPricePreview = useMemo(() => {
    if (!acquisitionSideOnly && acqFaceValueOnly && acqFaceValuePerShareNum > 0 && shareCountNum > 0) {
      return acqFaceValuePerShareNum;  // 1주당 액면가 직접 표시
    }
    const ni = mode === "full" && fullReduced
      ? fullReduced.acqNi
      : parseAmount(form.acquisitionYearNetIncomePerShare);
    const na = mode === "full" && fullReduced
      ? fullReduced.acqNa
      : parseAmount(form.acquisitionYearNetAssetPerShare);
    if (ni <= 0 && na <= 0) return null;

    if (isNetAssetOnly) {
      return Math.floor(na);
    }

    const niW = isHeavyRE ? 2 : 3;
    const naW = isHeavyRE ? 3 : 2;
    return Math.floor((ni * niW + na * naW) / 5);
  }, [
    acquisitionSideOnly,
    acqFaceValueOnly,
    acqFaceValuePerShareNum,
    shareCountNum,
    mode,
    fullReduced,
    form.acquisitionYearNetIncomePerShare,
    form.acquisitionYearNetAssetPerShare,
    isNetAssetOnly,
    isHeavyRE,
  ]);

  // [M-4] 환산취득가 미리보기 — acqFaceValueOnly 활성 시만
  const conversionPreview = useMemo(() => {
    if (!acqFaceValueOnly || acqFaceValuePerShareNum <= 0) return null;
    if (!transferStdPricePreview || transferStdPricePreview.perShare <= 0) return null;
    // 양도가 — total 모드 / per_share 모드 둘 다 fallback
    const transferPrice =
      form.transferActualInputMode === "total"
        ? parseAmount(form.transferTotalPrice || "")
        : parseAmount(form.perShareTransferPrice || "") * shareCountNum;
    if (transferPrice <= 0) return null;
    return Math.floor(
      Number(
        (BigInt(transferPrice) * BigInt(acqFaceValuePerShareNum)) /
          BigInt(transferStdPricePreview.perShare),
      ),
    );
  }, [
    acqFaceValueOnly,
    acqFaceValuePerShareNum,
    shareCountNum,
    transferStdPricePreview,
    form.transferActualInputMode,
    form.transferTotalPrice,
    form.perShareTransferPrice,
  ]);

  return (
    <div className="space-y-6">
      {/* 가중치 안내 카드 */}
      <div
        className={`rounded-lg border px-4 py-3 text-sm ${
          isHeavyRE
            ? "border-violet-200 bg-violet-50/70 text-violet-800"
            : "border-fuchsia-200 bg-fuchsia-50/60 text-fuchsia-800"
        }`}
      >
        <p className="font-semibold">
          비상장 보충적 평가 — 시행령 §165④1
          {isHeavyRE && " (가중치 반전 적용 — §165⑤ 부동산과다보유)"}
        </p>
        <p className="text-xs mt-1">
          {isNetAssetOnly
            ? "순자산가치 단독 평가 (§165④3) — 80% 하한 미적용"
            : `가중평균 = (순손익가치 × ${niWeight} + 순자산가치 × ${naWeight}) ÷ 5${acquisitionSideOnly ? "" : " + 80% 하한"}`}
        </p>
        <p className="text-xs text-fuchsia-600 mt-1">
          입력값: 순손익가치 = 1주당 순손익액 ÷ 10% (이미 반영된 값으로 입력)
        </p>
      </div>

      {/* [unlisted-direct-calc] 모드 토글 — simple(직접 입력) vs full(행-수준 계산) */}
      {/* simpleOnly(거래정지 우회 등)·acquisitionSideOnly(C-1)에서는 full(V2)·사례49 숨김 — api 게이트 unlisted 한정 silent 미반영 방지 */}
      {!simpleOnly && !acquisitionSideOnly && (
      <>
      <FieldCard
        label="입력 방식"
        hint="간이는 1주당 가액을 직접 입력, 행-수준 계산은 상증령 §54·§55 산식으로 자동 산출"
      >
        <RadioCardGroup
          name="unlistedValuationMode"
          value={mode}
          onChange={(v) =>
            onChange({ unlistedValuationMode: v as "simple" | "full" })
          }
          tone="fuchsia"
          layout="inline"
          options={[
            {
              value: "simple",
              label: "계산결과 입력",
              description: "1주당 순손익·순자산가치를 외부에서 산출하여 입력",
            },
            {
              value: "full",
              label: "평가액 계산",
              description: "24행 순손익 + 19행 순자산을 입력하여 자동 산출",
            },
          ]}
        />
        <p className="mt-2 text-xs text-fuchsia-700">ⓘ {UNLISTED_MESSAGES.TOGGLE_DATA_PERSIST}</p>
      </FieldCard>

      {/* [사례 49] 취득시 장부분실 액면가 ToggleCard (§99①4 후단) */}
      <ToggleCard
        tone="amber"
        title="취득시점 장부분실 — 액면가 적용 (§99①4 후단)"
        description="장부 분실 시 액면가를 취득기준시가로 사용. 양도기준시가는 §165④ 보충 평가 정상 적용."
        checked={form.acqFaceValueOnly ?? false}
        onCheckedChange={(v) => onChange({ acqFaceValueOnly: v })}
      >
        <CurrencyInput
          label="1주당 액면가"
          required
          hint="취득기준시가 = 액면가 × 주식수 (§163⑥4 개산공제 1% 자동 적용)"
          value={form.acqFaceValuePerShare ?? ""}
          onChange={(v) => onChange({ acqFaceValuePerShare: v })}
        />
      </ToggleCard>
      {form.acqFaceValueOnly && (
        <p className="ml-4 text-xs text-amber-600">
          ⚠️ 양/취 모두 액면가 적용은 acquisitionMode = &quot;액면가&quot; 모드(별도)를 사용하세요. 본 토글은 취득시점만 액면가를 적용하는 사례 49 전용입니다.
        </p>
      )}
      </>
      )}

      {/* 순자산 단독 사유 선택 */}
      <FieldCard
        label="순자산 단독 평가 사유 (§165④3)"
        hint="해당 사유가 있는 경우만 선택. 없으면 '해당 없음'으로 둡니다."
      >
        <RadioCardGroup
          name="netAssetOnlyReason"
          value={netAssetOnlyReason}
          onChange={(v) =>
            onChange({
              netAssetOnlyReason: v as StockTransferFormData["netAssetOnlyReason"] | "",
            })
          }
          tone="amber"
          layout="stack"
          options={NET_ASSET_ONLY_REASON_OPTIONS}
        />
      </FieldCard>

      {/* [unlisted-direct-calc] full 모드 — 행-수준 계산 컴포넌트 */}
      {mode === "full" && (
        <div className="space-y-4">
          <EstimatedUnlistedNetIncomeStatement form={form} onChange={onChange} />
          <EstimatedUnlistedNetAssetStatement form={form} onChange={onChange} />
        </div>
      )}

      {/* simple 모드 — 양도일 직전 사업연도 입력 (현행 UI 유지) · [C-1] acquisitionSideOnly 시 양도측 숨김 */}
      {mode === "simple" && !acquisitionSideOnly && (
      <div>
        <p className="text-sm font-medium text-slate-700 mb-3">
          양도일 직전 사업연도 평가 (양도기준시가 산출용)
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {!isNetAssetOnly && (
            <CurrencyInput
              label="1주당 순손익가치"
              required
              hint="= 1주당 순손익액 ÷ 10% (할인율 적용 후 값)"
              value={form.transferYearNetIncomePerShare}
              onChange={(v) => onChange({ transferYearNetIncomePerShare: v })}
            />
          )}
          <CurrencyInput
            label="1주당 순자산가치"
            required
            hint="직전 사업연도 말 기준 순자산 ÷ 발행주식수"
            value={form.transferYearNetAssetPerShare}
            onChange={(v) => onChange({ transferYearNetAssetPerShare: v })}
          />
        </div>
      </div>
      )}

      {/* 양도기준시가 미리보기 — simple·full 양 모드 공통 노출 · [C-1] acquisitionSideOnly 시 숨김 */}
      {!acquisitionSideOnly && (
      <div>
        {/* 양도기준시가 미리보기 */}
        {transferStdPricePreview && (
          <div
            className={`mt-2 rounded border px-3 py-2 text-sm ${
              transferStdPricePreview.floor80Applied
                ? "border-rose-200 bg-rose-50/60 text-rose-700"
                : "border-emerald-200 bg-emerald-50/60 text-emerald-700"
            }`}
          >
            <span className="font-medium">
              양도기준시가 (1주당): {transferStdPricePreview.perShare.toLocaleString()}원
            </span>
            {transferStdPricePreview.floor80Applied && (
              <span className="ml-2 text-xs">(80% 하한 발동 — §165④1 단서)</span>
            )}
            {transferStdPricePreview.method === "net_asset_only" && (
              <span className="ml-2 text-xs">(순자산 단독 — §165④3)</span>
            )}
          </div>
        )}
      </div>
      )}

      {/* 취득일 직전 사업연도 입력 — simple 모드 + acqFaceValueOnly 비활성 시만 노출
          [C-1] acquisitionSideOnly는 acqFaceValueOnly 잔존값 무시·무조건 렌더 (validate 필수와 모순 차단) */}
      {mode === "simple" && (acquisitionSideOnly || !acqFaceValueOnly) && (
      <div>
        <p className="text-sm font-medium text-slate-700 mb-3">
          취득일 직전 사업연도 평가 (취득기준시가 산출용)
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {!isNetAssetOnly && (
            <CurrencyInput
              label="1주당 순손익가치 (취득시점)"
              required
              hint="취득일 직전 사업연도 기준 (원)"
              value={form.acquisitionYearNetIncomePerShare}
              onChange={(v) => onChange({ acquisitionYearNetIncomePerShare: v })}
            />
          )}
          <CurrencyInput
            label="1주당 순자산가치 (취득시점)"
            required
            hint="취득일 직전 사업연도 기준 (원)"
            value={form.acquisitionYearNetAssetPerShare}
            onChange={(v) => onChange({ acquisitionYearNetAssetPerShare: v })}
          />
        </div>
      </div>
      )}

      {/* [사례 49] simple 모드 + acqFaceValueOnly 활성 시 안내 배너 — [C-1] acquisitionSideOnly 시 숨김 */}
      {mode === "simple" && acqFaceValueOnly && !acquisitionSideOnly && (
        <p
          data-testid="eu-simple-acq-hidden-notice"
          className="rounded border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-800"
        >
          ⓘ {UNLISTED_MESSAGES.ACQ_FACE_VALUE_NOTICE} — 취득연도 NI/NA 입력 비노출 (액면가 대체)
        </p>
      )}

      {/* 취득기준시가 미리보기 — simple·full 양 모드 공통 노출 */}
      {acquisitionStdPricePreview !== null && (
        <div className="mt-2 rounded border border-sky-200 bg-sky-50/60 px-3 py-2 text-sm text-sky-700">
          취득기준시가 (1주당): {acquisitionStdPricePreview.toLocaleString()}원
          {acqFaceValueOnly && !acquisitionSideOnly && (
            <span className="ml-2 text-xs text-amber-700">(액면가 — §99①4 후단)</span>
          )}
          <span className="ml-2 text-xs">
            (개산공제 기준 = {acquisitionStdPricePreview.toLocaleString()} ×{" "}
            {shareCountNum.toLocaleString()}주 × 1%)
          </span>
        </div>
      )}

      {/* [M-4 사례 49] 환산취득가 미리보기 카드 — acqFaceValueOnly 활성 시만 ([C-1] acquisitionSideOnly 제외) */}
      {acqFaceValueOnly && !acquisitionSideOnly && conversionPreview !== null && transferStdPricePreview && (
        <div
          data-testid="eu-conversion-preview"
          className="mt-2 rounded border border-fuchsia-200 bg-fuchsia-50/60 px-3 py-2 text-sm text-fuchsia-800 space-y-1"
        >
          <p className="font-medium">환산취득가 (사례 49 — §99①4 후단 + §165④)</p>
          <p className="text-xs">
            = 양도가 × (1주당 액면가 ÷ 양도기준시가)
          </p>
          <p className="text-xs">
            = (양도가) × ({acqFaceValuePerShareNum.toLocaleString()} ÷ {transferStdPricePreview.perShare.toLocaleString()})
          </p>
          <p className="font-semibold text-fuchsia-900">
            = {conversionPreview.toLocaleString()}원
          </p>
        </div>
      )}
    </div>
  );
}
