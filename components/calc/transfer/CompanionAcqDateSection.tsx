"use client";

/**
 * 취득일 영역 — 취득일 입력 + 「토지·건물 취득일 다름」 토글 + 축 A(양도가액 구분).
 *
 * `CompanionAcqPurchaseBlock`에서 분리(2026-07-29, 800줄 정책).
 *
 * 배치 규약(계획서 `transfer-split-input-flow-reorder.plan.md`):
 *   ① 토글 행 (그리드 밖·앞)
 *   ② 분리 OFF — 취득일 단독 전체폭
 *   ③ 분리 ON — [토지 취득일 | 건물 취득일] 2열
 *   ④ 축 A — 양도가액 구분 (확정 계산 규칙 ① — 취득가액 산정보다 앞)
 *
 * 1985.1.1. 미만 클램핑(소득세법 적용 하한)은 이 컴포넌트가 자체 state로 처리한다.
 */

import { useState } from "react";
import { DateInput } from "@/components/ui/date-input";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LandBuildingSaleSplitSection } from "./LandBuildingSaleSplitSection";
import type { BlockProps } from "./CompanionAcqPurchaseBlock.types";
import type { PartAcqMode } from "@/lib/calc/transfer-tax-split-acq-mode";

const MIN_ACQ_DATE = "1985-01-01";

/** 의제취득(§98) 배지 — 취득일 2열에서 토지·건물 각 칸에 붙는다. */
function DeemedBadge() {
  return (
    <span className="inline-flex items-center rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-micro font-semibold text-amber-900">
      의제취득(§98)
    </span>
  );
}

