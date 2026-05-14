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

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /**
   * 1세대1주택 + householdHousingCount === 1 충족 여부 (form-전역).
   * 사례 45 §⑤ 거주월수 분리 입력 카드 가시성 가드.
   * undefined 시 fallback: true (legacy 호환 — 신규 호출 사이트는 명시 전달 권장).
   */
  isOneHouseSingle?: boolean;
}

// ── ToggleCard 옵션 ──

const SUBJECT_OPTIONS = [
  { value: "apt" as const, label: "완공 APT 양도", description: "조합 신축주택 양도 (시행령 §166②) — 사례 44 본 PR UI 지원" },
  { value: "right" as const, label: "입주권 양도", description: "관리처분 인가 후 조합원 입주권 양도 (시행령 §166① · §95② 단서) — 후속 PR" },
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

export function RedevelopmentBlock({ asset, onChange, isOneHouseSingle }: Props) {
  const isActive = asset.assetKind === "redevelopment_apt";

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
      {/* 0️⃣ 1세대1주택 + 12억 안분 적용 가이드 — 자산 카드 진입 시 항상 노출 */}
      <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-900 leading-relaxed">
        <p className="font-semibold mb-0.5">⚠️ 1세대1주택 + 12억 초과 비과세 안분 적용 여부</p>
        <p>
          본 자산이 1세대1주택 + 12억 초과인 경우 §95③·시행령 §160 안분이 적용됩니다. 적용 여부는
          <span className="font-semibold"> 다음 “보유 상황” 단계의 “세대·주택 현황”</span> 입력(1세대 여부 + 보유 주택 수 1채)에 따라 결정됩니다.
          1세대1주택이 아니면 분기별 양도차익 전체가 과세대상입니다 (12억 안분 미적용).
        </p>
      </div>

      {/* ① sky: 양도 대상 */}
      <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-[10px] font-bold text-sky-800 select-none">1</span>
          <p className="text-xs font-semibold text-sky-700">양도 대상 (시행령 §166)</p>
        </div>
        <RadioCardGroup
          name={`redevSubject-${asset.assetId}`}
          value={asset.redevSubject || "apt"}
          onChange={(v) => onChange({ redevSubject: v as "" | "right" | "apt" })}
          options={SUBJECT_OPTIONS.map((o) => ({
            ...o,
            disabled: o.value === "right",
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
            disabled: o.value === "land",
          }))}
          layout="stack"
        />
      </div>

      {/* ③ amber: 청산금 방향 */}
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

      {/* ③-a rose: 청산금 수령분 단독 신고 토글 (사례 46 — receiveOnlyMode) */}
      {asset.redevSettlementDirection === "receive" && (
        <ReceiveOnlyToggleCard asset={asset} onChange={onChange} />
      )}

      {/* ③-b sky: 분양가 read-only 미리보기 (입력 슬롯 부재) */}
      {asset.redevSettlementDirection === "receive" && (
        <SalePriceTotalPreviewCard asset={asset} />
      )}

      {/* ③-c violet: 비과세 보유 요건 자동 산정 (receiveOnly + 1세대1주택 시) */}
      {asset.redevReceiveOnlyMode === "yes" && isOneHouseSingle && (
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

        <FieldCard label="권리가액" hint="관리처분계획에 따라 정하여진 가격 (시행령 §166④) — 인가전 분 양도가액 의제">
          <CurrencyInput label=""
            value={asset.redevRightsValue}
            onChange={(v) => onChange({ redevRightsValue: v })}
            hideUnit
          />
        </FieldCard>

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

        {asset.redevSettlementDirection === "receive" && (
          <SettlementAnnouncementDateField asset={asset} onChange={onChange} />
        )}

        <FieldCard label="인가전 분 필요경비" hint="법 §97①2·3호 + 시행령 §163⑥ — 인가전 양도차익 산식의 필요경비">
          <CurrencyInput label=""
            value={asset.redevPreApprovalExpenses}
            onChange={(v) => onChange({ redevPreApprovalExpenses: v })}
            hideUnit
          />
        </FieldCard>

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
          환산 모드 ON 시 비표시 (아래 ⑥ rose 카드의 §164⑦/§166③ 환산으로 자동 도출). */}
      {!asset.useEstimatedAcquisition && (
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


      {/* ⑥ rose: 환산취득가 (시행령 §166③ + §164⑦ PHD 패턴) — 분리 파일 */}
      <RedevelopmentValuationSection asset={asset} onChange={onChange} />

      {/* §⑤ 거주월수 분리 입력 (사례 45 — 1세대1주택 + 12억 초과) — 분리 파일 */}
      <RedevelopmentResidenceSplitSection asset={asset} onChange={onChange} isOneHouseSingle={isOneHouseSingle} />
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
    </div>
  );
}
