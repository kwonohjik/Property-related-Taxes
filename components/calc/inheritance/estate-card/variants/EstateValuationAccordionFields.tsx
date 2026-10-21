"use client";

/**
 * EstateValuationAccordionFields — 부동산 평가액(시가·감정평가액·매매사례가액) 입력 카드
 *
 * `EstateBodyRealEstate.tsx`에서 분리(2026-10-12 — 800줄 정책). 상속세·증여세 공용.
 */

import { useState } from "react";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { Button } from "@/components/ui/button";
import { ReferenceSiteLinks, REFERENCE_SITES } from "@/components/calc/inputs/ReferenceSiteLink";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import { RtmsSimilarSalesModal } from "./RtmsSimilarSalesModal";

// ============================================================
// ValuationAccordionFields — 시가·감정가액·매매사례가액 아코디언 (D-1·D-6 안 가)
//   각 필드 ToggleCard(card·emerald). 값>0이면 초기 펼침. 평가방식 라디오 대체.
//   🔴 닫기 = 그 평가액을 쓰지 않는다 — 값이 있으면 확인 Dialog 후 지운다(2026-10-12).
//      종전에는 닫아도 값이 남아(비파괴) 접힌 카드의 시가로 평가됐다 — 화면에는 안 보이는 값이 결론을 정했다.
//   엔진 우선순위(resolveValuationMethod): market > appraised > similar > standard.
//
// RTMS 자동조회 (아파트 전용):
//   - cat === "real_estate_apartment" 시 "자동조회" 버튼 추가
//   - 버튼 disabled 조건: 주소 미입력 OR 면적 미입력 OR 공시가격 미입력
//   - mirror-pattern 준수: useEffect→store 미러링 금지
//     수동 수정 시 onChange에서 직접 set({ similarSalesSource: undefined })
// ============================================================

type ValuationField = "market" | "appraised" | "similar";

const VALUATION_LABEL: Record<ValuationField, string> = {
  market: "시가",
  appraised: "감정평가액",
  similar: "매매사례가액",
};

/** 카드를 닫을 때 지우는 필드 — 매매사례가액은 출처 배지(similarSalesSource)도 함께. */
const VALUATION_CLEAR_PATCH: Record<ValuationField, Partial<EstateItem>> = {
  market: { marketValue: undefined },
  appraised: { appraisedValue: undefined },
  similar: { similarSalesValue: undefined, similarSalesSource: undefined },
};

interface ValuationAccordionFieldsProps {
  item: EstateItem;
  set: (patch: Partial<EstateItem>) => void;
  cat: "real_estate_land" | "real_estate_building" | "real_estate_apartment";
  /** 평가기준일 YYYY-MM-DD (RTMS 쿼리용) */
  valuationDate?: string;
  /** 세목 (RTMS 평가기간 산정용) */
  mode: "inheritance" | "gift";
  /** 시군구코드 5자리 (RTMS lawdCd 파생용) */
  estateSigunguCode?: string;
}

