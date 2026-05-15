"use client";

/**
 * RedevelopmentBlock — 재개발/재건축 양도소득세 입력 섹션 (사례 44 UI)
 *
 * assetKind === "redevelopment_apt" 진입 시 렌더.
 * 시행령 §166②1호 (APT 양도 + 청산금 납부 — 사례 44 핵심) + §166③ (환산취득가) + §164⑦ 단서.
 *
 * 구조:
 *  ① sky:    양도 대상 (apt 고정, right disabled)
 *  ② emerald: 출자 자산 (housing 고정, land disabled)
 *  ③ amber:  청산금 방향 (pay 고정, receive disabled)
 *  ④ violet: 재개발 일정·금액 + 분양가 미리보기
 *  ⑤ rose:   환산 기준시가 (useEstimatedAcquisition ON 시)
 *
 * 정책 준수:
 *  - native checkbox/radio 금지 → ToggleCard / RadioCardGroup
 *  - useEffect → store 미러링 금지 → useMemo 순수 계산
 *  - 자동 안분 fallback 금지 (미입력은 validate에서 차단)
 *  - placeholder 숫자 예시 금지 → hint prop 한국어 설명
 *  - 사이드바 합계에 redev 필드 추가 안 함 (미리보기 + 결과카드만)
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { PrecedentArticleModal } from "@/components/ui/precedent-article-modal";
import { useMemo } from "react";
import { addDays, subDays, isValid, parseISO, format } from "date-fns";
import { RedevelopmentValuationSection } from "./RedevelopmentValuationSection";
import { RedevelopmentResidenceSplitSection } from "./RedevelopmentResidenceSplitSection";
import { RedevelopmentRightExemptionSection } from "./RedevelopmentRightExemptionSection";
import { SettlementExemptionGuideCard } from "./SettlementExemptionGuideCard";

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
  /** 양도가액 — 12억 초과 자동 안내용 (subject="right" §⑥ 카드) */
  transferPrice?: string;
}

// ── ToggleCard 옵션 ──

const SUBJECT_OPTIONS = [
  { value: "apt" as const, label: "완공 APT 양도", description: "조합 신축주택 양도 (시행령 §166②) — 사례 44" },
  { value: "right" as const, label: "입주권 양도", description: "관리처분 인가 후 조합원 입주권 양도 (시행령 §166① · §95② 단서 + §89①4호 가목) — 사례 36" },
];

const ORIGINAL_ASSET_OPTIONS = [
  { value: "housing" as const, label: "주택 출자", description: "기존 주택을 조합에 출자 (사례 44~46) — 본 PR UI 지원" },
  { value: "land" as const, label: "토지 출자", description: "기존 토지를 조합에 출자 (사례 40~43) — 후속 PR" },
];

const SETTLEMENT_OPTIONS = [
  { value: "pay" as const, label: "청산금 납부", description: "권리가액 < 분양가 → 차액 납부 (사례 44·45)" },
  { value: "receive" as const, label: "청산금 수령", description: "권리가액 > 분양가 → 차액 수령 (시행령 §166①2호 가목, 사례 46)" },
];

const APPROVAL_LAW_OPTIONS = [
  { value: "urban_renovation_art_74" as const, label: "도시정비법 §74 (재개발/재건축)", description: "도시 및 주거환경정비법 §74 관리처분계획 인가 — 본류" },
  { value: "small_housing_art_29" as const, label: "빈집소규모정비법 §29 (소규모정비)", description: "빈집 및 소규모주택 정비에 관한 특례법 §29 사업시행계획 인가 — 후속 PR" },
];

