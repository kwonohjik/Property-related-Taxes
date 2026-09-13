"use client";

/**
 * OtherAssetBlock — §94①4 기타자산 판정 (Step 1)
 *
 * 다목: 과점주주 — 요건 **3종 AND**(법 §94①4 다목 · 영 §158①②)
 *   ① 자산총액 중 부동산등 50% 이상  ② 과점주주 소유비율(임계는 **양도일 종속**)
 *   ③ 소급 **3년** 내 과점주주 외의 자에게 누적 50% 이상 양도
 *   ⇒ 판정은 엔진 leaf `block-shareholder-gate.ts` **단일 소스**. 이 화면은 미리보기만 한다.
 * 라목: 부동산과다보유법인 (자산 80% 이상 + 골프장 등) — **양도비율 요건 없음**
 *
 * §94② 우선순위: §94①3 (상장·비상장) + §94①4 동시 충족 시 제4호(기타자산) 우선
 */

import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { DateInput } from "@/components/ui/date-input";
import {
  judgeBlockShareholderGate,
  isOwnershipThresholdExclusive,
  BLOCK_SHAREHOLDER_REQUIREMENT_LABEL,
} from "@/lib/tax-engine/stock-transfer/block-shareholder-gate";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { BlockShareholderPriorTransferModal } from "./BlockShareholderPriorTransferModal";
import {
  computeCumulativeTransferRatioPercent,
  type BlockShareholderAggregation,
} from "@/lib/calc/stock-prior-transfer-lookup";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

