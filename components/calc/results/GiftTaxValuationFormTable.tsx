"use client";

/**
 * 증여재산 및 평가명세서 — 별지 제10호서식 부표 1 〈개정 2026. 3. 20.〉
 *
 * 근거: 상속세 및 증여세법 시행규칙 [별지 제10호서식 부표 1]
 * 디자인: docs/02-design/features/gift-tax-valuation-besshi-10-buppyo.engine.design.md
 *
 * KoreanLaw MCP 검증 (2026-05-20):
 * - ① 재산구분코드 9종 (A11 등) · ② 재산종류코드 14종 · ⑧ 평가기준코드 8종 확정
 * - 본문 표 10행 · 계 영역 ⑨~⑮ 7행
 */

import type {
  EstateItem,
  PropertyValuationResult,
  PriorGift,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import {
  toPriorGiftPropertyTypeCode,
  toEstateItemTypeCode,
  toEstateItemValuationMethodCode,
} from "@/components/calc/results/inheritance-filing-form-helpers";
import {
  PROPERTY_TYPE_LABEL,
  computeRow10,
  computeRow14,
} from "@/lib/calc/gift-valuation-besshi";

// ============================================================
// 코드 매핑 (부표 1 뒷면 작성방법 §2 / §7)
// 재산종류코드(toEstateItemTypeCode)·평가기준코드(toEstateItemValuationMethodCode)는
// inheritance-filing-form-helpers.ts 공유 (상속 부표2와 단일 출처). 여기는 라벨 표시만.
// ============================================================

/** ② 컬럼 표시 — 라벨 메인 + 코드 부제 2줄 (가독성 강화). PROPERTY_TYPE_LABEL은 gift-valuation-besshi 단일 출처. */
function toPropertyTypeDisplay(code: string): React.ReactNode {
  const label = PROPERTY_TYPE_LABEL[code] ?? "기타재산";
  return (
    <>
      <div className="font-medium">{label}</div>
      <div className="text-micro text-gray-500">({code})</div>
    </>
  );
}

// computeRow10·computeRow14는 gift-valuation-besshi.ts 단일 출처 (화면·PDF 공유, dual-truth 0).

// ============================================================
// Props
// ============================================================

export interface GiftTaxValuationFormTableProps {
  /** 본문 행 — A11 (당기 증여재산) */
  valuationResults: PropertyValuationResult[];
  /** valuationResults와 1:1 매칭되는 원본 EstateItem */
  estateItems: EstateItem[];

  /** ⑨ 증여재산가액 (= A11 합) */
  grossGiftValue: number;
  /** ⑩+⑪+⑫+⑬ 합산 (엔진 단일 필드) */
  exemptAmount: number;
  /** ⑮ 합계 = max(0, ⑨−⑩−⑪−⑫−⑬) + ⑭ */
  aggregatedGiftValue: number;
  /** §47① 채무인수액 — ⑭ 사전증여가산 역산 시 차감 (별지10호 ㉓ 정합, H-48) */
  debtAssumed?: number;
  /** §36 대납가산분 — ⑭ 역산 시 제거 (별지10호 ㉓ 정합, H-48) */
  donorPaidTax?: number;

  /** ⑪ §48 공익법인 출연재산가액 */
  publicInterestExclusion?: number;
  /** ⑫ §52 공익신탁 재산가액 */
  publicTrustExclusion?: number;
  /** ⑬ §52의2 장애인 신탁 재산가액 */
  disabledTrustExclusion?: number;

  /**
   * 사전증여 합산 — 본문 행 ①=A24(거주자)로 별도 분리 표시 (§47②).
   * PriorGift는 자산 평가 정보 부재 — Phase 2에서는 ②=12(기타재산) / ⑧=08(보충적 평가) 기본값.
   */
  priorGifts?: PriorGift[];
}

// ============================================================
// 사전증여 행 매핑 — PriorGift → 본문 행 표시값
// ============================================================

/**
 * 사전증여 행 ③ 소재지·법인명 등 칸 표시.
 * 우선순위: propertyLocation(주) > propertyName(보조) > fallback "사전증여 (YYYY-MM-DD)".
 * 모두 입력 시 소재지 메인 + 자산 명칭·증여일 보조 표시.
 */
function describePriorGift(pg: PriorGift): React.ReactNode {
  const loc = pg.propertyLocation?.trim();
  const name = pg.propertyName?.trim();
  if (loc) {
    return (
      <>
        <div>{loc}</div>
        <div className="text-micro text-gray-500">
          {name ? `${name} · ` : ""}사전증여 ({pg.giftDate})
        </div>
      </>
    );
  }
  if (name) {
    return (
      <>
        <div>{name}</div>
        <div className="text-micro text-gray-500">사전증여 ({pg.giftDate})</div>
      </>
    );
  }
  return `사전증여 (${pg.giftDate})`;
}

// ============================================================
// 컴포넌트
// ============================================================

const ROWS_FIXED = 10; // 부표 1 본문 빈 행 포함 고정 행 수
const CELL_BASE = "border border-black p-1 align-middle text-caption";
const CELL_CENTER = `${CELL_BASE} text-center`;
const CELL_AMOUNT = `${CELL_BASE} text-right tabular-nums`;
const CELL_NAME = `${CELL_BASE} text-left`;

export function GiftTaxValuationFormTable({
  valuationResults,
  estateItems,
  grossGiftValue,
  exemptAmount,
  aggregatedGiftValue,
  debtAssumed = 0,
  donorPaidTax = 0,
  publicInterestExclusion = 0,
  publicTrustExclusion = 0,
  disabledTrustExclusion = 0,
  priorGifts = [],
}: GiftTaxValuationFormTableProps) {
  const itemMap = new Map(estateItems.map((it) => [it.id, it]));
  const dataRowCount = valuationResults.length + priorGifts.length;
  const totalRows = Math.max(ROWS_FIXED, dataRowCount);
  const emptyRowCount = totalRows - dataRowCount;

  const row10 = computeRow10(
    exemptAmount,
    publicInterestExclusion,
    publicTrustExclusion,
    disabledTrustExclusion,
  );
  const row14 = computeRow14(aggregatedGiftValue, grossGiftValue, exemptAmount, debtAssumed, donorPaidTax);

  return (
    <div
      className="border-2 border-black bg-white p-3 text-black print:bg-white print:text-black"
      style={{ width: "277mm" }}
    >
      {/* 양식 헤더 */}
      <div className="mb-1 flex items-start justify-between text-micro font-medium">
        <span>
          ■ 상속세 및 증여세법 시행규칙 [별지 제10호서식 부표 1] 〈개정 2026. 3.
          20.〉
        </span>
        <span>(앞쪽)</span>
      </div>

      {/* 관리번호 + 제목 */}
      <div className="mb-1 flex items-end gap-3">
        <div className="border border-black px-2 py-0.5 text-micro">
          관리번호&nbsp;&nbsp;-
        </div>
        <h3 className="flex-1 text-center text-lg font-bold">
          증여재산 및 평가명세서
        </h3>
        <div className="w-20" />
      </div>

      <p className="mb-2 text-micro">
        ※ 뒤쪽의 작성방법을 읽고 작성하시기 바랍니다.
      </p>

      {/* 본문 표 — A4 가로 양식, 좁은 뷰포트는 카드 측에서 가로 스크롤 */}
      <div>
        <table
          className="w-full border-collapse text-caption"
          aria-label="증여재산 및 평가명세서 본문 표"
        >
          <caption className="sr-only">
            증여재산 및 평가명세서 — 별지 제10호서식 부표 1
          </caption>
          <colgroup>
            <col style={{ width: "32mm" }} />
            <col style={{ width: "30mm" }} />
            <col style={{ width: "22mm" }} />
            <col style={{ width: "25mm" }} />
            <col />
            <col style={{ width: "35mm" }} />
            <col style={{ width: "22mm" }} />
            <col style={{ width: "27mm" }} />
            <col style={{ width: "32mm" }} />
            <col style={{ width: "22mm" }} />
          </colgroup>
          <thead>
            <tr>
              <th className={CELL_CENTER} scope="col">① 재산구분코드</th>
              <th className={CELL_CENTER} scope="col">② 재산종류코드</th>
              <th className={CELL_CENTER} scope="col">국외자산 여부</th>
              <th className={CELL_CENTER} scope="col">국외재산 국가명</th>
              <th className={CELL_CENTER} scope="col">③ 소재지·법인명 등</th>
              <th className={CELL_CENTER} scope="col">④ 사업자등록번호 (지분율)</th>
              <th className={CELL_CENTER} scope="col">⑤ 수량(면적)</th>
              <th className={CELL_CENTER} scope="col">⑥ 단가</th>
              <th className={CELL_CENTER} scope="col">⑦ 평가가액</th>
              <th className={CELL_CENTER} scope="col">⑧ 평가기준코드</th>
            </tr>
          </thead>
          <tbody data-testid="table-data-tbody">
            {valuationResults.map((vr, i) => {
              const item = itemMap.get(vr.estateItemId);
              const propertyCode = item ? toEstateItemTypeCode(item.category) : "12";
              const methodCode = item ? toEstateItemValuationMethodCode(item, vr) : "08";
              const shares = item?.listedStockShares;
              const unitPrice = item?.listedStockAvgPrice;
              return (
                <tr key={vr.estateItemId} data-testid={`row-data-${i + 1}`}>
                  <td className={CELL_CENTER} data-testid="col-property-class">
                    A11
                  </td>
                  <td className={CELL_CENTER} data-testid="col-property-type">
                    {toPropertyTypeDisplay(propertyCode)}
                  </td>
                  <td className={CELL_CENTER} data-testid="col-overseas">
                    [ ]여 [ ]부
                  </td>
                  <td className={CELL_CENTER} data-testid="col-country">
                    &nbsp;
                  </td>
                  <td className={CELL_NAME} data-testid="col-name">
                    {item?.name ?? "—"}
                  </td>
                  <td className={CELL_CENTER} data-testid="col-biz-no">
                    &nbsp;
                  </td>
                  <td className={CELL_AMOUNT} data-testid="col-shares">
                    {shares ? shares.toLocaleString() : ""}
                  </td>
                  <td className={CELL_AMOUNT} data-testid="col-unit-price">
                    {unitPrice ? formatKRW(unitPrice) : ""}
                  </td>
                  <td className={CELL_AMOUNT} data-testid="col-amount">
                    {formatKRW(vr.valuatedAmount)}
                  </td>
                  <td className={CELL_CENTER} data-testid="col-valuation-method">
                    {methodCode}
                  </td>
                </tr>
              );
            })}
            {priorGifts.map((pg, i) => {
              const idx = valuationResults.length + i + 1;
              return (
                <tr
                  key={`prior-${pg.giftDate}-${i}`}
                  data-testid={`row-data-${idx}`}
                >
                  <td className={CELL_CENTER} data-testid="col-property-class">
                    A24
                  </td>
                  <td className={CELL_CENTER} data-testid="col-property-type">
                    {/* PR 3 (2026-05-22): GiftPriorPropertyCategory 전용 매핑 헬퍼 사용
                        — EstateItem.category 와 enum 다르므로 toPriorGiftPropertyTypeCode 별도 */}
                    {toPropertyTypeDisplay(
                      toPriorGiftPropertyTypeCode(pg),
                    )}
                  </td>
                  <td className={CELL_CENTER} data-testid="col-overseas">
                    [ ]여 [ ]부
                  </td>
                  <td className={CELL_CENTER} data-testid="col-country">
                    &nbsp;
                  </td>
                  <td className={CELL_NAME} data-testid="col-name">
                    {describePriorGift(pg)}
                  </td>
                  <td className={CELL_CENTER} data-testid="col-biz-no">
                    &nbsp;
                  </td>
                  <td className={CELL_AMOUNT} data-testid="col-shares">
                    &nbsp;
                  </td>
                  <td className={CELL_AMOUNT} data-testid="col-unit-price">
                    &nbsp;
                  </td>
                  <td className={CELL_AMOUNT} data-testid="col-amount">
                    {formatKRW(pg.giftAmount)}
                  </td>
                  <td className={CELL_CENTER} data-testid="col-valuation-method">
                    08
                  </td>
                </tr>
              );
            })}
            {Array.from({ length: emptyRowCount }).map((_, i) => (
              <tr
                key={`empty-${i}`}
                data-testid={`row-empty-${i + 1}`}
                className="h-7"
              >
                <td className={CELL_CENTER}>&nbsp;</td>
                <td className={CELL_CENTER}>&nbsp;</td>
                <td className={CELL_CENTER}>[ ]여 [ ]부</td>
                <td className={CELL_CENTER}>&nbsp;</td>
                <td className={CELL_NAME}>&nbsp;</td>
                <td className={CELL_CENTER}>&nbsp;</td>
                <td className={CELL_AMOUNT}>&nbsp;</td>
                <td className={CELL_AMOUNT}>&nbsp;</td>
                <td className={CELL_AMOUNT}>&nbsp;</td>
                <td className={CELL_CENTER}>&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 계 영역 — 본문 표와 별도 표 */}
      <table
        className="mt-2 w-full border-collapse text-caption"
        aria-label="증여재산 및 평가명세서 계 영역"
      >
        <tbody>
          {/* ⑨ */}
          <tr>
            <td className={`${CELL_CENTER} w-[40px]`} rowSpan={7}>
              계
            </td>
            <td className={CELL_CENTER} colSpan={2}>
              ⑨ 증여재산가액
            </td>
            <td className={CELL_AMOUNT} data-testid="row-9-gross">
              {formatKRW(grossGiftValue)}
            </td>
          </tr>
          {/* ⑩ — 묶음 외부 */}
          <tr>
            <td className={CELL_CENTER} colSpan={2}>
              ⑩ 비과세재산가액
            </td>
            <td className={CELL_AMOUNT} data-testid="row-10-exempt">
              {formatKRW(row10)}
            </td>
          </tr>
          {/* ⑪~⑬ — "과세가액 불산입액" rowSpan=3 */}
          <tr>
            <td className={`${CELL_CENTER} w-[80px]`} rowSpan={3}>
              과세가액
              <br />
              불산입액
            </td>
            <td className={CELL_CENTER}>⑪ 공익법인 출연재산가액</td>
            <td className={CELL_AMOUNT} data-testid="row-11-public-interest">
              {formatKRW(publicInterestExclusion)}
            </td>
          </tr>
          <tr>
            <td className={CELL_CENTER}>⑫ 공익신탁 재산가액</td>
            <td className={CELL_AMOUNT} data-testid="row-12-public-trust">
              {formatKRW(publicTrustExclusion)}
            </td>
          </tr>
          <tr>
            <td className={CELL_CENTER}>⑬ 장애인 신탁재산가액</td>
            <td className={CELL_AMOUNT} data-testid="row-13-disabled-trust">
              {formatKRW(disabledTrustExclusion)}
            </td>
          </tr>
          {/* ⑭ */}
          <tr>
            <td className={CELL_CENTER} colSpan={2}>
              ⑭ 증여재산가산액
            </td>
            <td className={CELL_AMOUNT} data-testid="row-14-add">
              {formatKRW(row14)}
            </td>
          </tr>
          {/* ⑮ 합계 — 상단 굵은 테두리 */}
          <tr>
            <td
              className={`${CELL_CENTER} border-t-2 border-black font-semibold`}
              colSpan={2}
            >
              ⑮ 합계
            </td>
            <td
              className={`${CELL_AMOUNT} border-t-2 border-black font-semibold`}
              data-testid="row-15-sum"
            >
              {formatKRW(aggregatedGiftValue)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* 첨부서류 + 수수료 */}
      <div className="mt-2 flex items-center justify-between border border-black px-2 py-1 text-micro">
        <div>
          <span className="font-semibold">첨부서류 </span>
          증여재산 증명서류
          <br />
          <span className="ml-[60px] text-gray-700">
            [예: 주주(증권계좌)번호 및 잔고증명서, 예금통장 사본 등]
          </span>
        </div>
        <div className="border-l border-black pl-3 text-center">
          수수료
          <br />
          없음
        </div>
      </div>

      <p className="mt-1 text-right text-micro text-gray-700">
        297mm×210mm[백상지 80g/㎡]
      </p>
    </div>
  );
}
