"use client";

/**
 * 의제취득일(1985.1.1.) 이전 상속 취득가액 입력 (case A)
 *
 * 산식: **3자 max** — max(① 상증법 §60~66 평가액, ② §164④~⑦ 취득당시 기준시가, ③ 환산취득가)
 *       (`inheritance-acquisition-price.ts` `calcPreDeemed`).
 * 근거: 시행령 §163⑨ 본문·1호·2호(①②) · §163⑫ → §176조의2④(③) · 상속증여세과-223(「가장 큰 가액」)
 *
 * ⚠️ 종전 주석은 「max(환산취득가, 피상속인 실가 × **물가상승률**)」이었다 — 물가상승률(CPI) 분기는
 *    법령 근거가 없어 제거됐고(#1080 계열), 3자 max는 #1089에서 가목 우선으로 재편됐다가
 *    2026-10-22 다시 3자 max로 돌아왔다(계획서 inheritance-pre-deemed-clause-b-revisit.plan.md).
 *
 * UI 순서 = 엔진 계산 로직 순서:
 * ① 의제취득일 시점 기준시가 (토지: pre1990 환산 자동 계산 포함) → ② 양도시 기준시가 → ③ 상증법 평가액
 */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { Pre1990LandValuationInput } from "@/components/calc/inputs/Pre1990LandValuationInput";
import { HouseValuationSection } from "./HouseValuationSection";
import { PreDeemedConversionFields } from "./PreDeemedConversionFields";
import { InheritanceHouseKindPicker } from "./InheritanceHouseKindPicker";
import { ApartNtsPriceQuestion } from "./ApartNtsPriceQuestion";
import { apartNtsQuestionRelevant, apartSec164FormOpen, isApartSec163_9Asset } from "@/lib/calc/apart-nts-price";
import { inheritanceReportedValuePartSuffix } from "@/lib/calc/inheritance-reported-value-scope";
import { isRedev166_3PreDeemedAsset } from "@/lib/calc/transfer-tax-validate-clause-a";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 개별주택가격 최초 공시일 */
const HOUSE_FIRST_DISCLOSURE_DATE = "2005-04-30";

import { LAW_BADGE_CLASS } from "@/components/calc/shared/lawBadge";
import { Frac } from "@/components/calc/results/shared/FormulaParts";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /** 양도일 — 1990 토지 환산 계산에 필요 */
  transferDate?: string;
}

