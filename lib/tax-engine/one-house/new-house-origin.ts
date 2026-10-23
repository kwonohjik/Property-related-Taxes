/**
 * §155① 일시적 2주택 — **신규 주택의 취득 경위**에 따른 갈래 판정 (결정 #43 · G6-4).
 *
 * ## 무엇이 문제였나
 *
 * 명부 행에는 「취득일」 하나뿐이다. 신규 주택이 분양권·조합원입주권으로 취득해 완공된 주택이면 사용자는 완공(잔금)일을 넣는다
 * (시행령 §162①4호·8호상 법정 취득일이라 가장 자연스러운 입력이다). 그러면 해석이 §155① 부적용으로 본 **순차 사례**
 * (2021.1.1. 이후 분양권 등 권리를 종전주택을 취득하기 **전에** 산 경우 — 서면-2021-법규재산-6773 · 기획재정부 재산세제과-1181 ·
 * 서면-2021-부동산-2376)까지 고지 없이 비과세가 나왔다.
 *
 * ## 갈래 (`temporaryTwoHouse.newHouseOrigin.kind`)
 *
 * | 경위 | 권리 취득일 R vs 종전주택 취득일 P | 판정 |
 * |---|---|---|
 * | 일반 | — | 현행 §155① (변화 없음) |
 * | 분양권, R < 2021.1.1. | — | 현행 §155① (분양권이 주택 수에 들지 않던 때 — 완공일 기산) |
 * | 분양권·승계 입주권·상가토지 원조합원 | R < P (순차) | §155① 부적용 — 불성립 |
 * | 〃 | R = P (같은 날) | 불성립 + 확인 필요 (선후를 알 수 없다 — 구 8호 선례와 같다) |
 * | 승계 입주권·상가토지 원조합원 (R > P) | 권리 취득 후 1년·3년 | 시행령 §156의2③④로 판정 (`rightTimingCore`) |
 * | 승계 입주권, 2006.1.1. 전 승계(인가일 공란 포함 — 인가는 승계보다 앞선다) | — | §89② 대상이 아니라 현행 §155① (`isOriginRedevRightCounted`) |
 * | 분양권 (R ≥ 2021.1.1., R > P) | 직접 해석 없음 | 계산기: 현행 §155①(완공일) + 확인 필요 / 판정 메뉴: 양론(`contested-issues.ts`) |
 * | 원조합원(기존주택)·자가 재건축 | 기존주택의 연장 | 취득일 = 기존주택 취득일 (클라이언트 `resolveTemporaryTwoHouse`가 날짜를 바꿔 싣는다) |
 * | 모름·미입력 | — | 불성립 + 확인 필요 (원칙 1) |
 *
 * 🔑 판정 메뉴·계산기·합가·중과 15호가 같은 정본(`evaluateTemporaryTwoHouseTiming`)에서 이 판정을 읽는다.
 * 🔑 2023.2.28. 전 양도분에 쓰는 구 중과 배제 8호(`data/surcharge-old-clauses-era.ts`)는 날짜를 직접 읽는다 — 이 갈래 분리를
 *    적용하지 않고 현행을 유지한다(옛 8호에도 순차 법리가 적용되는지 확인하지 못했다 · 결정 #43 하위 1 나). 비과세 판정과
 *    엇갈릴 수 있어 그 사실은 확인 필요로 알린다(`oldClause8OriginDivergenceNote`).
 */
import { TRANSFER } from "../legal-codes";
import { rightTimingCore, type RightTimingCoreInput } from "../transfer-tax-89-2-right-timing-core";
import type { PresaleRight } from "../types/multi-house-surcharge.types";
import type { TransferTaxInput } from "../types/transfer.types";

/** 분양권이 주택 수 산정에 드는 시작일 — 법률 제17477호 부칙 제4조(시드 `presaleRightStartDate`와 같은 값, 일치는 anchor가 지킨다). */
export const NEW_HOUSE_ORIGIN_PRESALE_START = new Date("2021-01-01");
/** 조합원입주권 축 시행일 — `ARTICLE_89_2_REDEV_RIGHT_START_DATE`와 같은 값(법률 제7837호 부칙 §12). 순환 import를 피해 따로 둔다. */
export const NEW_HOUSE_ORIGIN_REDEV_RIGHT_START = new Date("2006-01-01");