interface OtherAssetBlockProps {
  form: Pick<
    StockTransferFormData,
    | "isQualifyingBlockShareholder"
    | "isHeavyRealEstateForRate"
    | "isHeavyRealEstateForValuation"
    | "cumulativeTransferRatio"
    | "nblRatioOfCorpAssets"
    | "blockShareholderRealEstateRatio"
    | "blockShareholderOwnershipRatio"
    | "aggregationFirstTransferDate"
    | "transferDate"
    | "marketType"
    | "priorMajorShareholderTax"
    // ── Phase C — 기신고 이력 합산이 «채워 넣는» 칸 (읽기: 당회차 값과 더하기 위해) ──
    | "blockShareholderSourceIds"
    | "securityName"
    | "securityCode"
    | "shareCount"
    | "totalIssuedShares"
    | "transferTotalPrice"
    | "perShareTransferPrice"
    | "perShareAcquisitionPrice"
    | "actualExpenses"
  >;
  /** 세무사 모드 의뢰인 격리 — 이력 후보 필터 축 */
  activeClientId?: string | null;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

/** "12.5" → 0.125. 빈 문자열·NaN 은 undefined(=미입력) — 게이트가 «미달»로 본다. */
function pctToRatio(v: string): number | undefined {
  const n = Number.parseFloat((v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n * 0.01 : undefined;
}

export function OtherAssetBlock({ form, onChange, activeClientId }: OtherAssetBlockProps) {
  const [lookupOpen, setLookupOpen] = useState(false);

  /**
   * 자동 채움 이후 **사용자가 값을 고치면 출처 배지를 지운다**(`history-lookup-modal` 규약).
   *
   * 배지를 남겨 두면 「이력에서 온 값」이라 믿게 되는데 실제로는 손으로 바꾼 값이다 —
   * 다음에 이력을 다시 불러올 때 무엇이 반영됐는지 판단할 근거가 사라진다.
   *
   * 🔑 **합산이 채운 칸만** 대상이다. 그 밖의 토글(라목·§104①9호)은 출처와 무관하다.
   */
  const AGGREGATION_FILLED_KEYS = useMemo(
    () =>
      new Set<keyof StockTransferFormData>([
        "cumulativeTransferRatio",
        "aggregationFirstTransferDate",
        "priorMajorShareholderTax",
      ]),
    [],
  );
  const onChangeResettingBadge = useCallback(
    (patch: Partial<StockTransferFormData>) => {
      const touchesFilled = Object.keys(patch).some((k) =>
        AGGREGATION_FILLED_KEYS.has(k as keyof StockTransferFormData),
      );
      onChange(
        touchesFilled && form.blockShareholderSourceIds.length > 0
          ? { ...patch, blockShareholderSourceIds: [] }
          : patch,
      );
    },
    [onChange, AGGREGATION_FILLED_KEYS, form.blockShareholderSourceIds.length],
  );
  const isBothActive = form.isQualifyingBlockShareholder && form.isHeavyRealEstateForRate;

  /**
   * 요건② 임계 문구 — **엔진 leaf 가 고른다**. 손으로 적으면 시행일(2020-02-11) 경계에서
   * 화면과 판정이 어긋난다([[feedback_shared_predicate_argument_parity]]).
   */
  const ownershipHint = useMemo(() => {
    const d = form.transferDate ? new Date(form.transferDate) : undefined;
    const exclusive = d && !Number.isNaN(d.getTime()) ? isOwnershipThresholdExclusive(d) : true;
    return exclusive
      ? "영 §158① — 본인과 기타주주의 소유주식 합계가 법인 주식등 합계액의 50%를 «초과»해야 한다. 기타주주 범위는 대주주 판정(§157)과 같은 주주 집합이나 기준일이 다르다(대주주=직전 사업연도 종료일 / 여기=합산기간 최초 양도일). 판정은 각 주주별로 한다."
      : "영 §158①(2020-02-11 시행 전 양도분 — 대통령령 제30395호 부칙 §41) — 본인과 기타주주의 소유주식 합계가 법인 주식등 합계액의 50% «이상»이면 과점주주다.";
  }, [form.transferDate]);

  /**
   * 기신고 합산 적용 — **다섯 값이 한 소스에서 파생**된다(영 §158② · §168②).
   *
   * 🔑 이것은 `useEffect → store` 미러링이 **아니다** — 사용자의 명시적 액션(모달 확인)에
   *    한 번 반응해 `onChange` 를 부르고 끝난다([[feedback_mirror_pattern]]).
   *
   * ⚠️ **양도가액은 «총액 모드»로 넣는다** — 주당 단가로 되돌리면 나누어떨어지지 않을 때
   *    반올림 오차가 세액에 실린다. 취득가액은 엔진에 총액 모드가 없어 주당 가중평균을
   *    쓰고(교재 p.626 과 같은 방식), 나누어떨어지지 않으면 잔액을 안내한다.
   */
  const applyAggregation = useCallback(
    (agg: BlockShareholderAggregation) => {
      const cur = (v: string) => {
        const n = Number.parseInt((v ?? "").replace(/,/g, ""), 10);
        return Number.isFinite(n) ? n : 0;
      };
      const curShares = cur(form.shareCount);
      const totalShares = agg.priorShareCount + curShares;

      // 당회차 양도가액 — 총액 모드면 그 값, 주당 모드면 단가 × 주식수.
      const curTransfer =
        cur(form.transferTotalPrice) || cur(form.perShareTransferPrice) * curShares;
      const curAcq = cur(form.perShareAcquisitionPrice) * curShares;

      const totalTransfer = agg.priorTransferPrice + curTransfer;
      const totalAcq = agg.priorAcquisitionPrice + curAcq;
      const totalExpenses = agg.priorExpenses + cur(form.actualExpenses);

      const ratioPct = computeCumulativeTransferRatioPercent(
        agg.priorShareCount,
        curShares,
        cur(form.totalIssuedShares),
      );

      onChange({
        shareCount: String(totalShares),
        // 양도가액 — 총액 모드(정확)
        transferPriceMode: "actual",
        transferActualInputMode: "total",
        transferTotalPrice: String(totalTransfer),
        // 취득가액 — 주당 가중평균(엔진에 총액 모드 없음)
        perShareAcquisitionPrice: totalShares > 0 ? String(Math.round(totalAcq / totalShares)) : "",
        actualExpenses: String(totalExpenses),
        aggregationFirstTransferDate: agg.aggregationFirstTransferDate,
        priorMajorShareholderTax: String(agg.priorMajorShareholderTax),
        blockShareholderSourceIds: agg.sourceIds,
        ...(ratioPct !== undefined
          ? { cumulativeTransferRatio: String(Math.round(ratioPct * 100) / 100) }
          : {}),
      });
    },
    [
      form.shareCount,
      form.transferTotalPrice,
      form.perShareTransferPrice,
      form.perShareAcquisitionPrice,
      form.actualExpenses,
      form.totalIssuedShares,
      onChange,
    ],
  );

  /** 게이트 미리보기 — 4칸이 다 차야 의미가 있다. 한쪽만으로 추정하지 않는다. */
  const gate = useMemo(() => {
    if (!form.isQualifyingBlockShareholder) return null;
    const d = form.transferDate ? new Date(form.transferDate) : undefined;
    const first = form.aggregationFirstTransferDate
      ? new Date(form.aggregationFirstTransferDate)
      : undefined;
    if (!d || Number.isNaN(d.getTime()) || !first || Number.isNaN(first.getTime())) return null;
    if (
      !form.blockShareholderRealEstateRatio ||
      !form.blockShareholderOwnershipRatio ||
      !form.cumulativeTransferRatio
    ) {
      return null;
    }
    return judgeBlockShareholderGate({
      realEstateRatio: pctToRatio(form.blockShareholderRealEstateRatio),
      ownershipRatio: pctToRatio(form.blockShareholderOwnershipRatio),
      cumulativeTransferRatio: pctToRatio(form.cumulativeTransferRatio),
      firstTransferDate: first,
      transferDate: d,
    });
  }, [
    form.isQualifyingBlockShareholder,
    form.transferDate,
    form.aggregationFirstTransferDate,
    form.blockShareholderRealEstateRatio,
    form.blockShareholderOwnershipRatio,
    form.cumulativeTransferRatio,
  ]);

  return (
    <FieldCard
      label="기타자산 해당 여부 (§94①4)"
      hint="과점주주 또는 부동산과다보유법인 주식 — 기타자산으로 분류 시 §55 누진세율 적용"
      trailing={
        <div className="flex flex-wrap gap-1">
          <LawArticleModal legalBasis="소득세법 §94 ① 4호" label="§94①4" />
          <LawArticleModal legalBasis="소득세법 §94 ②" label="§94②" />
        </div>
      }
    >
      {/* §94② 우선순위 안내 */}
      {isBothActive && (
        <div className="mb-3 rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <p className="font-medium">§94② 우선순위 적용</p>
          <p className="text-xs mt-1">
            <LawArticleModal legalBasis="소득세법 §94 ① 3호" label="§94①3" />(상장·비상장)과{" "}
            <LawArticleModal legalBasis="소득세법 §94 ① 4호" label="§94①4" />(기타자산)를 동시에 충족하면 제4호(기타자산)가 우선 적용됩니다.
            기본공제도 부동산 그룹(<LawArticleModal legalBasis="소득세법 §103 ①" label="§103①1호" />)에 합산됩니다.
          </p>
        </div>
      )}

      {/* 다목: 과점주주 */}
      <ToggleCard
        checked={form.isQualifyingBlockShareholder}
        onCheckedChange={(v) => onChange({ isQualifyingBlockShareholder: v })}
        title="§94①4 다목 — 과점주주"
        description="세 요건 모두 충족해야 한다 — ① 자산총액 중 부동산등 50% 이상 ② 과점주주 소유비율(영 §158①) ③ 소급 3년 내 과점주주 외의 자에게 누적 50% 이상 양도"
        tone="rose"
      >
        <div className="mt-3 space-y-3">
          {/* 요건① — 부동산등 비율 (법 §94①4 다목 1)2) · 영 §158④) */}
          <FieldCard
            label="법인 자산총액 중 부동산등 비율"
            required
            hint="영 §158④ — 장부가액 기준(§94①1호 자산은 기준시가가 크면 기준시가). 양도일 소급 1년 내 차입·증자로 늘어난 현금·대여금·금융재산은 자산총액에서 제외한다. 아래 «합산기간 최초 양도일» 현재 값을 넣는다."
            unit="%"
            trailing={
              <LawArticleModal legalBasis="소득세법 시행령 §158 ④" label="영§158④" />
            }
          >
            <DecimalInput
              value={form.blockShareholderRealEstateRatio}
              onChange={(v) => onChange({ blockShareholderRealEstateRatio: v })}
            />
          </FieldCard>

          {/* 요건② — 과점주주 소유비율 (영 §158① · 임계 양도일 종속) */}
          <FieldCard
            label="과점주주 소유비율 (본인 + 기타주주)"
            required
            hint={ownershipHint}
            unit="%"
            trailing={
              <LawArticleModal legalBasis="소득세법 시행령 §158 ①" label="영§158①" />
            }
          >
            <DecimalInput
              value={form.blockShareholderOwnershipRatio}
              onChange={(v) => onChange({ blockShareholderOwnershipRatio: v })}
            />
          </FieldCard>

          {/* 요건③ — 누적 양도비율 (영 §158②) */}
          <FieldCard
            label="소급 3년 누적 양도비율"
            required
            hint="과점주주 «전원»이 «과점주주 외의 자»에게 양도한 주식을 합산한다. 분모는 해당 법인의 주식등 합계액이다. 양도인이 실질적으로 지배하는 법인에 양도한 분은 「과점주주 외의 자」에 해당하지 않아 분자에서 빠진다(국세청 서면-2024-자본거래-2702)."
            unit="%"
            trailing={
              <LawArticleModal legalBasis="소득세법 시행령 §158 ②" label="영§158②" />
            }
          >
            <DecimalInput
              value={form.cumulativeTransferRatio}
              onChange={(v) => onChangeResettingBadge({ cumulativeTransferRatio: v })}
            />
          </FieldCard>

          {/* 합산창 — 최초 양도일 (영 §158② 후단) */}
          <FieldCard
            label="합산기간 최초 양도일"
            required
            hint="영 §158② — 양도일부터 소급 3년 내에 과점주주가 양도한 주식을 합산한다. 이 날짜가 3년을 넘으면 누적비율이 50% 이상이어도 다목은 성립하지 않는다. 위 부동산등 비율·소유비율도 이 날 현재 값이다."
          >
            <DateInput
              value={form.aggregationFirstTransferDate}
              onChange={(v) => onChangeResettingBadge({ aggregationFirstTransferDate: v })}
            />
          </FieldCard>

          {/* Phase C — 기신고 이력에서 합산 */}
          <ToneCard tone="sky" title="기신고 이력에서 합산 (영 §158②)">
            <p className="text-xs text-slate-600">
              같은 법인 주식을 여러 번에 걸쳐 양도했다면, 소급 3년 내 기신고 건을 골라
              양도가액·취득가액·필요경비·누적 양도비율·기납부세액을 한 번에 채웁니다.
              이력이 없으면 각 칸을 직접 입력하세요.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="modalLauncher"
                onClick={() => setLookupOpen(true)}
                disabled={!form.transferDate || !form.securityName}
                title={
                  !form.transferDate || !form.securityName
                    ? "종목명과 양도일을 먼저 입력하세요"
                    : undefined
                }
                data-testid="block-shareholder-prior-lookup"
              >
                기신고 불러오기
              </Button>
              {form.blockShareholderSourceIds.length > 0 && (
                <span className="text-caption text-emerald-700">
                  기신고 {form.blockShareholderSourceIds.length}건 반영됨 — 값을 직접 고치면 이 표시가
                  사라집니다
                </span>
              )}
            </div>
          </ToneCard>

          <BlockShareholderPriorTransferModal
            open={lookupOpen}
            onOpenChange={setLookupOpen}
            transferDate={form.transferDate}
            securityName={form.securityName}
            securityCode={form.securityCode || undefined}
            activeClientId={activeClientId ?? null}
            selectedIds={form.blockShareholderSourceIds}
            onConfirm={applyAggregation}
          />

          {/* 영 §168② — 대주주로서 납부하였거나 납부할 세액 */}
          <ToneCard tone="emerald" title="이미 「대주주 주식」으로 신고·납부한 세액 (영 §168②)">
            <FieldCard
              label="대주주로서 납부하였거나 납부할 세액"
              hint="합산기간 중 앞선 회차를 §94①3호(상장·비상장 주식)로 이미 신고했다면 그 «산출세액»을 넣는다. 재계산 산출세액에 그 부분이 포함돼 있어 빼지 않으면 두 번 과세된다. 가산세·전자신고세액공제는 산출세액이 아니므로 포함하지 않는다."
              trailing={
                <LawArticleModal legalBasis="소득세법 시행령 §168 ②" label="영§168②" />
              }
            >
              <CurrencyInput
                label="대주주로서 납부하였거나 납부할 세액"
                hideLabel
                hideUnit
                value={form.priorMajorShareholderTax}
                onChange={(v) => onChangeResettingBadge({ priorMajorShareholderTax: v })}
              />
            </FieldCard>
          </ToneCard>

          {/* 게이트 판정 미리보기 — 엔진 leaf 단일 소스 */}
          {gate && (
            <ToneCard
              tone={gate.passed ? "emerald" : "amber"}
              title={
                gate.passed
                  ? "§94①4 다목 요건 충족 — 기타자산(§55① 누진)으로 계산됩니다"
                  : "§94①4 다목 요건 미충족"
              }
            >
              {gate.passed ? (
                <p className="text-xs">
                  세 요건(부동산등 비율·과점주주 소유비율·소급 3년 누적 양도비율)을 모두 충족합니다.
                </p>
              ) : (
                <div className="text-xs space-y-1">
                  <p>미달 항목:</p>
                  <ul className="list-disc pl-4">
                    {gate.failed.map((r) => (
                      <li key={r}>{BLOCK_SHAREHOLDER_REQUIREMENT_LABEL[r]}</li>
                    ))}
                  </ul>
                  <p className="mt-1">
                    {form.marketType === "other_asset" && !form.isHeavyRealEstateForRate
                      ? "시장 유형에서 상장·비상장을 선택해 §94①3호(주식) 세율로 계산하세요."
                      : "기타자산이 아니라 §94①3호(주식) 세율로 계산됩니다."}
                  </p>
                </div>
              )}
            </ToneCard>
          )}
        </div>
      </ToggleCard>

      {/* 라목: 부동산과다보유법인 */}
      <div className="mt-3">
        <ToggleCard
          checked={form.isHeavyRealEstateForRate}
          onCheckedChange={(v) => onChange({ isHeavyRealEstateForRate: v })}
          title="§94①4 라목 — 부동산과다보유법인"
          description="자산총액 80% 이상 부동산 + 골프장·스키장·휴양콘도 등 (시행령 §158⑤)"
          tone="rose"
        >
          {/* 평가 가중치 반전용 (50% 임계 별도) */}
          <div className="mt-3">
            <ToggleCard
              checked={form.isHeavyRealEstateForValuation}
              onCheckedChange={(v) => onChange({ isHeavyRealEstateForValuation: v })}
              title="보충적 평가 가중치 반전 (자산 50% 이상)"
              description="소령 §165⑤ 단서 — 부동산 50% 이상 시 순손익 2/5 + 순자산 3/5 (가중치 반전)"
              tone="fuchsia"
            />
          </div>
        </ToggleCard>
      </div>

      {/*
        §104①9호 — 비사업용 토지 과다소유법인 주식 (세율만 기본세율 + 10%p)
        시행령 §167의7이 「§94①4호 **다목 또는 라목**」을 대상으로 하므로 두 토글 **바깥**에 둔다.
        분류(다목/라목)와 독립된 축이라 amber로 구분한다.
      */}
      {(form.isQualifyingBlockShareholder || form.isHeavyRealEstateForRate) && (
        <div className="mt-3">
          <ToneCard tone="amber" title="§104①9호 — 비사업용 토지 과다소유법인 여부">
            <FieldCard
              label="자산총액 중 비사업용토지 가액 비율"
              hint="법인 재무제표 기준. 비사업용토지는 「법인세법」 §55조의2②에 따른다(소득세법 §104의3이 아님). 50% 이상이면 세율이 기본세율 + 10%p로 적용된다. 모르면 비워두세요 — 미해당으로 계산된다."
              unit="%"
              trailing={
                <div className="flex flex-wrap gap-1">
                  <LawArticleModal legalBasis="소득세법 §104 ① 9호" label="§104①9" />
                  <LawArticleModal legalBasis="소득세법 시행령 §167조의7" label="영§167의7" />
                </div>
              }
            >
              <DecimalInput
                value={form.nblRatioOfCorpAssets}
                onChange={(v) => onChange({ nblRatioOfCorpAssets: v })}
              />
            </FieldCard>
          </ToneCard>
        </div>
      )}
    </FieldCard>
  );
}