export function PreDeemedInputs({ asset, onChange, transferDate }: Props) {
  const isLand = asset.assetKind === "land";
  // 토지/주택 판정은 상단 assetKind로 파생(상속 자산구분 라디오 폐지 대응).
  const isHouse = asset.assetKind === "housing" || asset.assetKind === "redevelopment_apt";
  // 재개발·재건축 종전자산(승계조합원 제외) — ③은 §176조의2④가 아니라 §166③이고 아래 재개발 입력 ⑤ 「환산취득가액」의 칸으로 계산한다
  // (엔진 `resolvePreDeemedRedevelopment166_3Price` — 계획서 inheritance-pre-deemed-clause-b-revisit.plan.md §12). 여기 기준시가 2칸은 쓰이지 않는다.
  const isRedev = isRedev166_3PreDeemedAsset(asset);
  // 일반건물은 이 칸이 토지분이다(건물분 전용 칸이 따로 있다) — 판정·문구는 공용 단일 소스.
  const partSuffix = inheritanceReportedValuePartSuffix(asset.assetKind);

  // 주택 자산 + 상속개시일 < 2005-04-30: 개별주택가격 미공시 → 3-시점 보조 입력
  const inheritanceDate = asset.inheritanceStartDate || asset.acquisitionDate || "";
  // 공동주택은 「상속개시일 당시 국세청 고시 가액」 질문이 정한다 — 「없었음」일 때만 3-시점 환산(②)과 그 값의 ③ 자동 주입이 열린다
  // (있었음이면 의제취득일 기준시가는 아래 칸에 직접 입력 — 계획서 Q-3, 엔진 `inheritance-acquisition-helpers.ts`와 같은 게이트).
  const isApart = isApartSec163_9Asset(asset);
  const showHouseBlock = isApart
    ? apartNtsQuestionRelevant(asset)
    : isHouse && !!inheritanceDate && inheritanceDate < HOUSE_FIRST_DISCLOSURE_DATE;
  const showHouseValuation = isApart ? apartSec164FormOpen(asset) : showHouseBlock;

  // 토지인 경우 의제취득일(1985.1.1.) 자체가 1990.8.30. 이전이므로 항상 환산 대상
  const showPre1990 = isLand;

  return (
    <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20 py-3 px-2 sm:px-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
          의제취득일 이전 상속·증여 — ① 상증법 평가액·② 취득당시 기준시가·③ 환산취득가액 중 많은 금액
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <LawArticleModal
            legalBasis="소득세법 시행령 §163 ⑨"
            label="소령 §163 ⑨"
            className={LAW_BADGE_CLASS}
          />
          {isRedev ? (
            <LawArticleModal legalBasis="소득세법 시행령 §166" label="소령 §166 ③" className={LAW_BADGE_CLASS} />
          ) : (
            <LawArticleModal
              legalBasis="소득세법시행령 §176조의2"
              label="소령 §176조의2 ④"
              className={LAW_BADGE_CLASS}
            />
          )}
        </div>
      </div>

      {/* 주택 자산 + 상속개시일 < 2005-04-30: 개별주택가격 미공시 3-시점 보조 입력 */}
      {showHouseBlock && (
        <>
          <InheritanceHouseKindPicker asset={asset} onChange={onChange} />
          {isApart && <ApartNtsPriceQuestion asset={asset} onChange={onChange} baseDateLabel="상속개시일" />}
        </>
      )}
      {showHouseValuation && (
        <>
          <HouseValuationSection
            asset={asset}
            onChange={onChange}
            transferDate={transferDate}
          />
        </>
      )}

      {/* ③ 분자·분모 — 상속·증여 공용(`PreDeemedConversionFields`). 토지 등급 환산은 두 칸 사이에 둔다. */}
      <PreDeemedConversionFields
        asset={asset}
        onChange={onChange}
        transferDate={transferDate}
        baseDate={inheritanceDate}
        showHouseValuation={showHouseValuation}
        hideFields={isRedev}
        between={
          showPre1990 && (
          <Pre1990LandValuationInput
            form={{
              pre1990Enabled: asset.pre1990Enabled,
              pre1990PricePerSqm_1990: asset.pre1990PricePerSqm_1990,
              pre1990PricePerSqm_atTransfer: asset.pre1990PricePerSqm_atTransfer,
              pre1990Grade_current: asset.pre1990Grade_current,
              pre1990Grade_prev: asset.pre1990Grade_prev,
              pre1990Grade_atAcq: asset.pre1990Grade_atAcq,
              pre1990GradeMode: asset.pre1990GradeMode,
            }}
            onChange={(patch) => onChange(patch)}
            acquisitionArea={asset.acquisitionArea || undefined}
            jibun={asset.addressJibun || undefined}
            acquisitionDate={asset.acquisitionDate || undefined}
            transferDate={transferDate}
            /**
             * 🔴 **override가 켜져 있으면 덮지 않는다** (2026-09-07 대장 재대조).
             *
             * 종전에는 `useStandardPriceAtAcqOverride`와 무관하게 자동 환산값을 store에 썼다.
             * 사용자가 「직접 입력」 토글을 켜고 값을 넣어도, 등급·연도 입력을 조금만 건드리면
             * 그 값이 자동값으로 되덮였다 — 직접 입력이라는 선언 자체가 무의미해진다.
             * 표시 분기(`PreDeemedConversionFields`의 `stdPriceAtAcqAutoActive`)는 이미 같은 플래그를 본다.
             */
            onCalculatedPrice={(price) => {
              if (asset.useStandardPriceAtAcqOverride) return;
              onChange({ standardPriceAtAcq: String(price) });
            }}
          />
          )
        }
      />

      {/* ① 상증법 §60~66 평가액 (상속세 신고가액) — ②·③과 함께 3자 max(엔진 `calcPreDeemed`) */}
      <FieldCard
        label={`상속세 신고가액 (상증법 평가액)${partSuffix.label}`}
        // §163⑨ 본문 괄호가 소스 서열을 **강행**으로 정한다 — 결정·경정액이 있으면 그 가액이다(U2-F).
        hint={`상속세 신고서상 평가액. 세무서장등이 결정·경정한 가액이 있으면 그 가액을 입력하세요(§163⑨ 본문). 1984.12.31. 이전 취득분은 「소득세법」 부칙(법률 제4803호) §8상 취득시기가 1985.1.1.로 의제되므로 원칙은 그날 현재 평가액이며, 상속세 신고가액(상속개시일 기준)을 입력하는 경우 아래 §164④~⑦ 기준시가·환산취득가액과 비교해 셋 중 큰 금액이 적용됩니다.${partSuffix.hint}`}
        trailing={
          <LawArticleModal
            legalBasis="상속세및증여세법 §60"
            label="상증법 §60~66"
            className={LAW_BADGE_CLASS}
          />
        }
      >
        <CurrencyInput
          label=""
          hideUnit
          data-field="publishedValueAtInheritance"
          value={asset.publishedValueAtInheritance}
          onChange={(v) => onChange({ publishedValueAtInheritance: v })}
          placeholder="신고가액 입력 (원)"
        />
      </FieldCard>

      {isRedev ? (
        <p className="text-caption text-muted-foreground" data-testid="pre-deemed-redev-166-3-note">
          취득가액 = <b>① 상속세 신고가액</b>, <b>② 취득당시 기준시가(§164④~⑦)</b>, <b>③ §166③ 환산취득가액</b> 중
          많은 금액입니다. 재개발·재건축 종전자산의 ③은 아래 재개발 입력 ⑤ 「인가전 분 종전 부동산 취득가액」에서
          「환산취득가액」을 고르고 §166③ 칸을 채우면 계산됩니다(소득세법 시행령 §166③). 「실지거래가액」을 고르면 ③ 없이 ①·② 중 큰 금액입니다.
        </p>
      ) : (
        <p className="text-caption text-muted-foreground">
          취득가액 = <b>① 상속세 신고가액</b>, <b>② 취득당시 기준시가(§164④~⑦)</b>, <b>③ 환산취득가</b> 중
          많은 금액입니다. 환산취득가 = 양도가액 × <Frac top="의제취득일 기준시가" bottom="양도시 기준시가" />
        </p>
      )}
    </div>
  );
}