export function CompanionAcqDateSection(props: {
  block: BlockProps;
  isSplitable: boolean;
  isSplit: boolean;
  isMixedUse: boolean;
  acqDateLabel: string;
  effLandAcqMode: PartAcqMode;
  effBuildingAcqMode: PartAcqMode;
}) {
  const { block: p, isSplitable, isSplit, isMixedUse, acqDateLabel } = props;
  const [dateClampMsg, setDateClampMsg] = useState(false);
  const [landDateClampMsg, setLandDateClampMsg] = useState(false);

  const isDeemedAcquisitionDate = !!(p.acquisitionDate && p.acquisitionDate <= MIN_ACQ_DATE);
  const isLandDeemedAcquisitionDate = !!(p.landAcquisitionDate && p.landAcquisitionDate <= MIN_ACQ_DATE);

  function handleAcquisitionDateChange(v: string) {
    p.onAcquisitionDateChange(v);
    setDateClampMsg(false);
  }
  function handleAcquisitionDateBlur() {
    if (p.acquisitionDate && p.acquisitionDate < MIN_ACQ_DATE) {
      p.onAcquisitionDateChange(MIN_ACQ_DATE);
      setDateClampMsg(true);
    }
  }
  function handleLandAcquisitionDateChange(v: string) {
    p.onLandAcquisitionDateChange?.(v);
    setLandDateClampMsg(false);
  }
  function handleLandAcquisitionDateBlur() {
    if (p.landAcquisitionDate && p.landAcquisitionDate < MIN_ACQ_DATE) {
      p.onLandAcquisitionDateChange?.(MIN_ACQ_DATE);
      setLandDateClampMsg(true);
    }
  }

  return (
      <div className="space-y-1.5">
        {/* ① 토글 행 — **그리드 밖·앞**에 둔다(2026-07-29).
            분리 ON이면 아래가 2열이 되는데, 토글 chip을 건물 취득일 라벨 행에 두면
            chip이 오른쪽 칸 안으로 들어가 "토글 아래 두 날짜" 구조가 성립하지 않는다.
            OFF일 때는 종전처럼 라벨·배지와 같은 줄. */}
        <div className="flex items-center gap-3 flex-wrap">
          {!isSplit && <span className="text-sm font-medium">{acqDateLabel}</span>}
          {!isSplit && isDeemedAcquisitionDate && (
            <span className="inline-flex items-center rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-micro font-semibold text-amber-900">
              의제취득(§98)
            </span>
          )}
          {isSplitable && p.onHasSeperateLandAcquisitionDateChange && (
            <ToggleCard
              variant="chip"
              tone="amber"
              title="토지·건물 취득일 다름"
              description={
                isMixedUse
                  ? undefined
                  : isDeemedAcquisitionDate
                    ? "의제취득은 동일일 권장"
                    : "원시취득·신축 등"
              }
              checked={!!p.hasSeperateLandAcquisitionDate}
              onCheckedChange={(v) =>
                p.onHasSeperateLandAcquisitionDateChange!(v)
              }
            />
          )}
        </div>
        {/* ② 분리 OFF — 단독 전체폭 (종전 그대로).
            안내 hint 제거(2026-07-16) — onBlur 자동 클램프 + dateClampMsg + 「의제취득(§98)」 배지가
            이미 §98을 알려주므로 상시 노출 문구는 중복이었다.
            ⚠️ `acq-date-building`이 OFF/ON 두 분기에 동시에 존재하면 안 된다(E2E strict mode). */}
        {!isSplit && (
          <>
            <DateInput
              value={p.acquisitionDate}
              onChange={handleAcquisitionDateChange}
              onBlur={handleAcquisitionDateBlur}
              data-testid="acq-date-building"
            />
            {dateClampMsg && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                1985.1.1. 의제 취득일로 취득일 변경했습니다.
              </p>
            )}
          </>
        )}
        {/* ③-a 겸용주택 안내 — 분리를 **사용자가 켠 적이 없는데** 2열이 나타난 경우에만.
            겸용 토글이 `hasSeperateLandAcquisitionDate`를 강제 ON 하므로(MixedUseSection.tsx:44-50)
            사용자는 왜 칸이 둘인지 알 수 없고, 앞 칸(토지)만 채운 채 넘어간다. 그러면 건물 취득일이
            비어 PHD 3시점 모달이 취득 시점을 "연도 미상 — 계산 제외"로 빼고 환산취득가 산정이
            조용히 축소된다(계획서 e2e-preexisting-failures-4.plan.md D-C).
            ⚠️ 사용자가 토글을 **직접** 켠 경우에는 붙이지 않는다 — 그건 "취득일이 다르다"는 의도
               표명이라 둘 다 채울 의사가 있고, 안내는 노이즈가 된다. */}
        {isSplit && isMixedUse && (
          <ToneCard tone="amber" noDark bodyClassName="space-y-1">
            <p className="text-xs text-amber-900" data-testid="split-acq-date-mixed-note">
              겸용주택은 토지·건물 취득일을 <strong>각각</strong> 입력합니다. 같은 날 취득했다면 같은
              날짜를 넣으세요 — 두 값이 주택분·상가분 4부분 안분과 장기보유특별공제 기산에 각각
              쓰입니다 (소득세법 시행령 §166⑥).
            </p>
          </ToneCard>
        )}
        {/* ③ 분리 ON — 토지·건물 취득일 2열. 취득일이 다른 자산이므로 두 날짜를 나란히 본다. */}
        {isSplit && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 items-start" data-testid="acq-date-split-grid">
            <FieldCard
              label="토지 취득일"
              trailing={isLandDeemedAcquisitionDate ? <DeemedBadge /> : undefined}
            >
              <DateInput
                value={p.landAcquisitionDate ?? ""}
                onChange={handleLandAcquisitionDateChange}
                onBlur={handleLandAcquisitionDateBlur}
                data-testid="acq-date-land"
              />
              {landDateClampMsg && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  1985.1.1. 의제 취득일로 취득일 변경했습니다.
                </p>
              )}
            </FieldCard>
            <FieldCard
              label={acqDateLabel}
              trailing={isDeemedAcquisitionDate ? <DeemedBadge /> : undefined}
            >
              <DateInput
                value={p.acquisitionDate}
                onChange={handleAcquisitionDateChange}
                onBlur={handleAcquisitionDateBlur}
                data-testid="acq-date-building"
              />
              {dateClampMsg && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  1985.1.1. 의제 취득일로 취득일 변경했습니다.
                </p>
              )}
            </FieldCard>
          </div>
        )}
        {/* 8-B-5: 의제취득 + 분리 토글 ON 시 안내 (토지·건물 동일일 권장) */}
        {isDeemedAcquisitionDate && p.hasSeperateLandAcquisitionDate && !isMixedUse && (
          <p className="text-caption text-amber-700 leading-relaxed">
            ⚠ 의제취득(1985.1.1)은 토지·건물이 동일 취득일로 의제됩니다. 분리 토글 비활성화 권장.
          </p>
        )}

        {/* ④ 축 A — 양도가액을 토지·건물로 구분 (확정 계산 규칙 ①).
            취득가액 산정(규칙 ②)보다 **앞**에 온다. 축 B(파트별 취득가액)와 달리
            자산 전체 「취득가액 산정 방식」에 의존하지 않으므로 여기 둘 수 있다.
            ⚠️ 산정방식 게이트(burdened_gift·redevelopment_apt 제외) **밖** — 부담부증여는
               안내 카드를 렌더해야 한다.
            ⚠️ **겸용주택 제외**(2026-07-29). 겸용은 `hasSeperateLandAcquisitionDate`가 강제
               ON이라 `isSplit`이 참이 되지만, 축 A 입력은 **엔진에 도달하지 않는다**:
                 · `app/api/calc/transfer/route.ts:568` 겸용 분기가 early-return —
                   `calculateTransferTax`(→ calcTransferGain → calcSplitGain)를 호출조차 않는다
                 · `transfer-tax-mixed-use*.ts`가 `landTransferPrice`·`saleSplitMode`·
                   `buildingStandardPriceAtTransfer`를 읽는 지점 0건(양도가액은 자체 4부분 안분)
               게다가 겸용은 「겸용주택 분리계산」 영역에서 이미 3시점 기준시가를 입력받아
               **중복 노출**이었다. 취득일 2열은 유지한다 — 그건 엔진이 실제로 소비한다
               (transfer-tax-mixed-use.ts:136-139 LTHD 기산). */}
        {isSplit && !isMixedUse && p.asset && p.onAssetChange && (
          <LandBuildingSaleSplitSection
            isBurdenedGift={p.asset.transferType === "burdened_gift"}
            saleSplitMode={p.asset.saleSplitMode ?? "apportioned"}
            onSaleSplitModeChange={(v) => p.onAssetChange!({ saleSplitMode: v })}
            landTransferPrice={p.landTransferPrice ?? ""}
            onLandTransferPriceChange={p.onLandTransferPriceChange ?? (() => {})}
            buildingTransferPrice={p.buildingTransferPrice ?? ""}
            onBuildingTransferPriceChange={p.onBuildingTransferPriceChange ?? (() => {})}
            buildingStandardPriceAtTransfer={p.buildingStandardPriceAtTransfer ?? ""}
            onBuildingStandardPriceAtTransferChange={p.onBuildingStandardPriceAtTransferChange ?? (() => {})}
            landAcqMode={props.effLandAcqMode}
            buildingAcqMode={props.effBuildingAcqMode}
            asset={p.asset}
            onAssetChange={p.onAssetChange}
            transferDate={p.transferDate}
          />
        )}
      </div>
  );
}
