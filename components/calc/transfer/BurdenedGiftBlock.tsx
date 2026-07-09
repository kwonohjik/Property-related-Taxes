"use client";

/**
 * 부담부증여 입력 블록 (소득세법 시행령 §159).
 *
 * Phase 1: propertyType === "general_building" + acquisitionCause === "burdened_gift" 시 노출.
 * - 평가 모드 라디오 (상증법 기준시가 / 시가)
 * - 인수 채무 3분리 입력 (보증금·차입금·임대료)
 * - (선택) 근저당 설정액 분리 입력 — v2 본격 분기
 * - 시가 모드 시 양도시·취득시 평가액 입력
 *
 * 가시성 원칙:
 *  - 펼침 카드 tone="fuchsia" — 부담부증여 전용 tone
 *  - 양도가액 = 인수채무 자동 표시 (소령 §159, 사용자 입력 차단)
 *  - useEffect 미러링 금지 (useMemo 순수 계산만)
 */

import { useMemo } from "react";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { BurdenedGiftPriorGiftsBlock } from "./BurdenedGiftPriorGiftsBlock";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}

const VALUATION_MODE_OPTIONS = [
  {
    value: "sangjeungbeop_standard",
    label: "상증법 기준시가",
    description: "보충적평가 (개별공시지가 + 건물기준시가)",
  },
  {
    value: "sangjeungbeop_market",
    label: "상증법 시가",
    description: "매매사례·감정·보상·경매·공매가",
  },
] as const;

// 취득가액 산정방식 (시가 모드 — 소득세법 §100① 양도·취득 산정방식 일치 원칙)
const ACQUISITION_METHOD_OPTIONS = [
  {
    value: "actual",
    label: "실지취득가액 안분",
    description: "증여자의 실제 취득가액 확인 시 — 실지취득가액 × 채무비율 (§97①1호가목)",
  },
  {
    value: "converted",
    label: "환산취득가액",
    description: "실지취득가 불명 시 — 양도가액 × 취득기준시가 ÷ 양도기준시가 (§176의2③)",
  },
] as const;

// Phase 3: 증여자-수증자 관계 (상증법 §53 증여재산공제)
// 주의: enum 값 의미
//   lineal_descendant       = 수증자가 직계비속(성년) — 증여자가 직계비속(자녀→부모 방향) (§53③)
//   lineal_ascendant_adult  = 증여자가 직계존속, 수증자 성년 (§53② 본문)
//   lineal_ascendant_minor  = 증여자가 직계존속, 수증자 미성년 (§53② 단서)
const DONOR_RELATION_OPTIONS = [
  {
    value: "lineal_descendant",
    label: "직계비속 (성년 수증자)",
    description: "수증자가 성년 직계비속(자녀·손자녀) — 증여재산공제 5천만 원",
  },
  {
    value: "lineal_ascendant_minor",
    label: "직계존속 (미성년 수증자)",
    description: "증여자가 직계존속, 수증자가 미성년 — 증여재산공제 2천만 원 (§53② 단서)",
  },
  {
    value: "lineal_ascendant_adult",
    label: "직계존속 (성년 수증자)",
    description: "증여자가 직계존속(부모·조부모), 수증자 성년 — 증여재산공제 5천만 원 (§53② 본문)",
  },
  {
    value: "spouse",
    label: "배우자",
    description: "법률혼 배우자 — 증여재산공제 6억 원",
  },
  {
    value: "other_relative",
    label: "기타 친족",
    description: "6촌 이내 혈족·4촌 이내 인척 — 증여재산공제 1천만 원",
  },
] as const;

