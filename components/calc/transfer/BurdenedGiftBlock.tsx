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
import { redevPreApprovalAcqMode } from "@/lib/calc/redev-pre-approval-acq-mode";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { stdPriceAddressOf } from "@/components/calc/transfer/asset-std-price-address";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { BurdenedGiftRightValuationSection } from "./BurdenedGiftRightValuationSection";
import { BurdenedGiftPriorGiftsBlock } from "./BurdenedGiftPriorGiftsBlock";
import { BurdenedGiftCarryoverBlock } from "./BurdenedGiftCarryoverBlock";
import { BurdenedGiftDonorTaxBlock } from "./BurdenedGiftDonorTaxBlock";
import { VALUATION_MODE_OPTIONS } from "./burdened-gift-block-options";
import { GIFT_STD_PRICE_FIELD } from "./burdened-gift-block-options";
import { getOwnershipRatio } from "@/lib/calc/transfer-tax-api-helpers";
import { formatOwnershipPercent } from "@/lib/calc/transfer-tax-api-helpers";
import { BuildingStdPriceModalButton } from "@/components/calc/building-std-price/BuildingStdPriceModalButton";
import { bgGiftStdPriceLauncherSpec } from "@/lib/calc/burdened-gift-std-price-launcher";
import { Frac } from "@/components/calc/results/shared/FormulaParts";
import { applyRatio } from "@/lib/tax-engine/tax-utils";
import { isBgPresumedMethod } from "@/lib/calc/burdened-gift-presumed-acquisition";
import {
  BurdenedGiftAcquisitionMethodField,
  BurdenedGiftPresumedAcquisitionSection,
} from "./BurdenedGiftPresumedAcquisitionSection";
import { isMixedBurdenedGift } from "@/lib/calc/burdened-gift-mixed-use-scope";
import { BurdenedGiftDebtAttributionCard } from "./BurdenedGiftDebtAttributionCard";
import { BurdenedGiftHousingAppraisalField, BurdenedGiftMixedUsePanel } from "./BurdenedGiftMixedUsePanel";
import { bgCollateralForcesStdAcq } from "@/lib/calc/burdened-gift-collateral-win";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { computeMortgageValuation } from "@/lib/tax-engine/burdened-gift-valuation";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /**
   * 폼-전역 양도일 = **증여일**(YYYY-MM-DD). ④ 상속·증여 계산기의 평가 기준일로 넘긴다 —
   * 모달이 `eventDate`로 받아 상증 평가연도를 도출한다(`BuildingStdPriceForm.tsx:124-127`).
   */
  transferDate?: string;
  /**
   * 지분 분할 모드(축 B) 여부 — **채무 입력 규약이 축에 따라 반대**다.
   *
   * - 축 A(공유 소유·단건): 공유자마다 **별개 증여계약**이라 인수채무는 **사실**이다
   *   ⇒ 사용자가 **지분 인수분**을 입력하고 엔진은 스케일하지 않는다.
   * - 축 B(지분 분할 취득): 갑 한 사람의 **하나의 계약**이라 tranche는 계산 단위일 뿐이다
   *   ⇒ **물건 전체**를 입력하고 ④가 §159의 B/C 보존을 위해 지분 안분한다.
   *
   * 자산 하나만 보면 두 축이 구별되지 않는다(둘 다 `ownershipRatio < 1`).
   * 이 prop이 없으면 축 B에서 「(지분 인수분)」이라는 **정반대 안내**가 뜬다.
   */
  isFractionalSplit?: boolean;
  /**
   * 컴패니언(다른 물건) 함께 부담부증여 여부 — **채무 입력 규약이 제3의 것**이다.
   *
   * - 축 A(공유지분): 그 지분의 **인수분**을 입력.
   * - 축 B(지분 분할): **물건 전체**를 입력하고 ④가 지분 안분.
   * - **컴패니언(이 축)**: **각 물건에 붙은 채무**를 입력. 상증법 §66(담보)·§61⑤(임대) 평가가
   *   재산별이라 자산별 채무가 평가액 Aᵢ 산정에 필요하다. 소령 §159①의 B/C는 증여계약
   *   단위이므로 ④가 총채무를 자산가액 비율로 **재배분**한다(§159②와 같은 안분식).
   *
   * 침묵하면 사용자가 총액을 각 카드에 넣어 **자산 수만큼 곱해진다**(실측 2배).
   */
  isCompanionBundle?: boolean;
}


