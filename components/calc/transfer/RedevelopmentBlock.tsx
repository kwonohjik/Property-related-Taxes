"use client";

/**
 * RedevelopmentBlock — 재개발/재건축 양도소득세 입력 섹션
 *
 * **두 자산 종류의 공용 블록**이다 (2026-08-13 축 일원화 · PR #1245):
 *   입주권(`right_to_move_in`)     → 조합원입주권 양도 (§166① — 사례 36~39)
 *   재개발APT(`redevelopment_apt`) → 완공 신축주택 양도 (§166② — 사례 40~48)
 * 공통 입력이 대부분이라 컴포넌트를 나누지 않고 `isRightSubject`로 분기한다.
 * §166③ (환산취득가) + §164⑦ 단서 포함.
 *
 * 구조 (✱ = 완공 APT 양도 전용):
 *  ②  emerald: 출자 자산 (토지·주택)
 *  ②-a rose:  조합원 구분 (사례 48) ✱
 *  ③  amber:  청산금 방향 (pay/receive)
 *  ③-a rose:  청산금 수령분 단독 신고 (사례 46) ✱
 *  ③-c violet: 비과세 보유 요건 (사례 46·47)
 *  ④  violet: 재개발 일정·금액 + 분양가 미리보기 (조문 표기는 자산 종류별)
 *  ⑤  sky:    인가전 분 종전 부동산 취득가액 — 실가/환산 라디오 + 고른 쪽 입력 UI
 *             (2026-08-13 통합: 종전 실가 카드 + 「환산취득가 사용」 ToggleCard 2분리 구조 폐지)
 *  ⑥  emerald: 거주개월 분리 입력 (사례 45) ✱
 *
 * ✱ 표시 항목은 **신축 APT가 존재해야** 성립하는 사실이라 입주권에서 숨긴다.
 *   숨기지 않으면 값이 API·엔진까지 흘러 세액을 조용히 바꾼다 (2026-08-14 실측 —
 *   ③-a는 양도가액이 청산금 수령액으로 교체, ⑥은 입주권 LTHD 14% → 68%).
 *
 * 정책 준수:
 *  - native checkbox/radio 금지 → ToggleCard / RadioCardGroup
 *  - useEffect → store 미러링 금지 → useMemo 순수 계산
 *  - 자동 안분 fallback 금지 (미입력은 validate에서 차단)
 *  - placeholder 숫자 예시 금지 → hint prop 한국어 설명
 *  - 사이드바 합계에 redev 필드 추가 안 함 (미리보기 + 결과카드만)
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { isFractionalOwnership } from "@/lib/calc/transfer-tax-api-helpers";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { useMemo } from "react";
import { RedevelopmentValuationSection } from "./RedevelopmentValuationSection";
import { RedevelopmentResidenceSplitSection } from "./RedevelopmentResidenceSplitSection";
import { RedevelopmentRightExemptionSection } from "./RedevelopmentRightExemptionSection";
import { HousingContribEstimatedSection } from "./HousingContribEstimatedSection";
import {
  RedevelopmentDeemedAcquisitionNotice,
  RedevelopmentSec163_9PriorityNotice,
} from "./RedevelopmentDeemedAcquisitionNotice";
import {
  SettlementAnnouncementDateField,
  ReceiveOnlyToggleCard,
  SalePriceTotalPreviewCard,
  ExemptionAtApprovalCard,
  SuccessorMemberSection,
} from "./RedevelopmentBlockCards";
import {
  ORIGINAL_ASSET_OPTIONS,
  SETTLEMENT_OPTIONS,
  ACQ_MODE_OPTIONS,
  APPROVAL_LAW_OPTIONS,
} from "./RedevelopmentBlockOptions";
import {
  shouldShowRedevValuationSection,
  isHousingContribEstimatedBranch,
} from "./asset-sections/AssetAreaRedevelopment";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /**
   * 1세대1주택 + householdHousingCount === 1 충족 여부 (form-전역).
   * 사례 45 §⑤ 거주월수 분리 입력 카드 가시성 가드.
   * undefined 시 fallback: true (legacy 호환 — 신규 호출 사이트는 명시 전달 권장).
   */
  isOneHouseSingle?: boolean;
  /**
   * 폼-전역 wasRegulatedAtAcquisition — 조정대상지역 취득 여부.
   * C-1 (a) 거주요건 경고 가드 (§89①3호 가목 단서) — subject="right" 시 전달.
   */
  wasRegulatedAtAcquisition?: boolean;
}