export const NEW_HOUSE_ORIGIN_UNCONFIRMED_ID = "155-1-new-house-origin-unconfirmed";
export const NEW_HOUSE_ORIGIN_UNCOLLECTED_ID = "155-1-new-house-origin-uncollected";
export const NEW_HOUSE_PRESALE_HOLDING_ID = "155-1-presale-holding-156-3-unverified";

export type NewHouseOriginInput = RightTimingCoreInput &
  Pick<TransferTaxInput, "temporaryTwoHouse"> &
  /** 합가 세대 가드(아래) — 호출부가 합가 사실을 넘기면 권리 유래 신규 주택을 판정 보류로 막는다 */
  Partial<Pick<TransferTaxInput, "marriageMerge" | "parentalCareMerge">>;

const RIGHT_ORIGIN_KINDS = new Set(["presale", "successor_right", "original_member_non_house"]);

export interface NewHouseOriginVerdict {
  /** 신규 주택의 취득 경위 때문에 §155①이 성립하지 않는가 */
  blocked: boolean;
  /** 확정 근거가 있는 불성립 사유 (해석례 순차 사례 등) */
  reasons: string[];
  /** 모름·미입력·3년 경과 예외 미선언이라 불성립으로 본 사실 — 확인 필요 */
  unconfirmed: string[];
  /** 불성립은 아니지만 확인 필요 (보유 중 분양권 갈래의 현행 유지 · 경위를 묻지 못했거나 답하지 않은 직접 선언 경로) */
  confirmNotes: string[];
  /** 종전주택 보유 중 분양권을 취득해 완공된 갈래인가(양론 대상) */
  holdingPresale: boolean;
  /** 이 판정이 §156의2③④·§156의3②③ 타이밍으로 성립을 정한 경우 그 조문 */
  viaTimingClause?: string;
}

const PASS: NewHouseOriginVerdict = {
  blocked: false,
  reasons: [],
  unconfirmed: [],
  confirmNotes: [],
  holdingPresale: false,
};

const day = (d: Date) => Math.floor(d.getTime() / 86_400_000);
const fmt = (d: Date) => `${d.getUTCFullYear()}.${d.getUTCMonth() + 1}.${d.getUTCDate()}.`;

export const NEW_HOUSE_ORIGIN_LABEL: Record<
  "successor_right" | "original_member_house" | "original_member_non_house" | "presale" | "self_rebuild",
  string
> = {
  successor_right: "승계취득한 조합원입주권으로 완공된 주택",
  original_member_house: "원조합원 기존주택을 재개발·재건축한 주택",
  original_member_non_house: "원조합원(상가·토지)으로 완공된 주택",
  presale: "분양권으로 취득한 주택",
  self_rebuild: "보유 주택을 헐고 다시 지은 주택",
};

const SEQUENTIAL_AUTHORITIES = "서면-2021-법규재산-6773 · 기획재정부 재산세제과-1181 · 서면-2021-부동산-2376";

function sequentialReason(label: string, R: Date, P: Date): string {
  return (
    `${label}의 권리를 종전주택 취득일(${fmt(P)})보다 앞선 ${fmt(R)}에 취득했습니다 — 권리를 종전주택보다 먼저 취득한 순차 사례는 ` +
    `일시적 2주택(${TRANSFER.TEMPORARY_TWO_HOUSE}①)으로 보지 않는다는 해석이 있어 적용하지 않습니다(${SEQUENTIAL_AUTHORITIES}).`
  );
}

function sameDayConfirm(label: string, R: Date): string {
  return (
    `${label}의 권리 취득일(${fmt(R)})이 종전주택 취득일과 같은 날이라 어느 쪽이 먼저인지 알 수 없어 ` +
    `일시적 2주택(${TRANSFER.TEMPORARY_TWO_HOUSE}①)으로 보지 않았습니다(확인 필요).`
  );
}

/**
 * §155① 종전·신규 주택의 **취득 선후**가 맞지 않을 때의 사유(`judgeTemporaryTwoHouseTiming`의 `acquiredInOrder` 거짓) — 요건 표 note와
 * 미충족 특례 사유가 같은 문장을 쓴다. 같은 날이면 어느 쪽이 먼저인지 알 수 없어 확인 필요를 붙인다(위 `sameDayConfirm`과 같은 규칙 · 결정 Q-1).
 */