export function BurdenedGiftBlock({ asset, onChange, transferDate, isFractionalSplit, isCompanionBundle }: Props) {
  /**
   * ④ 상속·증여 계산기 런처 사양 — null이면 미노출.
   * ⚠️ 주입 규칙(건물분 단독 vs 부수토지 합산)이 자산마다 반대다. 판단은 전부 이 함수에 있다.
   */
  const stdPriceLauncher = bgGiftStdPriceLauncherSpec(asset);
  // 건물 기준시가 모달 prefill — 자산 카드 소재지 재사용(이중입력 방지)
  const stdPriceAddress = stdPriceAddressOf(asset);
  // 인수 채무액 = 임대보증금 + 담보차입금 (소령 §159 — 양도가액)
  const lendingDeposit = parseAmount(asset.bgLendingDepositTotal) || 0;
  const mortgageDebt = parseAmount(asset.bgMortgageDebtAmount) || 0;
  const assumedDebtAmount = lendingDeposit + mortgageDebt;
  // 축 B 스케일 — ④(`buildBurdenedGiftInfo`)와 **같은 함수**로 같은 비율을 쓴다.
  const ownRatio = getOwnershipRatio(asset);

  // 공유지분 부담부증여 — 채무는 **해당 지분 인수분**을 입력받는다.
  // 엔진은 평가액(§159의 A·C)만 지분분으로 축소하고 채무는 입력값 그대로 쓴다
  // (물건 전체 채무를 ×지분율로 쪼개면 자동 안분 fallback 정책 위반).
  /**
   * 「지분 인수분 직접 입력」 규약이 적용되는 축인가 — **축 A 전용**이다.
   * 축 B(`isFractionalSplit`)에서는 물건 전체를 입력하므로 이 라벨을 쓰면 안 된다.
   */
  const isFractional = getOwnershipRatio(asset) < 1 && !isFractionalSplit;
  // 화면 위젯과 같은 백분율 표기 — 분자/분모는 화면에 없다(`formatOwnershipPercent` 주석).
  const shareLabel = formatOwnershipPercent(
    asset.ownershipNumerator,
    asset.ownershipDenominator,
  );

  // 상증법 §60~§66 평가 미리보기 (useMemo — store 미러링 금지)
  const valuationPreview = useMemo(() => {
    const annualRent = parseAmount(asset.bgAnnualRentTotal) || 0;
    const rental = lendingDeposit + (annualRent > 0 ? Math.floor(annualRent / 0.12) : 0);
    // 담보평가 = 임대보증금 + min(채권최고액, 담보채무) — 엔진 함수 그대로(상증령 §63②). ④와 같은 값(채권최고액 미입력 = undefined)을 넣는다.
    // 종전에는 채권최고액을 그대로 더해 엔진(#1124 이후 min)과 갈렸다(실측 720,000,000 ↔ 600,000,000 — O-5).
    const mortgage = computeMortgageValuation({
      lendingDepositTotal: lendingDeposit,
      mortgageDebtAmount: mortgageDebt,
      mortgageSetAmount: asset.bgMortgageSetAmount ? parseAmount(asset.bgMortgageSetAmount) : undefined,
    } as BurdenedGiftInfo);
    return { rental, mortgage };
  }, [asset.bgAnnualRentTotal, asset.bgMortgageSetAmount, lendingDeposit, mortgageDebt]);

  const isMarketMode = asset.bgValuationMode === "sangjeungbeop_market";
  /**
   * 시가 모드 · 담보 승(「상속세 및 증여세법」 제66조) — 취득가액이 산정방식과 무관하게 취득시 기준시가 × 채무비율이다(§159①1호 괄호).
   * 방식별 금액 칸(K-4 박스·K-6/K-7·K-5 안내)을 숨기고 한 줄로 알린다. ②의 취득시 기준시가 칸·⑧은 같은 leaf로 연다(O-5).
   */
  const collateralForced = bgCollateralForcesStdAcq(asset);
  /**
   * 겸용주택 × 부담부증여 — 4부분 기준시가의 정본은 ③ 겸용 패널이다. 이 블록은 요약(읽기 전용)과 채무 귀속·구분 감정평가 선언만 받는다
   * (엔진이 읽지 않는 ④ 「증여일 주택 기준시가」·② 총액 칸은 숨긴다 — 설계 UI R2 §4).
   */
  const isMixed = isMixedBurdenedGift(asset);
  /**
   * 조합원입주권 — 증여재산 평가가 상증법 §61③이라 §159①1호 A괄호가 **발동하지 않는다**.
   * ⇒ 취득가액이 실지거래가액(K-4)으로 고정되고, 취득시·양도시 기준시가 칸을 쓰지 않는다.
   */
  const isRightToMoveIn = asset.assetKind === "right_to_move_in";
  /**
   * 이월과세(「소득세법」 §97의2) 조합인가 — **화면의 「증여자」가 두 사람이 되는 순간**이다.
   *
   * · **양도인**      = 부담부증여를 하는 사람(기존 입력 전부가 이 사람 기준)
   * · **당초 증여자** = 그 양도인에게 이 자산을 증여한 사람(§97의2가 취득가액·보유기간을 여기로 옮긴다)
   *
   * 그래서 이 플래그가 켜지면 라벨을 「양도인」으로 못박고 「당초 증여자」 입력 한 벌을 연다.
   * (계획서 `burdened-gift-carryover-159-97-2.plan.md` §5.6)
   */
  const isCarryover = asset.acquisitionCause === "carryover_gift";
  /** K-1~K-3(기준시가) · K-5(환산) 모두 **취득시 기준시가**를 쓴다 — 환산은 이 값을 분자로 자동 추종. */
  const coDonorNeedsStdPrice =
    asset.bgValuationMode === "sangjeungbeop_standard" ||
    asset.bgAcquisitionMethod === "converted" ||
    // K-6/K-7 — 필요경비가 개산공제라 당초 증여자 취득 당시 기준시가가 base다
    isBgPresumedMethod(asset.bgAcquisitionMethod);
  /** 이월과세 × K-6/K-7 — 당초 증여자 값은 이월과세 박스, 양도인 값은 실지취득가액 블록(증여일 상증법 평가액)에서 받는다. */
  const isCarryoverPresumed = isCarryover && isBgPresumedMethod(asset.bgAcquisitionMethod);
  const fmt = (n: number) => n.toLocaleString("ko-KR");

  return (
    <div className="rounded-lg border border-fuchsia-200 bg-fuchsia-50/40 p-3 space-y-3 dark:bg-fuchsia-950/40">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-fuchsia-900 dark:text-fuchsia-200">
          부담부증여 (소득세법 시행령 §159)
        </p>
        <p className="text-xs text-fuchsia-700 dark:text-fuchsia-300">
          납세의무자: <b>양도인</b>(증여하는 사람) · 양도가액 = 인수 채무액 ·{" "}
          {isCarryover ? (
            <>
              보유기간 = <b>당초 증여자</b>의 취득일~증여일 (이월과세 §95④ 단서)
            </>
          ) : (
            <>보유기간 = 양도인의 취득일~증여일</>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <LawArticleModal legalBasis="소득세법 시행령 §159" label="시행령 §159" />
        </div>
      </div>

      {/* ① 평가 모드 라디오 */}
      <FieldCard
        stacked
        label="양도(증여) 평가 유형"
        badge={
          <span className="grid grid-cols-3 gap-1.5">
            <LawArticleModal legalBasis="상속세및증여세법 §60" label="상증법 §60" />
            <LawArticleModal legalBasis="상속세및증여세법 §62" label="상증법 §62" />
            <LawArticleModal legalBasis="상속세및증여세법 §66" label="상증법 §66" />
          </span>
        }
      >
        <RadioCardGroup
          name={`bgValuationMode-${asset.assetId ?? "primary"}`} data-field="bgValuationMode"
          layout="stack"
          columns={2}
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
      <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3 space-y-2 dark:bg-rose-950/40">
        <p className="text-xs font-semibold text-rose-800 dark:text-rose-200">인수 채무 + 임대 평가 보조</p>
        {isFractional && (
          <p className="text-caption text-rose-700 dark:text-rose-300">
            공유지분({shareLabel}) 부담부증여 — 아래 채무·보증금·임대료는 <b>이 지분에 대응하는
            인수분</b>을 입력하세요. 기준시가·시가 등 <b>평가액은 물건 전체로 입력</b>하면
            엔진이 지분분으로 환산합니다(소령 §159 — 평가액 A·C만 지분분, 채무 B는 실제 인수액).
          </p>
        )}
        {/* 컴패니언 — 축 A·축 B와 또 다른 제3의 규약. 상세는 `isCompanionBundle` 주석. */}
        {isCompanionBundle && (
          <p className="text-caption text-rose-700 dark:text-rose-300">
            여러 물건 함께 부담부증여 — 아래 채무·보증금·임대료는 <b>이 물건에 설정된 금액</b>을
            입력하세요. 채무가 없는 물건은 비워 둡니다. 하나의 증여계약이므로 시스템이 채무
            합계를 <b>자산별 평가액 비율로 재배분</b>합니다(소령 §159 — 채무비율 B/C는 증여계약
            단위이고, §159②가 같은 안분식을 정하고 있습니다).
          </p>
        )}
        {/* 축 B — 축 A와 **반대** 규약이라 침묵하면 사용자가 지분분을 넣어 세액이 조용히 틀린다. */}
        {isFractionalSplit && (
          <p className="text-caption text-rose-700 dark:text-rose-300">
            지분 분할 취득 — 채무·보증금·임대료를 <b>물건 전체(100%) 기준</b>으로 입력하세요.
            하나의 증여계약이므로 시스템이 지분별로 안분합니다(소령 §159 — 채무비율 B/C는
            물건 단위로 하나입니다).
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <FieldCard
            stacked
            label={isFractional ? "임대보증금 (지분 인수분)" : "임대보증금 총액"}
            trailing={<LawArticleModal legalBasis="상속세및증여세법 시행령 §50 ⑦" label="상증령 §50⑦" />}
          >
            <CurrencyInput label=""
              hideUnit
              value={asset.bgLendingDepositTotal} data-field="bgLendingDepositTotal"
              onChange={(v) => onChange({ bgLendingDepositTotal: v })}
            />
          </FieldCard>
          <FieldCard
            stacked
            label={isFractional ? "담보차입금 (지분 인수분)" : "담보차입금 (실제 채무잔액)"}
          >
            <CurrencyInput label=""
              hideUnit
              value={asset.bgMortgageDebtAmount} data-field="bgMortgageDebtAmount"
              onChange={(v) => onChange({ bgMortgageDebtAmount: v })}
            />
          </FieldCard>
          <FieldCard stacked label="연간 임대료 (선택)">
            <CurrencyInput label=""
              hideUnit
              value={asset.bgAnnualRentTotal}
              onChange={(v) => onChange({ bgAnnualRentTotal: v })}
            />
          </FieldCard>
          <FieldCard stacked label="(근)저당권 설정액 (선택)">
            <CurrencyInput label=""
              hideUnit
              value={asset.bgMortgageSetAmount}
              onChange={(v) => onChange({ bgMortgageSetAmount: v })}
            />
          </FieldCard>
        </div>
        {/* 겸용주택 — 채무가 주택·상가 어디에 속하는지(부동산거래관리과-119). 총액은 위 두 칸이 정본이다. */}
        {isMixed && <BurdenedGiftDebtAttributionCard asset={asset} onChange={onChange} />}
      </div>

      {/* ③ 시가 모드 — 양도시 시가 + 취득가액 산정방식 (K-4 실지 / K-5 환산) */}
      {isMarketMode && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-3 dark:bg-amber-950/40">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">시가 모드 — 상증법 §60②~④</p>
          <FieldCard label="양도시 시가 평가액 (총액)">
            <CurrencyInput label=""
              hideUnit
              value={asset.bgMarketValueAtTransfer} data-field="bgMarketValueAtTransfer"
              onChange={(v) => onChange({ bgMarketValueAtTransfer: v })}
            />
          </FieldCard>

          {/* 겸용주택 — 구분 감정평가가액 유무 선언(G-13): 시가를 주택·상가로 나누는 법정 안분의 근거 */}
          {isMixed && <BurdenedGiftHousingAppraisalField asset={asset} onChange={onChange} />}

          {/* 취득가액 산정방식 (§100① 일치 원칙) — 4옵션 라디오는 분리 파일(800줄 한도) */}
          <BurdenedGiftAcquisitionMethodField
            asset={asset}
            onChange={onChange}
            transferDate={transferDate}
            fractionalSplit={isFractionalSplit}
          />

          {/* 담보 승 — 방식별 칸(K-6/K-7 · K-5 안내 · K-4 박스)은 쓰이지 않는다. 산정방식 선택은 ⑫가 요구해 남긴다(Q-2). */}
          {collateralForced && (
            <ToneCard tone="violet">
              <p className="text-xs text-violet-900 dark:text-violet-200" data-testid="bg-collateral-forced-notice">
                담보평가액 {fmt(valuationPreview.mortgage)}원이 시가 {fmt(parseAmount(asset.bgMarketValueAtTransfer) || 0)}원보다 커서 증여가액이 담보평가액입니다
                (「상속세 및 증여세법」 제66조). 취득가액은 위 산정방식과 관계없이 <b>취득시 기준시가 × 채무비율</b>로 산정하고(「소득세법 시행령」 제159조
                제1항 제1호 괄호), 필요경비는 개산공제입니다.{" "}
                {asset.assetKind === "general_building"
                  ? "취득시 기준시가는 아래 일반건물 취득 정보의 취득시 토지·건물 기준시가를 씁니다."
                  : "취득시 기준시가는 「② 양도정보」에 입력하세요."}
              </p>
            </ToneCard>
          )}

          {/* K-6/K-7: 매매사례가액·감정가액 입력 (§97①1호나목 · 시행령 §176의2③1·2호) */}
          {isBgPresumedMethod(asset.bgAcquisitionMethod) && !isCarryover && !collateralForced && (
            <BurdenedGiftPresumedAcquisitionSection
              asset={asset}
              onChange={onChange}
              method={asset.bgAcquisitionMethod}
              fractionalSplit={isFractionalSplit}
              transferDate={transferDate}
            />
          )}

          {/* K-5: 환산취득가액 안내 (별도 입력 없음 — 취득시 기준시가 재사용) */}
          {collateralForced ? null : asset.bgAcquisitionMethod === "converted" && redevPreApprovalAcqMode(asset) === "estimated" ? (
            // 재개발 완공 아파트 — 취득가액은 종전 부동산의 취득가액이라 §166③으로 환산한다(일반 환산식이 아니다).
            <div className="rounded border border-amber-300 bg-amber-100/60 p-2 text-caption text-amber-800 dark:text-amber-200 dark:bg-amber-900/40">
              종전 부동산 취득가액 = 평가액 × <Frac top="취득일 기준시가" bottom="관리처분계획 인가일 기준시가" /> (시행령 §166③) × 채무비율.
              아래 재개발·재건축 「⑤ 인가전 분 종전 부동산 취득가액」에서 기준시가를 입력하세요. 개산공제(§163⑥ 3%) 자동 적용.
            </div>
          ) : asset.bgAcquisitionMethod === "converted" && (
            <div className="rounded border border-amber-300 bg-amber-100/60 p-2 text-caption text-amber-800 dark:text-amber-200 dark:bg-amber-900/40">
              환산취득가액 = 양도가액(채무액) × <Frac top="취득시 기준시가" bottom="양도시 기준시가" /> (시행령 §176의2②2호).
              {asset.assetKind === "general_building"
                ? " 아래 일반건물 취득 정보의 취득시 토지·건물 기준시가를 입력하세요."
                : isMixed
                  ? " 겸용주택은 「③ 취득정보 > 겸용주택」의 양도시·취득시 기준시가(주택·상가 4부분)로 계산합니다."
                  : " 아래 「② 양도정보」에서 양도시·취득시 기준시가를 입력하세요."}
              {" "}개산공제(§163⑥ 3%) 자동 적용.
            </div>
          )}
        </div>
      )}

      {/*
        K-4 실지취득가액 — **두 경로가 여기로 온다**.

        ① 시가 모드(§60②) + 산정방식 「실지」  ② **조합원입주권**(자산 종류로 고정)

        ②는 §159①1호 A괄호의 열거(상증법 §61①·②·⑤ 및 §66)에 §61③이 **없어서** 괄호가
        발동하지 않기 때문이다 — 평가 모드(기준시가/시가)와 무관하게 취득가액이 실지거래가액이다.
        그래서 이 블록을 「시가 모드」 카드 **밖으로** 뺐다. 안에 두면 기준시가 모드를 고른
        입주권 사용자에게 칸이 뜨지 않아 ⑧이 요구하는 값을 넣을 곳이 없어진다.
      */}
      {((isMarketMode && !collateralForced && (asset.bgAcquisitionMethod === "actual" || isCarryoverPresumed)) || isRightToMoveIn) && (
          <div className="rounded-lg border border-amber-300 bg-amber-100/60 p-3 space-y-2 dark:bg-amber-900/40">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                {isCarryoverPresumed ? "양도인이 증여받은 때의 상증법 평가액 입력" : "실지취득가액 입력"}
              </span>
              <LawArticleModal legalBasis="소득세법 §97" label="§97①1호가목" />
            </div>
            {isCarryoverPresumed ? (
              <div className="rounded border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 p-2 text-caption text-violet-800 dark:text-violet-200" data-testid="bg-carryover-presumed-transferor-notice">
                이월과세를 적용하지 않는 경우(시나리오 B)의 <b>양도인</b> 취득가액입니다. 양도인은 이 자산을 증여받았으므로 증여일 현재 상증법 평가액이
                취득 당시 실지거래가액으로 간주됩니다(소득세법 시행령 §163⑨) — 매매사례가액·감정가액은 <b>당초 증여자</b> 값만 아래 이월과세 박스에 입력합니다.
              </div>
            ) : (
              <div className="rounded border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 p-2 text-caption text-violet-800 dark:text-violet-200" data-testid="bg-k4-expense-pointer">
                개산공제(§163⑥ 3%) 미적용 — 실지거래가액 경로이므로 자본적지출·양도비를 필요경비로 공제합니다 (양도분 채무비율 안분).
                금액은 아래 「④ 자본적 지출, 필요경비」에 입력하세요.
              </div>
            )}
            {isRightToMoveIn && (
              <div className="rounded border border-fuchsia-200 dark:border-fuchsia-800 bg-fuchsia-50 dark:bg-fuchsia-950/30 p-2 text-caption text-fuchsia-800 dark:text-fuchsia-200">
                조합원입주권의 취득가액은 <b>종전 부동산의 실지취득가액</b>입니다 (소득세법 시행령
                §166①1호 「기존건물과 그 부수토지의 취득가액」 · §97①1호가목). 인수 채무 비율만큼
                안분됩니다. 종전 부동산의 매매사례가액·감정가액은 취득가액으로 쓰지 않습니다 — 시행령 §166③은 취득가액을 확인할 수 없는 경우를
                기준시가 환산식으로 직접 정하고, §166④2호의 매매사례가액·감정가액은 취득가액이 아니라 「기존건물과 그 부수토지의 평가액」 산정에 쓰입니다.
              </div>
            )}
            {asset.assetKind === "general_building" ? (
              <>
                <FieldCard label="토지 실지취득가액">
                  <CurrencyInput label="" hideUnit
                    value={asset.bgActualAcquisitionLand} data-field="bgActualAcquisitionLand"
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
                  value={asset.bgActualAcquisitionLand} data-field="bgActualAcquisitionLand"
                  onChange={(v) => onChange({ bgActualAcquisitionLand: v })} />
              </FieldCard>
            ) : (
              <FieldCard
                label={isRightToMoveIn ? "종전 부동산 실지취득가액" : isMixed ? "실지취득가액 — 주택·상가 전체 (토지 포함)" : "실지취득가액 (주택·건물 전체)"}
              >
                <CurrencyInput label="" hideUnit
                  value={asset.bgActualAcquisitionTotal} data-field="bgActualAcquisitionTotal"
                  onChange={(v) => onChange({ bgActualAcquisitionTotal: v })} />
              </FieldCard>
            )}
            {/* 자본적지출·양도비는 ④ 한 곳에서만 받는다. 같은 상태를 이 박스도 받으면 ④의 「총 양도비」 비활성·지분·일부 양도 처리를
                건너뛰고, 여기 넣은 값이 총 양도비보다 우선해 ④ 안내와 계산이 갈렸다(`burdened-gift-residuals-o3-o5-o8.plan.md` O-3). */}
          </div>
      )}

      {/* ③-b 이월과세 §97의2 — 「당초 증여자」 취득 당시 값 한 벌 (D-7b) */}
      {isCarryover && (
        <BurdenedGiftCarryoverBlock asset={asset} onChange={onChange} coDonorNeedsStdPrice={coDonorNeedsStdPrice} />
      )}

      {/* ④ 증여재산 평가액 — 증여일 현재 기준시가(상증법 §61). 담는 범위는 자산마다 다르다
          (`GIFT_STD_PRICE_FIELD` 참조 — 건물분만 vs 토지 포함).
          시가 모드에서는 평가액이 시가로 통째 대체되어 이 값이 쓰이지 않고(상증법 §60②~④ ·
          `burdened-gift-valuation.ts:134-137`), 토지 자산은 건물이 없다 — 둘 다 숨긴다. */}
      {/* ④′ 증여재산 평가 — 조합원입주권 (상증법 §61③). ④의 단일 칸을 대체한다.
          기준시가 모드에서만: 시가 모드는 §60② 시가가 평가액을 통째로 대체한다. */}
      {!isMarketMode && isRightToMoveIn && (
        <BurdenedGiftRightValuationSection asset={asset} onChange={onChange} />
      )}

      {isMixed && <BurdenedGiftMixedUsePanel asset={asset} transferDate={transferDate} />}

      {!isMixed && !isMarketMode && asset.assetKind !== "land" && !isRightToMoveIn && (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 space-y-2 dark:bg-emerald-950/40">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200 text-micro font-bold text-emerald-800 select-none">
            §61
          </span>
          <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">
            증여재산 평가 — 증여일 현재 기준시가
          </p>
          <LawArticleModal legalBasis="상속세및증여세법 §61" label="상증법 §61" />
          {stdPriceLauncher && (
            <div className="ml-auto">
              <BuildingStdPriceModalButton
                buttonLabel="건물 기준시가 계산 (상속·증여)"
                lockedTaxType="inheritance_gift"
                initialAddress={stdPriceAddress}
                snapshotKey={`bsp-${asset.assetId}-bggift`}
                prefill={{
                  floorArea: stdPriceLauncher.floorArea,
                  landAreaM2: stdPriceLauncher.landAreaM2,
                  // 상증 1시점 공시지가 — 자산 폼 값이 있으면 즉시 채우고, 없으면 모달의
                  // 조회 필드(LandPriceLookupField)로 사용자가 조회한다(dead-end 아님).
                  valuationLandPricePerSqm: stdPriceLauncher.landPricePerSqm,
                  // 증여일 = 양도일. 모달이 eventDate로 받아 상증 평가연도를 도출한다
                  // (`BuildingStdPriceForm.tsx:124-127`).
                  transferDate,
                }}
                // 주입 규칙은 자산마다 반대다 — `compose`가 단일 출처다(합산 여부를 여기서 판단 금지).
                onApply={(v, land) =>
                  onChange({
                    bgGiftBuildingStdPriceAtTransfer: String(stdPriceLauncher.compose(v, land)),
                  })
                }
              />
            </div>
          )}
        </div>
        {stdPriceLauncher?.needsAppurtenantLand && (
          <p className="text-caption text-emerald-700 dark:text-emerald-300">
            이 자산의 증여재산 평가액은 <b>건물 + 부수토지</b> 합계입니다. 계산기에서 부수토지
            면적·개별공시지가를 함께 입력하세요(「상속세 및 증여세법」 제61조 제1항 제1호·제2호).
          </p>
        )}
        <FieldCard
          label={GIFT_STD_PRICE_FIELD[asset.assetKind]?.label ?? "증여일 현재 기준시가"}
          hint={GIFT_STD_PRICE_FIELD[asset.assetKind]?.hint}
        >
          <CurrencyInput
            label=""
            hideUnit
            data-testid="bg-gift-building-std"
            value={asset.bgGiftBuildingStdPriceAtTransfer}
            onChange={(v) => onChange({ bgGiftBuildingStdPriceAtTransfer: v })}
          />
        </FieldCard>
      </div>
      )}

      {/* ⑤ Phase 3 — 증여세 통합 입력 (수증자 정보) */}
      <BurdenedGiftDonorTaxBlock asset={asset} onChange={onChange} />

      {/* ⑤ Phase 3 후속 — 10년 이내 사전증여 (상증법 §47② 합산) */}
      <BurdenedGiftPriorGiftsBlock asset={asset} onChange={onChange} />

      {/* ⑥ 양도가액 = 채무액 미리보기 (소령 §159, disabled) */}
      <div className="rounded-lg border border-fuchsia-300 bg-fuchsia-100/70 p-3 space-y-1 dark:bg-fuchsia-900/40">
        <p className="text-xs font-semibold text-fuchsia-900 dark:text-fuchsia-200">자동 계산 미리보기</p>
        <div className="text-xs text-fuchsia-800 space-y-0.5 dark:text-fuchsia-200">
          {/*
            🔴 **축마다 채무의 계산 단위가 다르다** (2026-09-07 대장 재대조).

            · 축 B(지분 분할) — ④ `buildBurdenedGiftInfo`가 채무·보증금·임대료·저당설정액을
              **× 지분율**로 안분한다(§159의 B/C 비율 보존). 총액을 「= 양도가액」이라 적으면
              지분 60%인 사용자에게 실제의 1.67배를 양도가액이라 말하는 것이 된다.
            · 컴패니언 함께 부담부증여 — 지분율이 아니라 **자산가액 비율로 재배분**한다.
              여기서 지분율로 스케일하면 그것대로 틀리므로 금액을 단정하지 않는다.
          */}
          <p>
            인수 채무액{isFractionalSplit ? " (내 지분분 = 양도가액)" : isCompanionBundle ? " (신고 단위 합계)" : isMixed ? " (물건 전체)" : " (= 양도가액)"}:{" "}
            <span className="font-mono tabular-nums font-semibold">
              {fmt(isFractionalSplit ? applyRatio(assumedDebtAmount, ownRatio) : assumedDebtAmount)}원
            </span>
            {isFractionalSplit && ownRatio < 1 && (
              <span className="ml-1 text-fuchsia-700 dark:text-fuchsia-400">
                (입력 총액 {fmt(assumedDebtAmount)} × 지분 {(ownRatio * 100).toFixed(2)}%)
              </span>
            )}
          </p>
          {isCompanionBundle && (
            <p className="text-fuchsia-700 dark:text-fuchsia-400">
              * 함께 부담부증여는 신고 단위 채무를 **자산가액 비율**로 재배분합니다 — 이 자산의
              양도가액은 그 배분 결과이며 위 합계와 다릅니다.
            </p>
          )}
          <p>
            담보평가:{" "}
            <span className="font-mono tabular-nums">{fmt(valuationPreview.mortgage)}원</span>
          </p>
          <p>
            임대평가:{" "}
            <span className="font-mono tabular-nums">{fmt(valuationPreview.rental)}원</span>
          </p>
          <p className="text-fuchsia-700 mt-1 dark:text-fuchsia-400">
            * {isMarketMode ? "시가" : "보충적"}·담보·임대 평가액 중 가장 큰 금액이 증여가액(분모) — 엔진이 이 분모로 양도가·취득가를 자동 산정.
          </p>
        </div>
      </div>
    </div>
  );
}