export function ValuationAccordionFields({
  item,
  set,
  cat,
  valuationDate,
  mode,
  estateSigunguCode,
}: ValuationAccordionFieldsProps) {
  // 필드별 초기 펼침 (값>0이면 ON) — mount 1회.
  const [marketOpen, setMarketOpen] = useState((item.marketValue ?? 0) > 0);
  const [appraisedOpen, setAppraisedOpen] = useState((item.appraisedValue ?? 0) > 0);
  const [similarOpen, setSimilarOpen] = useState((item.similarSalesValue ?? 0) > 0);
  // 값이 있는 카드를 닫으려 할 때 확인 대기 중인 필드 — 확인 전에는 카드 상태 불변.
  const [pendingClose, setPendingClose] = useState<ValuationField | null>(null);

  const fields: Record<ValuationField, { value: number | undefined; setOpen: (v: boolean) => void }> = {
    market: { value: item.marketValue, setOpen: setMarketOpen },
    appraised: { value: item.appraisedValue, setOpen: setAppraisedOpen },
    similar: { value: item.similarSalesValue, setOpen: setSimilarOpen },
  };
  const handleToggle = (field: ValuationField) => (open: boolean) => {
    if (open || (fields[field].value ?? 0) <= 0) {
      fields[field].setOpen(open);
      return;
    }
    setPendingClose(field);
  };
  const confirmClose = () => {
    if (!pendingClose) return;
    set(VALUATION_CLEAR_PATCH[pendingClose]);
    fields[pendingClose].setOpen(false);
  };

  // RTMS 모달 열림 상태 (아파트 전용)
  const [rtmsModalOpen, setRtmsModalOpen] = useState(false);

  // 버튼 활성화 조건
  const hasAddress = !!(item.estateAddress?.jibun || item.estateAddress?.road || item.estateAddress?.pnu);
  const hasSigunguCode = !!(estateSigunguCode && estateSigunguCode.length >= 5);
  const hasArea = !!(item.areaSqm && item.areaSqm > 0);
  const hasStandardPrice = !!(item.standardPrice && item.standardPrice > 0);

  // 모달 렌더가 valuationDate를 요구하므로(:464 게이트) disabled 조건에도 포함한다 (IG-121).
  // 종전에는 주소·면적·기준시가만 채우면 버튼이 «활성»으로 보이는데 눌러도 모달이 열리지
  // 않고 안내도 없어, 사용자는 기능이 고장 났다고 판단했다.
  const rtmsDisabled =
    !hasAddress || !hasSigunguCode || !hasArea || !hasStandardPrice || !valuationDate;

  const rtmsDisabledReason = !hasAddress
    ? "소재지를 먼저 입력해주세요"
    : !hasSigunguCode
      ? "주소를 재검색하여 시군구코드를 확인하세요"
      : !hasArea
        ? "전용면적(㎡)을 먼저 입력해주세요"
        : !hasStandardPrice
          ? "주택 기준시가(공동주택가격)를 먼저 입력해주세요"
          : !valuationDate
            ? mode === "gift"
              ? "증여일을 먼저 입력해주세요"
              : "상속개시일을 먼저 입력해주세요"
            : "";

  // 단지명: item.name 또는 estateAddress.building 또는 빈 문자열
  const aptName =
    item.name ||
    item.estateAddress?.building ||
    "";

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
        평가액 입력 (해당 항목만 펼쳐 입력 — 시가가 있으면 우선 적용)
      </p>

      {/* 시가 — 1순위 */}
      <ToggleCard
        lawLinks="상증법"
        tone="emerald"
        size="sm"
        title="시가 (매매·수용·경매가액)"
        description="평가기간(±6개월) 내 실거래가 — 1순위 (상증법 §60①·시행령 §49①)"
        checked={marketOpen}
        onCheckedChange={handleToggle("market")}
      >
        <CurrencyInput
          label="시가 (매매·수용·경매가액)"
          value={item.marketValue != null ? String(item.marketValue) : ""}
          onChange={(v) => set({ marketValue: parseAmount(v) || undefined })}
          hideLabel
        />
      </ToggleCard>

      {/* 감정평가액 */}
      <ToggleCard
        lawLinks="상증법"
        tone="emerald"
        size="sm"
        title="감정평가액"
        description="감정평가법인 감정가 — 시가 없을 때 적용 (시행령 §49①2호)"
        checked={appraisedOpen}
        onCheckedChange={handleToggle("appraised")}
      >
        <CurrencyInput
          label="감정평가액"
          value={item.appraisedValue != null ? String(item.appraisedValue) : ""}
          onChange={(v) => set({ appraisedValue: parseAmount(v) || undefined })}
          hideLabel
        />
      </ToggleCard>

      {/* 매매사례가액 — 시행령 §49④. 아파트일 때 RTMS 자동조회 버튼 추가 */}
      <ToggleCard
        lawLinks="상증법"
        tone="emerald"
        size="sm"
        title="매매사례가액 (유사매매사례)"
        description="면적·용도·기준시가 유사한 다른 재산 매매가 (시행령 §49④). 해당 재산 시가·감정가 있으면 미적용(§49② 단서)."
        checked={similarOpen}
        onCheckedChange={handleToggle("similar")}
      >
        <div className="space-y-2">
          {/* 금액 입력 + 자동조회 버튼 (아파트 전용 인라인) */}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <CurrencyInput
                label="매매사례가액 (유사매매사례)"
                value={item.similarSalesValue != null ? String(item.similarSalesValue) : ""}
                onChange={(v) => {
                  const amount = parseAmount(v) || undefined;
                  // 수동 수정 시 출처 배지 제거 (mirror-pattern 준수 — useEffect 금지)
                  if (item.similarSalesSource !== undefined) {
                    set({ similarSalesValue: amount, similarSalesSource: undefined });
                  } else {
                    set({ similarSalesValue: amount });
                  }
                }}
                hideLabel
              />
            </div>

            {/* 아파트 전용 자동조회 버튼 */}
            {cat === "real_estate_apartment" && (
              <Button
                type="button"
                variant="modalLauncher"
                size="xs"
                disabled={rtmsDisabled}
                title={rtmsDisabled ? rtmsDisabledReason : "RTMS 실거래가 자동조회 (국토교통부)"}
                onClick={() => setRtmsModalOpen(true)}
                className="shrink-0"
              >
                자동조회
              </Button>
            )}
          </div>

          {/* disabled 사유 안내 (아파트 전용) */}
          {cat === "real_estate_apartment" && rtmsDisabled && (
            <p className="text-caption text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-1">
              ⚠️ {rtmsDisabledReason}
            </p>
          )}

          {/* RTMS 자동조회 출처 배지 */}
          {item.similarSalesSource === "rtms_auto" && (
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-micro font-semibold text-sky-800 dark:bg-sky-900/40 dark:text-sky-300">
                RTMS 자동조회
              </span>
              <span className="text-micro text-gray-600 dark:text-gray-400">
                국토교통부 실거래가 공개시스템 · 직접 금액 수정 시 배지 제거
              </span>
            </div>
          )}
          <ReferenceSiteLinks sites={[REFERENCE_SITES.realPrice]} />
        </div>
      </ToggleCard>

      {/* RTMS 모달 (아파트 전용) */}
      {cat === "real_estate_apartment" && rtmsModalOpen && valuationDate && (
        <RtmsSimilarSalesModal
          open={rtmsModalOpen}
          onOpenChange={setRtmsModalOpen}
          aptName={aptName}
          sigunguCode={estateSigunguCode ?? ""}
          targetExclusiveAreaM2={item.areaSqm}
          targetStandardPrice={item.standardPrice}
          targetUmdNm={item.estateAddress?.jibun
            ? item.estateAddress.jibun.split(" ").slice(-2, -1)[0]
            : undefined}
          valuationDate={valuationDate}
          taxType={mode}
          onSelect={({ amount }) => {
            // 자동채움 — mirror-pattern 준수: useEffect 금지, 명시적 set
            set({ similarSalesValue: amount, similarSalesSource: "rtms_auto" });
            setSimilarOpen(true);
            setRtmsModalOpen(false);
          }}
        />
      )}

      <ConfirmDialog
        open={pendingClose !== null}
        onOpenChange={(open) => {
          if (!open) setPendingClose(null);
        }}
        title={pendingClose ? `${VALUATION_LABEL[pendingClose]} 입력을 닫을까요?` : ""}
        description={
          pendingClose
            ? `닫으면 입력한 ${VALUATION_LABEL[pendingClose]} ${(fields[pendingClose].value ?? 0).toLocaleString("ko-KR")}이 지워지고 평가에 쓰이지 않습니다.`
            : undefined
        }
        confirmLabel="지우고 닫기"
        destructive
        onConfirm={confirmClose}
      />
    </div>
  );
}