export function temporaryTwoHouseOrderReason(previous: Date, next: Date): string {
  if (day(next) === day(previous)) {
    return (
      `신규주택을 종전주택과 같은 날(${fmt(next)}) 취득해 어느 쪽이 먼저인지 알 수 없어 ` +
      `일시적 2주택(${TRANSFER.TEMPORARY_TWO_HOUSE}①)으로 보지 않았습니다(확인 필요).`
    );
  }
  return (
    `신규주택(${fmt(next)} 취득)을 종전주택(${fmt(previous)} 취득)보다 먼저 취득했습니다 — 양도하는 주택이 나중에 취득한 주택이라 ` +
    `일시적 2주택(${TRANSFER.TEMPORARY_TWO_HOUSE}①)이 적용되지 않습니다. 1년 요건을 면제하는 사유가 있어도 같습니다(서면-2021-법규재산-6773 · 기획재정부 재산세제과-1181).`
  );
}

/** 신규 주택 경위 판정 — `oneYearWaived`는 §154① 단서로 「종전주택 취득 후 1년」이 면제되는가(`waivesPriorHouseOneYearGap`). */
export function judgeNewHouseOrigin(input: NewHouseOriginInput, oneYearWaived: boolean): NewHouseOriginVerdict {
  const tth = input.temporaryTwoHouse;
  const o = tth?.newHouseOrigin;
  if (!tth || !o) return PASS; // 키 없음 — 종전 동작(직접 호출·옛 기록)
  const P = tth.previousAcquisitionDate;

  /*
   * 혼인·동거봉양으로 합친 세대에서 고른 행이 권리로 취득한 주택이면 §156의2⑧⑨·§156의3⑥(합가 + 권리) 축이다 — 이번 범위 밖이라(평가셋 E065)
   * 결론을 조용히 내지 않고 판정 보류 + 확인 필요로 막는다(결정 #43 조건).
   */
  if ((input.marriageMerge || input.parentalCareMerge) && RIGHT_ORIGIN_KINDS.has(o.kind)) {
    return {
      ...PASS,
      blocked: true,
      unconfirmed: [
        `혼인·동거봉양으로 합친 세대에서 신규 주택이 ${NEW_HOUSE_ORIGIN_LABEL[o.kind as keyof typeof NEW_HOUSE_ORIGIN_LABEL]}입니다 — 합가와 권리(분양권·조합원입주권)가 겹친 경우(${TRANSFER.RIGHT_ONE_HOUSE_SPECIAL}⑧⑨·${TRANSFER.PRESALE_ONE_HOUSE_SPECIAL}⑥)는 이 판정이 다루지 않아 일시적 2주택(${TRANSFER.TEMPORARY_TWO_HOUSE}①)을 적용하지 않았습니다(확인 필요).`,
      ],
    };
  }

  switch (o.kind) {
    case "general":
      return PASS;

    case "not_collected":
      return {
        ...PASS,
        confirmNotes: [
          `신규 주택이 분양권·조합원입주권 등 권리로 취득한 주택인지 답하지 않았거나 이 경로에서 묻지 못했습니다 — 일시적 2주택(${TRANSFER.TEMPORARY_TWO_HOUSE}①)을 취득일 그대로 판정했으니, ` +
            "권리를 종전주택 취득 전에 취득했거나 입주권 승계 뒤 3년이 지났다면 적용되지 않을 수 있습니다(확인 필요).",
        ],
      };

    case "unknown":
      return {
        ...PASS,
        blocked: true,
        unconfirmed: [
          `신규 주택이 분양권·조합원입주권 등 권리로 취득한 주택인지 모른다고 답해(보유 주택 목록 행은 답하지 않은 경우 포함) 일시적 2주택(${TRANSFER.TEMPORARY_TWO_HOUSE}①)을 적용하지 않았습니다.`,
        ],
      };

    case "original_member_house":
    case "self_rebuild": {
      const label = NEW_HOUSE_ORIGIN_LABEL[o.kind];
      if (!o.rightAcquisitionDate) {
        return {
          ...PASS,
          blocked: true,
          unconfirmed: [
            `${label}의 ${o.kind === "self_rebuild" ? "헐기 전 주택" : "기존주택"} 취득일을 입력하지 않아 일시적 2주택(${TRANSFER.TEMPORARY_TWO_HOUSE}①)을 적용하지 않았습니다.`,
          ],
        };
      }
      // 기존주택의 연장이라 취득일 = 기존주택 취득일이다 — 날짜는 클라이언트가 `newAcquisitionDate`로 바꿔 실었다.
      return PASS;
    }

    case "presale": {
      const label = NEW_HOUSE_ORIGIN_LABEL.presale;
      const R = o.rightAcquisitionDate;
      if (!R) {
        return { ...PASS, blocked: true, unconfirmed: [`${label}의 분양권 취득일을 입력하지 않아 일시적 2주택(${TRANSFER.TEMPORARY_TWO_HOUSE}①)을 적용하지 않았습니다.`] };
      }
      // 분양권이 주택 수에 들지 않던 때(2021.1.1. 전 취득)는 완공일을 취득일로 보는 현행 §155①이 맞다.
      if (R.getTime() < NEW_HOUSE_ORIGIN_PRESALE_START.getTime()) return PASS;
      if (day(R) < day(P)) return { ...PASS, blocked: true, reasons: [sequentialReason(label, R, P)] };
      if (day(R) === day(P)) return { ...PASS, blocked: true, unconfirmed: [sameDayConfirm(label, R)] };
      // 종전주택 보유 중 취득한 분양권이 완공된 갈래 — §155①(완공일) 병용을 명시한 해석이 없고, 완공 후 양도를 §156의3으로만 본 회신이 있다.
      const strict = rightTimingCore(
        { ...input, acquisitionDate: P },
        oneYearWaived,
        pseudoRight("presale_right", R),
        R,
        undefined,
      );
      const strictPass = strict.status === "exception_met";
      if (o.holdingPresalePosition === "156_3") {
        return strictPass
          ? { ...PASS, holdingPresale: true, viaTimingClause: `${TRANSFER.PRESALE_ONE_HOUSE_SPECIAL}②·③` }
          : {
              ...PASS,
              blocked: true,
              holdingPresale: true,
              reasons: [
                `${label}를 종전주택 보유 중 취득했고(권리 취득일 ${fmt(R)}) 완공 후 양도라 ${TRANSFER.PRESALE_ONE_HOUSE_SPECIAL}②(권리 취득 후 1년·취득일부터 3년 이내 양도)·③의 요건으로 판정하면 충족하지 않습니다.`,
              ],
            };
      }
      return {
        ...PASS,
        holdingPresale: true,
        confirmNotes: strictPass
          ? []
          : [
              `${label}를 종전주택 보유 중 취득했습니다(권리 취득일 ${fmt(R)}) — 일시적 2주택(${TRANSFER.TEMPORARY_TWO_HOUSE}①)을 완공일 기준으로 판정했습니다. ` +
                `이 갈래에서 ①을 병용할 수 있다고 밝힌 해석은 확인하지 못했고, 완공 후 양도를 ${TRANSFER.PRESALE_ONE_HOUSE_SPECIAL}②·③으로만 본 회신이 있어 ` +
                "그 요건으로 판정하면 충족하지 않습니다(확인 필요).",
            ],
      };
    }

    case "successor_right":
    case "original_member_non_house": {
      const label = NEW_HOUSE_ORIGIN_LABEL[o.kind];
      const R = o.rightAcquisitionDate;
      if (!R) {
        return { ...PASS, blocked: true, unconfirmed: [`${label}의 ${o.kind === "original_member_non_house" ? "관리처분계획 인가일" : "입주권 승계취득일"}을 입력하지 않아 일시적 2주택(${TRANSFER.TEMPORARY_TWO_HOUSE}①)을 적용하지 않았습니다.`] };
      }
      if (!isOriginRedevRightCounted(o.kind, R, o.rightApprovalDate)) return PASS;
      if (day(R) < day(P)) return { ...PASS, blocked: true, reasons: [sequentialReason(label, R, P)] };
      if (day(R) === day(P)) return { ...PASS, blocked: true, unconfirmed: [sameDayConfirm(label, R)] };
      const r = rightTimingCore(
        { ...input, acquisitionDate: P },
        oneYearWaived,
        pseudoRight("redevelopment_right", R),
        R,
        undefined,
      );
      if (r.status === "exception_met") return { ...PASS, viaTimingClause: r.exception };
      const unconfirmed: string[] = [];
      if (r.undeclaredArticles?.length) {
        unconfirmed.push(
          `권리 취득일(${fmt(R)})부터 3년이 지났는데 3년 경과 예외(${r.undeclaredArticles.join("·")})를 선언하지 않아 일시적 2주택(${TRANSFER.TEMPORARY_TWO_HOUSE}①)을 적용하지 않았습니다(확인 필요).`,
        );
      }
      return {
        ...PASS,
        blocked: true,
        reasons: unconfirmed.length
          ? []
          : [
              `${label}는 종전주택 보유 중 입주권을 취득한 경우라 ${TRANSFER.RIGHT_ONE_HOUSE_SPECIAL}③(종전주택 취득 후 1년 뒤 입주권 취득 · 취득일부터 3년 이내 양도)·④의 요건으로 판정하는데 충족하지 않습니다.`,
            ],
        unconfirmed,
      };
    }
  }
}