export function RedevelopmentBlock({ asset, onChange, isOneHouseSingle, wasRegulatedAtAcquisition, transferPrice }: Props) {
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
      {/* §⑥ 1세대1입주권 비과세 카드 (사례 36 — subject="right" 전용) */}
      {isRightSubject && (
        <RedevelopmentRightExemptionSection
          asset={asset}
          onChange={onChange}
          wasRegulatedAtAcquisition={wasRegulatedAtAcquisition}
          transferPrice={transferPrice}
        />
      )}

      {/* 0️⃣ 1세대1주택 + 12억 안분 적용 가이드 — subject="apt" 시만 노출 */}
      {!isRightSubject && (
      <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-900 leading-relaxed">
        <p className="font-semibold mb-0.5">⚠️ 1세대1주택 + 12억 초과 비과세 안분 적용 여부</p>
        <p>
          본 자산이 1세대1주택 + 12억 초과인 경우 §95③·시행령 §160 안분이 적용됩니다. 적용 여부는
          <span className="font-semibold"> 다음 &ldquo;보유 상황&rdquo; 단계의 &ldquo;세대·주택 현황&rdquo;</span> 입력(1세대 여부 + 보유 주택 수 1채)에 따라 결정됩니다.
          1세대1주택이 아니면 분기별 양도차익 전체가 과세대상입니다 (12억 안분 미적용).
        </p>
      </div>
      )}

      {/* ① sky: 양도 대상 */}
      <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-[10px] font-bold text-sky-800 select-none">1</span>
          <p className="text-xs font-semibold text-sky-700">양도 대상 (시행령 §166)</p>
        </div>
        <RadioCardGroup
          name={`redevSubject-${asset.assetId}`}
          value={asset.redevSubject || (asset.assetKind === "right_to_move_in" ? "right" : "apt")}
          onChange={(v) => {
            // assetKind가 right_to_move_in이면 right 고정 (변경 불가)
            // assetKind가 redevelopment_apt이면 apt/right 선택 가능
            onChange({ redevSubject: v as "" | "right" | "apt" });
          }}
          options={SUBJECT_OPTIONS.map((o) => ({
            ...o,
            // right_to_move_in 선택 시 "apt" 옵션 비활성
            disabled: asset.assetKind === "right_to_move_in" && o.value === "apt",
          }))}
          layout="stack"
        />
      </div>

      {/* ② emerald: 출자 자산 */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200 text-[10px] font-bold text-emerald-800 select-none">2</span>
          <p className="text-xs font-semibold text-emerald-700">출자 자산</p>
        </div>
        <RadioCardGroup
          name={`redevOriginal-${asset.assetId}`}
          value={asset.redevOriginalAssetType || "housing"}
          onChange={(v) => onChange({ redevOriginalAssetType: v as "" | "land" | "housing" })}
          options={ORIGINAL_ASSET_OPTIONS.map((o) => ({
            ...o,
            disabled: false, // 사례 37 토지 출자 활성화 (기존: o.value === "land" 차단)
          }))}
          layout="stack"
        />
      </div>

      {/* ②-a rose: 조합원 구분 (사례 48 — 승계조합원) */}
      <SuccessorMemberSection asset={asset} onChange={onChange} />

      {/* ③ amber: 청산금 방향 (승계조합원 모드 시 숨김 — 본 PR 미지원) */}
      {asset.redevIsSuccessorMember !== "yes" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-[10px] font-bold text-amber-800 select-none">3</span>
            <p className="text-xs font-semibold text-amber-700">청산금 방향</p>
          </div>
          <RadioCardGroup
            name={`redevSettlement-${asset.assetId}`}
            value={asset.redevSettlementDirection || "pay"}
            onChange={(v) => onChange({ redevSettlementDirection: v as "" | "pay" | "receive" })}
            options={SETTLEMENT_OPTIONS}
            layout="inline"
          />
        </div>
      )}

      {/* ③-a rose: 청산금 수령분 단독 신고 토글 (사례 46 — receiveOnlyMode) */}
      {asset.redevIsSuccessorMember !== "yes" && asset.redevSettlementDirection === "receive" && (
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

      {/* ④ violet: 재개발 일정·금액 */}
      <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-[10px] font-bold text-violet-800 select-none">4</span>
          <p className="text-xs font-semibold text-violet-700">재개발 일정·금액 (시행령 §166②1호)</p>
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

        <FieldCard label="관리처분 인가일" hint="도시정비법 §74 인가일자 (또는 빈집소규모법 §29 사업시행계획 인가일)">
          <DateInput
            value={asset.redevApprovalDate}
            onChange={(v) => onChange({ redevApprovalDate: v })}
          />
        </FieldCard>

        {asset.redevIsSuccessorMember !== "yes" && (
          <FieldCard label="권리가액" hint="관리처분계획에 따라 정하여진 가격 (시행령 §166④) — 인가전 분 양도가액 의제">
            <CurrencyInput label=""
              value={asset.redevRightsValue}
              onChange={(v) => onChange({ redevRightsValue: v })}
              hideUnit
            />
          </FieldCard>
        )}

        {/* 사례 48 — 승계조합원: 권리가액 필드 숨김 + 자산 카드 취득가액 read-only 미리보기 (P5).
            취득가액 출처는 상단 자산 카드 (상속·증여·매매 등 취득원인별 통합 처리). */}
        {asset.redevIsSuccessorMember === "yes" && (
          <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-[11px] text-sky-900 space-y-1 leading-relaxed">
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
            <div className="pt-1 text-[10px] text-sky-700">
              ※ 시행령 §166④의 &ldquo;권리가액&rdquo;은 관리처분 인가일 기준 평가액이며 원조합원 전용 개념입니다.
              승계조합원의 신축APT 취득가액은 시행령 §162①5호(상속·증여 시점 평가액) 또는 §97①(매매 실가)이 적용됩니다.
            </div>
          </div>
        )}

        {asset.redevIsSuccessorMember !== "yes" && (
          <FieldCard
            label={asset.redevSettlementDirection === "receive" ? "청산금 수령액" : "청산금 납부액"}
            hint={
              asset.redevSettlementDirection === "receive"
                ? "권리가액 > 분양가 시 차액 (수령 모드 — 시행령 §166①2호 가목)"
                : "권리가액 < 분양가 시 차액 (납부 모드)"
            }
          >
            <CurrencyInput label=""
              value={asset.redevSettlementAmount}
              onChange={(v) => onChange({ redevSettlementAmount: v })}
              hideUnit
            />
          </FieldCard>
        )}

        {/*
          소유권이전 고시일은 신축APT 등기 절차의 일부 — subject="apt"(완공 APT 양도, 사례 46)에서만 적용.
          subject="right"(입주권 양도, 사례 36 R-5)는 신축 완공 전 권리 양도이므로 settlementSaleDate 불필요.
        */}
        {asset.redevIsSuccessorMember !== "yes"
          && asset.redevSettlementDirection === "receive"
          && asset.redevSubject === "apt" && (
          <SettlementAnnouncementDateField asset={asset} onChange={onChange} />
        )}

        {asset.redevIsSuccessorMember !== "yes" && (
          <FieldCard label="인가전 분 필요경비" hint="법 §97①2·3호 + 시행령 §163⑥ — 인가전 양도차익 산식의 필요경비">
            <CurrencyInput label=""
              value={asset.redevPreApprovalExpenses}
              onChange={(v) => onChange({ redevPreApprovalExpenses: v })}
              hideUnit
            />
          </FieldCard>
        )}

        {/* 사례 48 — 승계조합원 모드 전용: 추가분담금(인가후 필요경비) 입력 슬롯.
            양도코리아 화면 "입주권필요경비" 라벨 매핑. redevPostApprovalExpenses 필드는
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
            <p className="text-[11px] text-violet-600">
              ※ §166②1호 인가후 분 양도차익 산정 시 양도가액에서 차감되는 분양가. 상단 일반 &ldquo;취득가액&rdquo; 입력 대신 본 값이 자동 사용됩니다.
            </p>
            <p className="text-violet-700">
              기존건물분 비율: <span className="font-mono">{preview.existingRatio}%</span> /
              청산금분 비율: <span className="font-mono">{preview.settlementRatio}%</span>
            </p>
          </div>
        )}
      </div>

      {/* ⑤ sky: 인가전 분 종전 주택 취득가 (실가 모드) — useEstimatedAcquisition OFF 시만 표시
          §166①1호 인가전 분 양도차익 산정의 차감 기준 (사례 45/46 실거래가).
          환산 모드 ON 시 비표시 (아래 ⑥ rose 카드의 §164⑦/§166③ 환산으로 자동 도출).
          승계조합원 모드 시 비표시 — 종전주택 미소유 + §166 안분 우회 산식이라 입력 불요. */}
      {!asset.useEstimatedAcquisition && asset.redevIsSuccessorMember !== "yes" && (
        <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-[10px] font-bold text-sky-800 select-none">5</span>
            <p className="text-xs font-semibold text-sky-700">인가전 분 종전 주택 취득가액 (실가 모드)</p>
          </div>
          <div className="rounded-md bg-sky-100/60 border border-sky-200 p-2 text-[11px] text-sky-800 leading-relaxed">
            <p>
              <span className="font-semibold">안내</span> — 종전주택의 <span className="font-semibold">취득 실거래가액을 확인할 수 있으면</span> 아래에 입력하세요.
              확인이 불가능하면 본 카드를 비워두고 <span className="font-semibold">아래 &ldquo;환산취득가 사용&rdquo; 토글을 ON</span>으로 전환하면 §166③ 기준시가 비율 환산으로 자동 도출됩니다.
            </p>
          </div>
          <FieldCard
            label="실거래가 취득가액"
            hint="재개발 관리처분 인가 전 종전 주택의 실거래가 (§166①1호 인가전 분 차감 기준)."
          >
            <CurrencyInput
              label=""
              value={asset.redevActualAcquisitionPrice}
              onChange={(v) => onChange({ redevActualAcquisitionPrice: v })}
              hideUnit
            />
          </FieldCard>
        </div>
      )}


      {/* ⑥ rose: 환산취득가 (시행령 §166③ + §164⑦ PHD 패턴) — 승계조합원 모드 시 숨김 (본 PR 미지원) */}
      {asset.redevIsSuccessorMember !== "yes" && (
        <RedevelopmentValuationSection asset={asset} onChange={onChange} />
      )}

      {/* §⑤ 거주월수 분리 입력 (사례 45 — 1세대1주택 + 12억 초과) — 승계조합원 모드 시 숨김 (본 PR 미지원) */}
      {asset.redevIsSuccessorMember !== "yes" && (
        <RedevelopmentResidenceSplitSection asset={asset} onChange={onChange} isOneHouseSingle={isOneHouseSingle} />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 청산금 수령 시 소유권이전 고시일 입력 → 양도일(고시일+1일) 자동 표시
// 폼 저장은 양도일(redevSettlementSaleDate), 사용자 입력은 고시일 (UI 변환).
// ──────────────────────────────────────────────────────────────────────────────

function SettlementAnnouncementDateField({
  asset,
  onChange,
}: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}) {
  // 폼에 저장된 redevSettlementSaleDate = 양도일. UI 표시는 -1일(고시일).
  const announcementDate = useMemo(() => {
    if (!asset.redevSettlementSaleDate) return "";
    const d = parseISO(asset.redevSettlementSaleDate);
    if (!isValid(d)) return "";
    return format(subDays(d, 1), "yyyy-MM-dd");
  }, [asset.redevSettlementSaleDate]);

  const handleAnnouncementChange = (v: string) => {
    if (!v) {
      onChange({ redevSettlementSaleDate: "" });
      return;
    }
    const d = parseISO(v);
    if (!isValid(d)) {
      onChange({ redevSettlementSaleDate: "" });
      return;
    }
    onChange({ redevSettlementSaleDate: format(addDays(d, 1), "yyyy-MM-dd") });
  };

  return (
    <FieldCard
      label="소유권이전 고시일"
      hint="도시정비법 §86 소유권이전 고시일. 양도일(NTS 집행기준 + 소법 §95④)은 다음날로 자동 산정됩니다."
    >
      <div className="space-y-2">
        <DateInput value={announcementDate} onChange={handleAnnouncementChange} />
        {asset.redevSettlementSaleDate && (
          <div className="rounded-md bg-rose-100/60 border border-rose-200 px-3 py-2 text-[11px] text-rose-800">
            <span className="font-semibold">자동 산정 양도일</span>:{" "}
            <span className="font-mono font-semibold">{asset.redevSettlementSaleDate}</span>{" "}
            <span className="text-rose-600">(고시일 + 1일)</span>
          </div>
        )}
      </div>
    </FieldCard>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 사례 46 — 청산금 수령분 단독 신고 토글 + 분양가 미리보기 + 비과세 자동산정
// ──────────────────────────────────────────────────────────────────────────────

function ReceiveOnlyToggleCard({
  asset,
  onChange,
}: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}) {
  return (
    <ToggleCard
      tone="rose"
      checked={asset.redevReceiveOnlyMode === "yes"}
      onCheckedChange={(v) => onChange({ redevReceiveOnlyMode: v ? "yes" : "no" })}
      title="청산금 수령분 단독 신고"
      description="신축APT 양도 없이 청산금 수령분만 신고 — 시행령 §166① 본문 + 제1항 제2호 가목 단독 적용 (NTS 집행기준)"
    >
      <div className="space-y-2 text-[11px] text-rose-800 leading-relaxed">
        <p>
          본 모드 ON 시 인가전·인가후 양도차익은 신고 대상이 아니며,{" "}
          <span className="font-semibold">청산금 수령액만 양도가액으로 의제</span>됩니다.
          종전부동산 취득가액은 권리가액 대비 청산금 비율로 자동 안분됩니다.
        </p>
        <p>
          ※ <span className="font-semibold">양도일</span>은 소유권이전 고시일의 익일로 입력하세요 (NTS 집행기준).
        </p>
        <p>
          ※ 본 모드에서 자본적지출·양도비·인가후 필요경비 입력은{" "}
          <span className="font-semibold">0으로 처리</span>됩니다 (§97①2·3호 슬롯은 법문상 존재하나
          본 PR 미매핑 — 별도 산정 시 직접 신고 권장).
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <LawArticleModal legalBasis="소득세법 시행령 §166 ① 2호" label="시행령 §166①2호" />
          <PrecedentArticleModal
            citation="기획재정부 재산-439 (2014.06.09)"
            label="재산-439 (LTHD 기간)"
            kind="ruling"
            summary="장기보유특별공제 계산시 취득일~관리처분계획인가일까지가 아닌 취득일부터 양도일까지의 기간에 대하여 공제한다."
          />
        </div>
      </div>
    </ToggleCard>
  );
}

function SalePriceTotalPreviewCard({ asset }: { asset: AssetForm }) {
  const preview = useMemo(() => {
    const rights = parseAmount(asset.redevRightsValue);
    const settle = parseAmount(asset.redevSettlementAmount);
    if (rights <= 0 || settle <= 0) return null;
    const salePriceTotal = Math.max(0, rights - settle);
    return { rights, settle, salePriceTotal };
  }, [asset.redevRightsValue, asset.redevSettlementAmount]);

  if (!preview) return null;

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 text-xs space-y-1">
      <p className="font-semibold text-sky-800">분양가액 (자동 도출, 입력 불요)</p>
      <p className="text-sky-700 font-mono">
        분양가액 = 권리가액 {preview.rights.toLocaleString()} − 청산금 수령액 {preview.settle.toLocaleString()}
      </p>
      <p className="text-sky-700 font-mono">= {preview.salePriceTotal.toLocaleString()}</p>
      <p className="text-[11px] text-sky-600">
        ※ 양도코리아 PDF의 &ldquo;분양가액&rdquo; 칸은 본 마법사에서 권리가액·청산금 입력으로 자동 도출되므로 별도 입력하지 않습니다.
      </p>
    </div>
  );
}

function ExemptionAtApprovalCard({
  asset,
  onChange,
}: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}) {
  // 자동 산정 — 취득일 ~ 관리처분계획인가일 ≥ 24개월
  const auto = useMemo(() => {
    if (!asset.acquisitionDate || !asset.redevApprovalDate) return null;
    const acq = new Date(asset.acquisitionDate);
    const app = new Date(asset.redevApprovalDate);
    if (Number.isNaN(acq.getTime()) || Number.isNaN(app.getTime())) return null;
    if (acq.getTime() > app.getTime()) return null;
    const y = app.getFullYear() - acq.getFullYear();
    const m = app.getMonth() - acq.getMonth();
    const d = app.getDate() - acq.getDate();
    const months = y * 12 + m - (d < 0 ? 1 : 0);
    return { months, eligible: months >= 24 };
  }, [asset.acquisitionDate, asset.redevApprovalDate]);

  // 사용자 override 우선, 빈문자열 시 자동
  const effective: "yes" | "no" | null =
    asset.redevExemptionEligibleAtApproval === "yes"
      ? "yes"
      : asset.redevExemptionEligibleAtApproval === "no"
        ? "no"
        : auto
          ? auto.eligible
            ? "yes"
            : "no"
          : null;

  const labelText =
    auto === null
      ? "취득일 + 관리처분계획인가일을 모두 입력하면 자동 판정"
      : `자동 판정: ${auto.eligible ? "충족" : "미충족"} (${Math.floor(auto.months / 12)}년 ${auto.months % 12}개월)`;

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-[10px] font-bold text-violet-800 select-none">
          ⓘ
        </span>
        <p className="text-xs font-semibold text-violet-700">
          비과세 보유 요건 (관리처분계획인가일 기준 보유 2년)
        </p>
      </div>

      <p className="text-[11px] text-violet-800 leading-relaxed">
        서면2016-법령해석재산-2705 (2017.02.13) — 청산금 수령분 1세대1주택 비과세 판정 시
        보유주택수는 양도일 기준이나 보유·거주요건은 관리처분계획인가일 기준으로 충족 여부를 판단합니다.
      </p>
      <div className="flex flex-wrap gap-2">
        <LawArticleModal legalBasis="소득세법 시행령 §154 ①" label="시행령 §154①" />
        <PrecedentArticleModal
          citation="서면2016-법령해석재산-2705 (2017.02.13)"
          label="서면2016-2705 (판정 시점)"
          kind="ruling"
          summary="청산금 수령분의 1세대1주택 비과세 판정 시 보유주택수 여부는 양도일 현재 기준으로 판정하고, 보유 및 거주요건은 종전주택을 조합에 제공한 시점(관리처분계획인가일 현재)에 충족해야 한다."
        />
      </div>

      <div className="rounded-md border border-violet-200 bg-white/70 p-2 text-[11px] text-violet-900">
        {labelText}
      </div>

      <RadioCardGroup
        name={`redevExemption-${asset.assetId}`}
        value={asset.redevExemptionEligibleAtApproval || ""}
        onChange={(v) =>
          onChange({ redevExemptionEligibleAtApproval: v as "" | "yes" | "no" })
        }
        options={[
          { value: "", label: "자동 판정", description: "취득일·관리처분일 기준 자동 산정값 사용" },
          { value: "yes", label: "수동: 충족", description: "비과세 요건 충족 (override)" },
          { value: "no", label: "수동: 미충족", description: "비과세 요건 미충족 (override) — LTHD 표1 강등" },
        ]}
        layout="inline"
      />

      {effective !== null && (
        <div
          className={`rounded-md border p-2 text-[11px] ${
            effective === "yes"
              ? "border-emerald-300 bg-emerald-100/60 text-emerald-900"
              : "border-rose-300 bg-rose-100/60 text-rose-900"
          }`}
        >
          {effective === "yes" ? (
            <p>
              <span className="font-semibold">비과세 해당</span> — LTHD 표2 적용 가능 (1세대1주택 + 12억 초과 시 안분 적용)
            </p>
          ) : (
            <p>
              <span className="font-semibold">비과세 미해당</span> — LTHD 표1 강제 (2년 보유요건 미충족, 12억 안분 비활성)
            </p>
          )}
        </div>
      )}

      {/* 사례 47 settlement 비과세 차감 4분기 안내 (receiveOnly=no + receive 동시신고) */}
      {asset.redevReceiveOnlyMode !== "yes" && <SettlementExemptionGuideCard asset={asset} effective={effective} />}
    </div>
  );
}

// SettlementExemptionGuideCard는 SettlementExemptionGuideCard.tsx로 분리됨 (800줄 정책)

// ─────────────────────────────────────────────────────────────────────────────
// 사례 48 — 승계조합원 신축APT 양도 (관리처분 후 입주권 승계 → 신축APT 양도)
// 사전-2019-법령해석재산-0649 + 시행령 §162①4호
// ─────────────────────────────────────────────────────────────────────────────

function SuccessorMemberSection({
  asset,
  onChange,
}: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}) {
  // 자동 추정 힌트 3-state (silent 분기 금지 — 안내만)
  const autoSuggestionState = useMemo<"hidden" | "recommend" | "ambiguous">(() => {
    if (asset.redevIsSuccessorMember === "yes") return "hidden"; // 이미 ON
    if (!asset.acquisitionDate || !asset.redevApprovalDate) return "hidden";
    const acq = new Date(asset.acquisitionDate).getTime();
    const apv = new Date(asset.redevApprovalDate).getTime();
    if (isNaN(acq) || isNaN(apv)) return "hidden";
    if (acq > apv) return "recommend"; // 인가 후 취득 → 승계조합원 권장
    if (acq === apv) return "ambiguous"; // 경계값 — 회색지대 경고
    return "hidden";
  }, [asset.acquisitionDate, asset.redevApprovalDate, asset.redevIsSuccessorMember]);

  const isSuccessor = asset.redevIsSuccessorMember === "yes";

  // successor 진입 시 동반 셋팅 (onChange 1회 — useEffect 미러링 금지)
  const handleToggle = (v: "yes" | "no") => {
    if (v === "yes") {
      onChange({
        redevIsSuccessorMember: "yes",
        // 명시 셋팅 (display fallback 의존 차단)
        // 3중 패턴 동기화: right_to_move_in → "right", 그 외 → "apt" (buildRedevelopmentPayload 동일)
        redevSubject: asset.redevSubject || (asset.assetKind === "right_to_move_in" ? "right" : "apt"),
        // 본 PR 강제값 (validate에서 차단되는 분기를 사전 ON 차단)
        redevSettlementDirection: "pay",
        redevSettlementAmount: "0",
        redevPreApprovalExpenses: "0",
        redevReceiveOnlyMode: "no",
        useEstimatedAcquisition: false,
        // P6 — 권리가액(§166④) 필드는 승계 모드에서 의미 없음. store 잔재 제거.
        // 엔진은 fixedAcquisitionPrice 자동 미러로 처리.
        redevRightsValue: "",
      });
    } else {
      onChange({ redevIsSuccessorMember: "no" });
    }
  };

  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-200 text-[10px] font-bold text-rose-800 select-none">
          2a
        </span>
        <p className="text-xs font-semibold text-rose-700">조합원 구분</p>
      </div>

      <RadioCardGroup
        name={`redevIsSuccessor-${asset.assetId}`}
        value={(asset.redevIsSuccessorMember as "" | "yes" | "no") || "no"}
        onChange={(v) => handleToggle(v as "yes" | "no")}
        options={[
          {
            value: "no",
            label: "원조합원",
            description: "관리처분계획인가일 이전 종전부동산 취득자",
          },
          {
            value: "yes",
            label: "승계조합원",
            description: "관리처분계획인가일 이후 입주권을 상속·증여·매매로 승계 취득",
          },
        ]}
        layout="stack"
      />

      {/* 자동 추정 안내 — silent 적용 금지 */}
      {autoSuggestionState === "recommend" && (
        <div className="rounded-md border border-violet-200 bg-violet-50 p-2.5 text-[11px] text-violet-900">
          ⓘ 관리처분 인가일이 취득일보다 이전입니다. 승계조합원 모드 사용을 권장합니다.
        </div>
      )}
      {autoSuggestionState === "ambiguous" && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-[11px] text-amber-900">
          ⚠️ 취득일과 관리처분 인가일이 <span className="font-semibold">동일 날짜</span>입니다.
          원조합원·승계조합원 해석이 갈리는 회색지대로, 사전답변례·NTS 해석을 확인 후 적절한 모드를 선택하세요.
        </div>
      )}

      {isSuccessor && (
        <div className="space-y-2 pt-1">
          <FieldCard
            label="준공일 (사용검사필증 교부일)"
            hint="신축아파트 사용검사필증 교부일. 보유기간·세율의 기산일이 됩니다."
            trailing={
              <LawArticleModal
                legalBasis="소득세법 시행령 §162 ① 4호"
                label="시행령 §162①4호"
              />
            }
          >
            <DateInput
              value={asset.redevCompletionDate}
              onChange={(v) => onChange({ redevCompletionDate: v })}
            />
          </FieldCard>

          <div className="rounded-md border border-sky-200 bg-sky-50 p-2.5 text-[11px] text-sky-900 space-y-1 leading-relaxed">
            <div className="font-semibold">승계조합원 신축APT 양도 분기</div>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>보유기간 = 양도일 − 준공일 (사전-2019-법령해석재산-0649)</li>
              <li>장기보유특별공제·세율의 기산일 = 준공일</li>
              <li>§166 인가전·인가후 안분 산식 미적용 (단순 차감)</li>
              <li>1세대1주택 비과세는 준공일 기준 2년 보유 충족 시 적용</li>
            </ul>
            <div className="flex flex-wrap gap-2 pt-1">
              <LawArticleModal
                legalBasis="소득세법 시행령 §162 ① 4호"
                label="시행령 §162①4호"
              />
              <PrecedentArticleModal
                citation="사전-2019-법령해석재산-0649 (2020.02.11)"
                label="사전-2019-법령해석재산-0649"
                kind="ruling"
                summary="관리처분계획인가일 이후 입주권을 승계 취득한 자의 신축아파트 취득시기는 아파트의 사용검사필증 교부일이며, 1세대1주택 비과세·LTHD·세율 적용에 있어 보유기간 기산일은 모두 준공일이다."
              />
            </div>
          </div>

          <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900">
            <div className="font-semibold">본 PR 미지원 분기 (자동 차단)</div>
            <ul className="list-disc pl-4 space-y-0.5 mt-1">
              <li>승계조합원 + 청산금 분기 (납부·수령) — 후속 PR</li>
              <li>승계조합원 + 12억 초과 안분 — 후속 PR</li>
              <li>승계조합원 + 환산취득가 모드 — 후속 PR (상속·증여 평가액 직접 입력)</li>
              <li>승계조합원 + 동일세대 상속 §154⑧ 통산 — 후속 PR</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