export function RedevelopmentBlock({ asset, onChange, isOneHouseSingle, wasRegulatedAtAcquisition }: Props) {
  /**
   * 공유지분 모드 여부 — ④ API 변환(`buildRedevelopmentPayload`)과 **같은 술어**를 쓴다.
   * 갈라지면 화면이 「지분 해당분」이라 하는데 엔진은 100%로 취급하는 사고가 난다.
   */
  const isRedevFractional = isFractionalOwnership(asset);
  // subject="right" (입주권 양도) 포함: assetKind="right_to_move_in" 시에도 활성화
  const isActive = asset.assetKind === "redevelopment_apt" || asset.assetKind === "right_to_move_in";
  const isRightSubject = asset.redevSubject === "right" || asset.assetKind === "right_to_move_in";

  // 분양가 미리보기 (useMemo 순수 계산 — useEffect 미러링 금지)
  const preview = useMemo(() => {
    const rights = parseAmount(asset.redevRightsValue);
    const settlement = parseAmount(asset.redevSettlementAmount);
    if (rights <= 0 || settlement < 0) return null;

    const isPay = asset.redevSettlementDirection === "pay";
    const salePriceTotal = isPay ? rights + settlement : Math.max(0, rights - settlement);
    if (salePriceTotal <= 0) return null;

    const existingRatio = (rights / salePriceTotal) * 100;
    const settlementRatio = (settlement / salePriceTotal) * 100;

    return {
      salePriceTotal,
      existingRatio: existingRatio.toFixed(2),
      settlementRatio: settlementRatio.toFixed(2),
      sign: isPay ? "+" : "−",
    };
  }, [asset.redevRightsValue, asset.redevSettlementAmount, asset.redevSettlementDirection]);

  // (환산취득가 미리보기 + PHD 트리거 + landArea 변환은 RedevelopmentValuationSection으로 분리됨)

  if (!isActive) return null;

  return (
    <div className="space-y-3">
      {/* 상속·증여 종전자산 취득가액 안내 — §163⑨: 상속개시일/증여일 평가액을 취득가액(실가)으로 사용 */}
      <RedevelopmentDeemedAcquisitionNotice acquisitionCause={asset.acquisitionCause} />

      {/* §⑥ 1세대1입주권 비과세 카드 (사례 36 — subject="right" 전용) */}
      {isRightSubject && (
        <RedevelopmentRightExemptionSection
          asset={asset}
          onChange={onChange}
          wasRegulatedAtAcquisition={wasRegulatedAtAcquisition}
        />
      )}

      {/* 0️⃣ 1세대1주택 + 12억 안분 적용 가이드 — subject="apt" 시만 노출 */}
      {!isRightSubject && (
      <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-caption text-amber-900 leading-relaxed">
        <p className="font-semibold mb-0.5">⚠️ 1세대1주택 + 12억 초과 비과세 안분 적용 여부</p>
        <p>
          본 자산이 1세대1주택 + 12억 초과인 경우 §95③·시행령 §160 안분이 적용됩니다. 적용 여부는
          <span className="font-semibold"> 다음 &ldquo;보유 상황&rdquo; 단계의 &ldquo;세대·주택 현황&rdquo;</span> 입력(1세대 여부 + 보유 주택 수 1채)에 따라 결정됩니다.
          1세대1주택이 아니면 분기별 양도차익 전체가 과세대상입니다 (12억 안분 미적용).
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <LawArticleModal legalBasis="소득세법 §95 ③" label="§95③" />
          <LawArticleModal legalBasis="소득세법 시행령 §160" label="시행령 §160" />
        </div>
      </div>
      )}

      {/* ① 「양도 대상」 라디오는 폐지됐다 (2026-08-13 축 일원화).
          양도 대상은 **자산 종류**가 결정한다:
            입주권(`right_to_move_in`)     → 조합원입주권 양도 (§166① · §95② 단서 · §89①4호)
            재개발APT(`redevelopment_apt`) → 완공 신축주택 양도 (§166②)
          종전 라디오는 「APT 자산인데 입주권 양도」 같은 불일치 조합을 허용했고, 같은 사실을
          두 곳(자산 종류 + 라디오)에서 입력받아 축이 이중화돼 있었다.
          `redevSubject`는 `redevSubjectPatchForAssetKind`가 자산 종류에서 파생해 채우고,
          저장된 불일치 조합은 `calc-wizard-asset-migrate.ts`가 자산 종류를 승격시켜 흡수한다. */}

      {/* ② emerald: 출자 자산 */}
      <ToneCard tone="emerald" sectionNum={2} title="출자 자산" bodyClassName="space-y-2" noDark>
        <RadioCardGroup
          name={`redevOriginal-${asset.assetId}`}
          value={asset.redevOriginalAssetType}
          onChange={(v) => onChange({ redevOriginalAssetType: v as "" | "land" | "housing" })}
          options={ORIGINAL_ASSET_OPTIONS.map((o) => ({
            ...o,
            disabled: false, // 사례 37 토지 출자 활성화 (기존: o.value === "land" 차단)
          }))}
          layout="stack"
        />
      </ToneCard>

      {/* ②-a rose: 조합원 구분 (사례 48 — 승계조합원) — **완공 APT 양도 전용**.
          사례 48은 「관리처분 후 입주권을 승계취득 → **신축APT를 양도**」다. 입주권 자산은
          입주권 자체를 양도하므로 이 분기가 성립하지 않는다.
          입주권의 승계 여부는 ① 기본정보의 「조합원 유형」(`isSuccessorRightToMoveIn`)이 받는다
          — §95② 본문 괄호 「조합원으로부터 취득한 것은 제외」에 따른 LTHD 배제용으로,
          이 카드(`redevIsSuccessorMember`, §166 우회 산식)와는 다른 사실이다.
          두 카드를 한 화면에 함께 노출하면 같은 질문이 두 번 나온 것처럼 읽힌다. */}
      {!isRightSubject && <SuccessorMemberSection asset={asset} onChange={onChange} />}

      {/* ③ amber: 청산금 방향 (승계조합원 모드 시 숨김 — 본 PR 미지원) */}
      {asset.redevIsSuccessorMember !== "yes" && (
        <ToneCard tone="amber" sectionNum={3} title="청산금 방향" bodyClassName="space-y-2" noDark>
          <RadioCardGroup
            name={`redevSettlement-${asset.assetId}`}
            value={asset.redevSettlementDirection || "pay"}
            onChange={(v) =>
              /**
               * U1-01 — 「수령」에서만 뜨는 ③-c 자기선언을 **같은 배치**로 함께 비운다.
               * 방향만 patch하면 카드가 사라지면서 `"no"`가 남고, 완공APT에는 그 값을
               * 지울 다른 위젯이 없어 LTHD가 표1로 강등된 채 고정된다(§95② 표1·표2).
               * ⚠️ 두 키를 따로 patch하면 stale spread로 뒤엣것이 앞엣것을 덮는다
               *    (memory `feedback_multikey_patch_stale_spread_overwrite`).
               */
              onChange({
                redevSettlementDirection: v as "" | "pay" | "receive",
                ...(v === "receive" ? {} : { redevExemptionEligibleAtApproval: "" as const }),
              })
            }
            options={SETTLEMENT_OPTIONS}
            layout="inline"
          />
        </ToneCard>
      )}

      {/* ③-a rose: 청산금 수령분 단독 신고 토글 (사례 46 — receiveOnlyMode) — **완공 APT 양도 전용**.
          엔진의 `receiveOnlyMode` 구현은 `computeAptReceive`(redevelopment-split.ts) 안에만 있다.
          입주권에서 켜면 「인가전·인가후 양도차익 0 강제」는 걸리지 않은 채
          `transfer-tax-api.ts`가 양도가액만 청산금 수령액으로 교체해 **양도차익이 사라진다**
          (실측: 양도가액 4.2억 → 0.5억, 청산금 분 양도차익 1.7억 → 0). */}
      {!isRightSubject && asset.redevIsSuccessorMember !== "yes" && asset.redevSettlementDirection === "receive" && (
        <ReceiveOnlyToggleCard asset={asset} onChange={onChange} />
      )}

      {/* ③-b sky: 분양가 read-only 미리보기 (입력 슬롯 부재) */}
      {asset.redevIsSuccessorMember !== "yes" && asset.redevSettlementDirection === "receive" && (
        <SalePriceTotalPreviewCard asset={asset} />
      )}

      {/* ③-c violet: 비과세 보유 요건 자동 산정
          - 사례 46 (receiveOnly=yes): LTHD 표1 강등 가드용 노출
          - 사례 47 (receiveOnly=no + receive direction): settlement 비과세 차감 자동 산정용 노출 */}
      {asset.redevIsSuccessorMember !== "yes" && asset.redevSettlementDirection === "receive" && isOneHouseSingle && (
        <ExemptionAtApprovalCard asset={asset} onChange={onChange} />
      )}

      {/* ④ violet: 재개발 일정·금액.
          근거 조문이 양도 대상에 따라 다르다 — 입주권은 §166①(조합원입주권 양도차익),
          완공 APT는 §166②1호(신축주택 양도차익). 종전에는 §166②1호로 고정 표기해
          입주권 화면에 틀린 조문이 나왔다. */}
      <ToneCard
        tone="violet"
        sectionNum={4}
        title={`재개발 일정·금액 (시행령 ${isRightSubject ? "§166①" : "§166②1호"})`}
        bodyClassName="space-y-2"
        noDark
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {isRightSubject ? (
            <LawArticleModal legalBasis="소득세법 시행령 §166 ①" label="시행령 §166①" />
          ) : (
            <LawArticleModal legalBasis="소득세법 시행령 §166 ② 1호" label="시행령 §166②1호" />
          )}
          <LawArticleModal legalBasis="소득세법 시행령 §166 ④" label="시행령 §166④" />
          <LawArticleModal legalBasis="소득세법 §97 ①" label="§97①" />
          <LawArticleModal legalBasis="소득세법 시행령 §163 ⑥" label="시행령 §163⑥" />
        </div>

        <RadioCardGroup
          name={`redevApproval-${asset.assetId}`}
          value={asset.redevApprovalLawBasis || "urban_renovation_art_74"}
          onChange={(v) => onChange({ redevApprovalLawBasis: v as "" | "urban_renovation_art_74" | "small_housing_art_29" })}
          options={APPROVAL_LAW_OPTIONS.map((o) => ({
            ...o,
            disabled: o.value === "small_housing_art_29",
          }))}
          layout="stack"
        />

        {/* 2열 배치 (2026-08-13 사용자 지시) — 모바일은 1열로 자동 폴백.
            hint는 제거했다(법령 근거는 섹션 상단 배지가 담당). */}
        <div className="grid gap-2 sm:grid-cols-2">
          <FieldCard label="관리처분 인가일">
            <DateInput
              value={asset.redevApprovalDate}
              onChange={(v) => onChange({ redevApprovalDate: v })}
            />
          </FieldCard>

          {asset.redevIsSuccessorMember !== "yes" && (
            <FieldCard
              label="권리가액"
              hint={isRedevFractional ? "물건 전체(100%) 기준으로 입력하세요 — 시스템이 지분율을 적용합니다." : undefined}
            >
              <CurrencyInput label=""
                value={asset.redevRightsValue}
                onChange={(v) => onChange({ redevRightsValue: v })}
                hideUnit
              />
            </FieldCard>
          )}
        </div>

        {/* 사례 48 — 승계조합원: 권리가액 필드 숨김 + 자산 카드 취득가액 read-only 미리보기 (P5).
            취득가액 출처는 상단 자산 카드 (상속·증여·매매 등 취득원인별 통합 처리). */}
        {asset.redevIsSuccessorMember === "yes" && (
          <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-caption text-sky-900 space-y-1 leading-relaxed">
            <div className="font-semibold">취득가액 — 자산 카드에서 입력</div>
            <div>
              승계조합원의 취득가액은 <span className="font-semibold">상단 자산 카드 &ldquo;취득가액&rdquo;</span> 입력값을 사용합니다.
              상속·증여·매매 어느 취득원인이든 자산 카드의 취득원인 + 취득가액 입력 그대로 사용됩니다.
            </div>
            {parseAmount(asset.fixedAcquisitionPrice) > 0 && (
              <div className="pt-1">
                현재 사용 중인 취득가액:{" "}
                <span className="font-mono font-semibold">
                  {parseAmount(asset.fixedAcquisitionPrice).toLocaleString("ko-KR")}
                </span>
              </div>
            )}
            <div className="pt-1 text-micro text-sky-700">
              ※ 시행령 §166④의 &ldquo;권리가액&rdquo;은 관리처분 인가일 기준 평가액이며 원조합원 전용 개념입니다.
              승계조합원의 신축APT 취득가액은 시행령 §162①5호(상속·증여 시점 평가액) 또는 §97①(매매 실가)이 적용됩니다.
            </div>
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          {asset.redevIsSuccessorMember !== "yes" && (
            <FieldCard
              /**
               * 🔴 지분 모드에서 **이 칸만 지분분을 직접 입력**받는다 — 나머지 금액은 100% 기준이다.
               *
               * §166①1호가 「**납부한** 청산금」이라고 사실을 지목하고, 「도시 및 주거환경정비법」
               * §39①1호가 공유를 **대표 1명의 조합원**으로 보아 조합이 그 1인에게 부과하므로,
               * 공유자 사이의 실제 분담은 내부 약정이다 — 지분율로 파생되지 않는다.
               * 엔진이 ×지분율로 쪼개면 자동 안분 fallback이 된다(정책 위반).
               *
               * 부담부증여 인수채무와 같은 처리다(`BurdenedGiftBlock` 「(지분 인수분)」).
               * 판정 술어는 API 변환·validate와 **같은 소스**(`isFractionalOwnership`)여야 한다.
               */
              label={`${asset.redevSettlementDirection === "receive" ? "청산금 수령액" : "청산금 납부액"}${isRedevFractional ? " (지분 해당분)" : ""}`}
              hint={
                isRedevFractional
                  ? "이 칸만 본인 지분에 해당하는 실제 납부·수령액을 입력하세요. 권리가액·필요경비는 물건 전체(100%) 기준입니다."
                  : undefined
              }
            >
              <CurrencyInput label=""
                value={asset.redevSettlementAmount}
                onChange={(v) => onChange({ redevSettlementAmount: v })}
                hideUnit
              />
            </FieldCard>
          )}

          {asset.redevIsSuccessorMember !== "yes" && (
            <FieldCard label="인가전 분 필요경비">
              <CurrencyInput label=""
                value={asset.redevPreApprovalExpenses}
                onChange={(v) => onChange({ redevPreApprovalExpenses: v })}
                hideUnit
              />
            </FieldCard>
          )}
        </div>

        {/*
          소유권이전 고시일은 신축APT 등기 절차의 일부 — subject="apt"(완공 APT 양도, 사례 46)에서만 적용.
          subject="right"(입주권 양도, 사례 36 R-5)는 신축 완공 전 권리 양도이므로 settlementSaleDate 불필요.
        */}
        {/* 3중 패턴 fallback (memory `feedback_store_default_vs_ui_display_fallback`):
            redevSubject 미입력(빈문자열) 시 assetKind="right_to_move_in" → "right", 그 외 → "apt".
            buildRedevelopmentPayload·validateRedevelopmentAsset과 동일 fallback — UI 표시 누락 차단. */}
        {(() => {
          const subjectEff = asset.redevSubject || (asset.assetKind === "right_to_move_in" ? "right" : "apt");
          return asset.redevIsSuccessorMember !== "yes"
            && asset.redevSettlementDirection === "receive"
            && subjectEff === "apt";
        })() && (
          <SettlementAnnouncementDateField asset={asset} onChange={onChange} />
        )}

        {/* 사례 48 — 승계조합원 모드 전용: 추가분담금(인가후 필요경비) 입력 슬롯.
            예제 화면 "입주권필요경비" 라벨 매핑. redevPostApprovalExpenses 필드는
            buildRedevelopmentPayload에서 postApprovalExpenses로 합산되어 단순 차감 산식의 필요경비로 사용. */}
        {asset.redevIsSuccessorMember === "yes" && (
          <FieldCard
            label="인가후 필요경비 (추가분담금·등기비·중개수수료 등)"
            hint="승계 이후 납부한 추가분담금 + 등기비·중개수수료 등 인가후 비용 (시행령 §166①1호 인가후 양도차익 산식의 필요경비)"
          >
            <CurrencyInput
              label=""
              value={asset.redevPostApprovalExpenses}
              onChange={(v) => onChange({ redevPostApprovalExpenses: v })}
              hideUnit
            />
          </FieldCard>
        )}

        {/* 미리보기 카드 — useMemo 순수 계산 */}
        {preview && (
          <div className="mt-2 rounded-md bg-violet-100/60 border border-violet-200 p-2 text-xs space-y-1">
            <p className="font-semibold text-violet-800">미리보기 — 분양가 (인가후 분 취득가) 자동 산정</p>
            <p className="text-violet-700">
              분양가 = 권리가액 {preview.sign} 청산금 = <span className="font-mono font-semibold">{preview.salePriceTotal.toLocaleString()}</span>
            </p>
            <p className="text-caption text-violet-600">
              ※ §166②1호 인가후 분 양도차익 산정 시 양도가액에서 차감되는 분양가. 상단 일반 &ldquo;취득가액&rdquo; 입력 대신 본 값이 자동 사용됩니다.
            </p>
            <p className="text-violet-700">
              기존건물분 비율: <span className="font-mono">{preview.existingRatio}%</span> /
              청산금분 비율: <span className="font-mono">{preview.settlementRatio}%</span>
            </p>
          </div>
        )}
      </ToneCard>

      {/* ⑤ sky: 인가전 분 종전 부동산 취득가액 — 실가/환산을 **한 섹션에서 라디오로 선택**하고
          고른 쪽 입력 UI만 노출한다(2026-08-13 사용자 지시로 통합).
          종전에는 실가 카드(⑤ sky)와 「환산취득가 사용」 ToggleCard(⑥ rose)가 따로 있어
          모드 전환이 두 카드에 흩어져 있었다.

          모드 값은 기존 `useEstimatedAcquisition` 그대로다 — 신규 필드 없음(API·validate 무변경).
          승계조합원은 취득가액을 상단 자산 카드에서 받으므로 섹션 전체를 숨긴다(종전과 동일). */}
      {asset.redevIsSuccessorMember !== "yes" && (
        <ToneCard
          tone="sky"
          sectionNum={5}
          title="인가전 분 종전 부동산 취득가액"
          bodyClassName="space-y-2"
          noDark
        >
          {/* §163⑨ 상속·증여 평가액이 이 섹션의 값보다 우선한다는 표시 (R-10).
              모드 라디오 **위**에 둔다 — 실가·환산 어느 쪽을 골라도 같이 무시되므로
              섹션 전체에 걸리는 사실이다(실측 8조합). */}
          <RedevelopmentSec163_9PriorityNotice asset={asset} />

          <RadioCardGroup
            name={`redevAcqMode-${asset.assetId}`}
            value={asset.useEstimatedAcquisition ? "estimated" : "actual"}
            onChange={(v) => onChange({ useEstimatedAcquisition: v === "estimated" })}
            options={ACQ_MODE_OPTIONS}
            layout="inline"
          />

          {!asset.useEstimatedAcquisition ? (
            <FieldCard
              label="실거래가 취득가액"
              hint="재개발 관리처분 인가 전 종전 부동산의 실거래가 (§166①1호 인가전 분 차감 기준)."
            >
              <CurrencyInput
                label=""
                value={asset.redevActualAcquisitionPrice}
                onChange={(v) => onChange({ redevActualAcquisitionPrice: v })}
                hideUnit
              />
            </FieldCard>
          ) : isHousingContribEstimatedBranch(asset) ? (
            /* 단독주택 출자 §166③ 2-point 전용 입력 (사례 39) */
            <HousingContribEstimatedSection asset={asset} onChange={onChange} />
          ) : (
            /* 일반 환산 (§166③ + §164⑦ PHD 패턴). 게이트는 `shouldShowRedevValuationSection`
               단일 소스 — ① 기본정보의 면적 위젯이 같은 술어를 쓴다. 복제 금지:
               갈리면 면적 입력 dead-end 또는 미사용 값 입력이 된다. */
            shouldShowRedevValuationSection(asset) && (
              <RedevelopmentValuationSection asset={asset} onChange={onChange} />
            )
          )}
        </ToneCard>
      )}

      {/* §⑤ 거주월수 분리 입력 (사례 45 — 1세대1주택 + 12억 초과) — **완공 APT 양도 전용**.
          「기존주택 거주월수 / 신축주택 거주월수」 분리는 신축 APT가 존재해야 성립한다.
          입주권은 완공 전 권리 양도라 신축 거주가 있을 수 없는데, 게이트가 없으면 그 값이
          `existingResidenceMonths = prior + new`로 합산돼 입주권 LTHD를 부풀린다
          (실측: 신축 거주 120개월만 입력 → LTHD 14% → 68%).
          승계조합원 모드 시에도 숨김 (본 PR 미지원). */}
      {!isRightSubject && asset.redevIsSuccessorMember !== "yes" && (
        <RedevelopmentResidenceSplitSection asset={asset} onChange={onChange} isOneHouseSingle={isOneHouseSingle} />
      )}
    </div>
  );
}