/**
 * 승계 입주권·상가토지 원조합원 행의 권리가 §89②의 조합원입주권인가 — 법률 제7837호 부칙 §12:
 *   ① 2006.1.1. 이후 관리처분계획이 **인가된 분**부터 적용 · ② 그 전 인가분이라도 2006.1.1. 이후 **승계취득**하면 대상으로 본다.
 *
 * 🔑 입주권은 인가 뒤에만 생기므로 승계취득일 R이 2006.1.1. 전이면 인가도 그 전이다 — 인가일을 비워도 대상이 아니다(결정 #43 남김 1).
 *    인가일이 승계취득일보다 늦은 모순 입력은 ⑧(`newHouseOriginIssue`)이 막고, 엔진은 인가일 쪽을 그대로 읽는다.
 * 상가·토지 원조합원은 R이 곧 인가일이다. ⑤ 3년 경과 예외 칸 노출(`rightThreeYearExceptionRightKinds`)도 이 술어를 쓴다.
 */
export function isOriginRedevRightCounted(
  kind: "successor_right" | "original_member_non_house",
  R: Date,
  approvalDate: Date | undefined,
): boolean {
  const start = NEW_HOUSE_ORIGIN_REDEV_RIGHT_START.getTime();
  const approval = kind === "original_member_non_house" ? R : approvalDate;
  return R.getTime() >= start || (approval !== undefined && approval.getTime() >= start);
}