export function BurdenedGiftBlock({ asset, onChange }: Props) {
  // 인수 채무액 = 임대보증금 + 담보차입금 (소령 §159 — 양도가액)
  const lendingDeposit = parseAmount(asset.bgLendingDepositTotal) || 0;
  const mortgageDebt = parseAmount(asset.bgMortgageDebtAmount) || 0;
  const assumedDebtAmount = lendingDeposit + mortgageDebt;

  // 상증법 §60~§66 평가 미리보기 (useMemo — store 미러링 금지)
  const valuationPreview = useMemo(() => {
    const annualRent = parseAmount(asset.bgAnnualRentTotal) || 0;
    const mortgageSet = asset.bgMortgageSetAmount
      ? (parseAmount(asset.bgMortgageSetAmount) || mortgageDebt)
      : mortgageDebt;
    const rental = lendingDeposit + (annualRent > 0 ? Math.floor(annualRent / 0.12) : 0);
    const mortgage = lendingDeposit + mortgageSet;
    return { rental, mortgage };
  }, [asset.bgAnnualRentTotal, asset.bgMortgageSetAmount, lendingDeposit, mortgageDebt]);

  const isMarketMode = asset.bgValuationMode === "sangjeungbeop_market";
  const fmt = (n: number) => n.toLocaleString("ko-KR");

  return (
    <div className="rounded-lg border border-fuchsia-200 bg-fuchsia-50/40 p-3 space-y-3">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-fuchsia-900">
          부담부증여 (소득세법 시행령 §159)
        </p>
        <p className="text-xs text-fuchsia-700">
          납세의무자: <b>증여자</b> · 양도가액 = 인수 채무액 · 보유기간 = 증여자 당초 취득일~증여일
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <LawArticleModal legalBasis="소득세법 시행령 §159" label="시행령 §159" />
        </div>
      </div>

      {/* ① 평가 모드 라디오 */}
      <FieldCard
        label="양도(증여) 평가 유형"
        hint="상증법 §60~§66. 사례 34는 기준시가 모드."
        trailing={
          <div className="flex flex-wrap items-center gap-1.5">
            <LawArticleModal legalBasis="상속세및증여세법 §60" label="상증법 §60" />
            <LawArticleModal legalBasis="상속세및증여세법 §62" label="상증법 §62" />
            <LawArticleModal legalBasis="상속세및증여세법 §66" label="상증법 §66" />
          </div>
        }
      >
        <RadioCardGroup
          name="bgValuationMode"
          layout="stack"
          value={asset.bgValuationMode || ""}
          onChange={(v) => onChange({ bgValuationMode: v as AssetForm["bgValuationMode"] })}
          options={VALUATION_MODE_OPTIONS.map((o) => ({
            value: o.value,
            label: o.label,
            description: o.description,
          }))}
        />
      </FieldCard>

      {/* ② 인수 채무 입력 (3분리: 보증금·차입금·임대료) */}
      <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3 space-y-2">
        <p className="text-xs font-semibold text-rose-800">인수 채무 + 임대 평가 보조</p>
        <FieldCard
          label="임대보증금 총액"
          hint="채무로 인수 + 임대평가 환산에도 사용 (상증령 §50⑦)"
          trailing={<LawArticleModal legalBasis="상속세및증여세법 시행령 §50 ⑦" label="상증령 §50⑦" />}
        >
          <CurrencyInput label=""
            hideUnit
            value={asset.bgLendingDepositTotal}
            onChange={(v) => onChange({ bgLendingDepositTotal: v })}
          />
        </FieldCard>
        <FieldCard
          label="담보차입금 (실제 채무잔액)"
          hint="채무로 인수 — 담보평가 산정에도 사용"
        >
          <CurrencyInput label=""
            hideUnit
            value={asset.bgMortgageDebtAmount}
            onChange={(v) => onChange({ bgMortgageDebtAmount: v })}
          />
        </FieldCard>
        <FieldCard
          label="연간 임대료 (선택)"
          hint="임대평가 환산용 — 채무 아님. 환산식: 보증금 + 임대료/12%"
        >
          <CurrencyInput label=""
            hideUnit
            value={asset.bgAnnualRentTotal}
            onChange={(v) => onChange({ bgAnnualRentTotal: v })}
          />
        </FieldCard>
        <FieldCard
          label="(근)저당권 설정액 (선택)"
          hint="미입력 시 담보차입금 = 설정액 가정. 실제 잔액과 다를 때만 입력"
        >
          <CurrencyInput label=""
            hideUnit
            value={asset.bgMortgageSetAmount}
            onChange={(v) => onChange({ bgMortgageSetAmount: v })}
          />
        </FieldCard>
      </div>

      {/* ③ 시가 모드 — 양도시 시가 + 취득가액 산정방식 (K-4 실지 / K-5 환산) */}
      {isMarketMode && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-3">
          <p className="text-xs font-semibold text-amber-800">시가 모드 — 상증법 §60②~④</p>
          <FieldCard label="양도시 시가 평가액 (총액)">
            <CurrencyInput label=""
              hideUnit
              value={asset.bgMarketValueAtTransfer}
              onChange={(v) => onChange({ bgMarketValueAtTransfer: v })}
            />
          </FieldCard>

          {/* 취득가액 산정방식 (§100① 일치 원칙) */}
          <FieldCard
            label="취득가액 산정방식"
            hint="§100①: 양도가액을 시가(실지거래가액)로 산정한 경우 취득가액도 실지거래가액 또는 환산취득가액으로 산정."
            trailing={
              <div className="flex flex-wrap items-center gap-1.5">
                <LawArticleModal legalBasis="소득세법 §100" label="§100①" />
                <LawArticleModal legalBasis="소득세법 §97" label="§97①1호" />
                <LawArticleModal legalBasis="소득세법 시행령 §176의2" label="시행령 §176의2" />
              </div>
            }
          >
            <RadioCardGroup
              name="bgAcquisitionMethod"
              layout="stack"
              value={asset.bgAcquisitionMethod || ""}
              onChange={(v) => onChange({ bgAcquisitionMethod: v as AssetForm["bgAcquisitionMethod"] })}
              options={ACQUISITION_METHOD_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
                description: o.description,
              }))}
            />
          </FieldCard>

          {/* K-4: 실지취득가액 입력 (assetKind별) */}
          {asset.bgAcquisitionMethod === "actual" && (
            <div className="rounded-lg border border-amber-300 bg-amber-100/60 p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold text-amber-800">실지취득가액 입력</span>
                <LawArticleModal legalBasis="소득세법 §97" label="§97①1호가목" />
              </div>
              <div className="rounded border border-violet-200 bg-violet-50 p-2 text-caption text-violet-800">
                개산공제(§163⑥ 3%) 미적용 — 실지거래가액 경로이므로 자본적지출·양도비를 필요경비로 공제합니다 (양도분 채무비율 안분).
              </div>
              {asset.assetKind === "general_building" ? (
                <>
                  <FieldCard label="토지 실지취득가액">
                    <CurrencyInput label="" hideUnit
                      value={asset.bgActualAcquisitionLand}
                      onChange={(v) => onChange({ bgActualAcquisitionLand: v })} />
                  </FieldCard>
                  <FieldCard label="건물 실지취득가액">
                    <CurrencyInput label="" hideUnit
                      value={asset.bgActualAcquisitionBuilding}
                      onChange={(v) => onChange({ bgActualAcquisitionBuilding: v })} />
                  </FieldCard>
                </>
              ) : asset.assetKind === "land" ? (
                <FieldCard label="토지 실지취득가액">
                  <CurrencyInput label="" hideUnit
                    value={asset.bgActualAcquisitionLand}
                    onChange={(v) => onChange({ bgActualAcquisitionLand: v })} />
                </FieldCard>
              ) : (
                <FieldCard label="실지취득가액 (주택·건물 전체)"
                  hint="증여자의 취득 당시 실지거래가액">
                  <CurrencyInput label="" hideUnit
                    value={asset.bgActualAcquisitionTotal}
                    onChange={(v) => onChange({ bgActualAcquisitionTotal: v })} />
                </FieldCard>
              )}
              <FieldCard label="자본적지출 (선택)"
                hint="소령 §163③ — 양도분(채무비율)에 대응하는 부분만 안분 공제">
                <CurrencyInput label="" hideUnit
                  value={asset.capitalExpenditure}
                  onChange={(v) => onChange({ capitalExpenditure: v })} />
              </FieldCard>
              <FieldCard label="양도비 (선택)"
                hint="소령 §163⑤ — 양도분(채무비율)에 대응하는 부분만 안분 공제">
                <CurrencyInput label="" hideUnit
                  value={asset.transferExpense}
                  onChange={(v) => onChange({ transferExpense: v })} />
              </FieldCard>
            </div>
          )}

          {/* K-5: 환산취득가액 안내 (별도 입력 없음 — 취득시 기준시가 재사용) */}
          {asset.bgAcquisitionMethod === "converted" && (
            <div className="rounded border border-amber-300 bg-amber-100/60 p-2 text-caption text-amber-800">
              환산취득가액 = 양도가액(채무액) × 취득시 기준시가 ÷ 양도시 기준시가 (시행령 §176의2②2호).
              {asset.assetKind === "general_building"
                ? " 아래 일반건물 취득 정보의 취득시 토지·건물 기준시가를 입력하세요."
                : " 취득시·양도시 기준시가를 입력하세요."}
              {" "}개산공제(§163⑥ 3%) 자동 적용.
            </div>
          )}
        </div>
      )}

      {/* ④ 증여재산 평가용 건물 기준시가 (상증법 §61 — 층별 가감율 적용) */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200 text-micro font-bold text-emerald-800 select-none">
            §61
          </span>
          <p className="text-xs font-semibold text-emerald-800">
            증여재산 평가 — 양도시 건물 기준시가 (층별 가감율 적용)
          </p>
          <LawArticleModal legalBasis="상속세및증여세법 §61" label="상증법 §61" />
        </div>
        <FieldCard
          label="건물기준시가(상속 증여시)"
          hint="국세청 홈택스 → 건물기준시가(상속 증여시). 미입력 시 양도세용 양도시 건물기준시가 값을 그대로 사용."
        >
          <CurrencyInput
            label=""
            hideUnit
            value={asset.bgGiftBuildingStdPriceAtTransfer}
            onChange={(v) => onChange({ bgGiftBuildingStdPriceAtTransfer: v })}
          />
        </FieldCard>
      </div>

      {/* ⑤ Phase 3 — 증여세 통합 입력 (수증자 정보) */}
      <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-micro font-bold text-violet-800 select-none">
            §53
          </span>
          <p className="text-xs font-semibold text-violet-800">
            증여세 통합 입력 (수증자 정보 — 상증법 §53·§56·§57·§69)
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <LawArticleModal legalBasis="상속세및증여세법 §53" label="상증법 §53" />
            <LawArticleModal legalBasis="상속세및증여세법 §56" label="상증법 §56" />
            <LawArticleModal legalBasis="상속세및증여세법 §57" label="상증법 §57" />
            <LawArticleModal legalBasis="상속세및증여세법 §69" label="상증법 §69" />
          </div>
        </div>
        <p className="text-caption text-violet-700">
          무상이전분(증여가액 C − 채무액 B)에 대한 증여세 동시 산출. 수증자가 별도 신고·납부.
        </p>
        <FieldCard
          label="증여자-수증자 관계"
          hint="상증법 §53 증여재산공제 차등 적용. 미선택 시 직계비속(성년) 기본값."
        >
          <RadioCardGroup
            name="bgDonorRelation"
            layout="stack"
            value={asset.bgDonorRelation || ""}
            onChange={(v) =>
              onChange({ bgDonorRelation: v as AssetForm["bgDonorRelation"] })
            }
            options={DONOR_RELATION_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
              description: o.description,
            }))}
          />
        </FieldCard>
        <div className="space-y-2">
          {/* 세대생략 증여 — ON 시 미성년 토글 펼침 (children은 checked일 때만 렌더) */}
          <ToggleCard
            variant="card"
            size="sm"
            tone="violet"
            title="세대생략 증여"
            description="§57 — 30% 또는 미성년 20억 초과 40% 할증"
            checked={asset.bgIsGenerationSkip}
            onCheckedChange={(v) => onChange({ bgIsGenerationSkip: v })}
          >
            <ToggleCard
              variant="card"
              size="sm"
              tone="violet"
              title="수증자 미성년"
              description="세대생략 증여재산가액 20억 초과 시 40% 할증"
              checked={asset.bgIsMinorDonee}
              onCheckedChange={(v) => onChange({ bgIsMinorDonee: v })}
            />
          </ToggleCard>
          <ToggleCard
            variant="card"
            size="sm"
            tone="emerald"
            title="법정신고기한 내 신고"
            description="§69 신고세액공제 3%"
            checked={asset.bgIsFiledOnTime}
            onCheckedChange={(v) => onChange({ bgIsFiledOnTime: v })}
          />
        </div>
      </div>

      {/* ⑤ Phase 3 후속 — 10년 이내 사전증여 (상증법 §47② 합산) */}
      <BurdenedGiftPriorGiftsBlock asset={asset} onChange={onChange} />

      {/* ⑥ 양도가액 = 채무액 미리보기 (소령 §159, disabled) */}
      <div className="rounded-lg border border-fuchsia-300 bg-fuchsia-100/70 p-3 space-y-1">
        <p className="text-xs font-semibold text-fuchsia-900">자동 계산 미리보기</p>
        <div className="text-xs text-fuchsia-800 space-y-0.5">
          <p>
            인수 채무액 (= 양도가액):{" "}
            <span className="font-mono font-semibold">{fmt(assumedDebtAmount)}원</span>
          </p>
          <p>
            담보평가:{" "}
            <span className="font-mono">{fmt(valuationPreview.mortgage)}원</span>
          </p>
          <p>
            임대평가:{" "}
            <span className="font-mono">{fmt(valuationPreview.rental)}원</span>
          </p>
          <p className="text-fuchsia-600 mt-1">
            * Max(보충적·담보·임대)를 분모로 양도가/취득가 자산별 안분 — 엔진이 자동 산정.
          </p>
        </div>
      </div>
    </div>
  );
}