/**
 * 종전주택 보유 중 취득한 분양권이 완공된 갈래인가(2021.1.1. 이후 취득 · 종전주택 취득일보다 뒤) — 직접 해석이 없어 양론 대상이다.
 * 판정 메뉴 양론(`contested-issues.ts`)이 이 술어로 쟁점을 감지한다.
 */
export function isHoldingPresaleOrigin(tth: NonNullable<TransferTaxInput["temporaryTwoHouse"]>): boolean {
  const o = tth.newHouseOrigin;
  const R = o?.rightAcquisitionDate;
  return (
    o?.kind === "presale" &&
    R !== undefined &&
    R.getTime() >= NEW_HOUSE_ORIGIN_PRESALE_START.getTime() &&
    day(R) > day(tth.previousAcquisitionDate)
  );
}

function pseudoRight(type: PresaleRight["type"], acquisitionDate: Date): PresaleRight {
  return { id: "new-house-origin", type, acquisitionDate, region: "capital" };
}

/** 구 중과 배제 8호(2023.2.28. 전 양도분)는 이 갈래 분리를 적용하지 않는다 — 비과세와 결론이 엇갈릴 때 알리는 문장. */
export const OLD_CLAUSE_8_ORIGIN_DIVERGENCE_NOTE =
  "2023.2.28. 전 양도분에 쓰는 옛 중과 배제 조항(구 소득세법 시행령 §167의10①8호, 일시적 2주택)에는 신규 주택의 취득 경위에 따른 갈래 분리를 적용하지 않았습니다 — " +
  "옛 8호에도 순차 법리가 적용되는지 확인하지 못했습니다(확인 필요).";
