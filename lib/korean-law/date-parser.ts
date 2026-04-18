/**
 * 자연어 날짜 범위 파서
 *
 * 한국어 쿼리에서 날짜 표현을 추출해 법제처 API의 fromDate/toDate 파라미터
 * (YYYYMMDD)로 변환하고, 추출된 날짜 표현을 제거한 쿼리를 돌려준다.
 *
 * 예:
 *   "최근 3년 양도세 중과"      → {fromDate: "20230101", toDate: <오늘>, cleanedQuery: "양도세 중과"}
 *   "2020년 이후 상속 판례"     → {fromDate: "20200101", cleanedQuery: "상속 판례"}
 *   "2020년부터 2023년 종부세"  → {fromDate: "20200101", toDate: "20231231", cleanedQuery: "종부세"}
 *   "작년 양도세"              → {fromDate/toDate 작년, cleanedQuery: "양도세"}
 *   "올해 상반기 취득세"        → {fromDate: "<올해>0101", toDate: "<올해>0630", cleanedQuery: "취득세"}
 *
 * upstream: chrisryugj/korean-law-mcp src/lib/date-parser.ts
 */

export interface DateRange {
  fromDate?: string;
  toDate?: string;
  cleanedQuery: string;
}

function today(): Date {
  // 시간대 안정성을 위해 UTC 일자만 사용. Vercel/로컬 모두 동일.
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function toYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function endOfYear(year: number): string {
  return `${year}1231`;
}

function startOfYear(year: number): string {
  return `${year}0101`;
}

/**
 * 자연어 날짜 범위 추출 (한 번의 패스로 모든 패턴 시도).
 *
 * 우선순위:
 *   1. 시작·끝 범위 ("2020년부터 2023년", "2020~2023")
 *   2. 이후/이전 ("2020년 이후", "2023년 이전")
 *   3. 상대 기간 ("최근 N년", "최근 N개월")
 *   4. 시기 키워드 ("작년", "올해", "지난달", "올해 상반기")
 *   5. 단일 연도 ("2020년 양도세")
 */
export function parseDateRange(query: string): DateRange {
  if (!query) return { cleanedQuery: "" };

  const now = today();
  const thisYear = now.getUTCFullYear();
  const thisMonth = now.getUTCMonth() + 1;
  const todayYmd = toYmd(now);

  let cleaned = query;
  let fromDate: string | undefined;
  let toDate: string | undefined;

  // 1. "YYYY년부터 YYYY년" / "YYYY~YYYY" / "YYYY-YYYY"
  const rangeMatch = cleaned.match(
    /(\d{4})\s*(?:년)?\s*(?:부터|~|-|에서|―|―)\s*(\d{4})\s*(?:년)?/
  );
  if (rangeMatch) {
    const y1 = parseInt(rangeMatch[1], 10);
    const y2 = parseInt(rangeMatch[2], 10);
    if (y1 >= 1900 && y2 >= y1 && y2 <= 2100) {
      fromDate = startOfYear(y1);
      toDate = endOfYear(y2);
      cleaned = cleaned.replace(rangeMatch[0], " ").trim();
    }
  }

  // 2. "YYYY년 이후", "YYYY년부터", "YYYY년 이래"
  if (!fromDate) {
    const afterMatch = cleaned.match(/(\d{4})\s*년\s*(?:이후|부터|이래|이상)/);
    if (afterMatch) {
      fromDate = startOfYear(parseInt(afterMatch[1], 10));
      cleaned = cleaned.replace(afterMatch[0], " ").trim();
    }
  }

  // 3. "YYYY년 이전", "YYYY년까지"
  if (!toDate) {
    const beforeMatch = cleaned.match(/(\d{4})\s*년\s*(?:이전|까지|까진|이하)/);
    if (beforeMatch) {
      toDate = endOfYear(parseInt(beforeMatch[1], 10));
      cleaned = cleaned.replace(beforeMatch[0], " ").trim();
    }
  }

  // 4. "최근 N년", "최근 N개월"
  if (!fromDate) {
    const recentYearMatch = cleaned.match(/최근\s*(\d+)\s*년/);
    if (recentYearMatch) {
      const n = parseInt(recentYearMatch[1], 10);
      if (n >= 1 && n <= 30) {
        fromDate = startOfYear(thisYear - n + 1);
        toDate = todayYmd;
        cleaned = cleaned.replace(recentYearMatch[0], " ").trim();
      }
    }
  }
  if (!fromDate) {
    const recentMonthMatch = cleaned.match(/최근\s*(\d+)\s*개?월/);
    if (recentMonthMatch) {
      const n = parseInt(recentMonthMatch[1], 10);
      if (n >= 1 && n <= 120) {
        const d = new Date(now);
        d.setUTCMonth(d.getUTCMonth() - n);
        fromDate = toYmd(d);
        toDate = todayYmd;
        cleaned = cleaned.replace(recentMonthMatch[0], " ").trim();
      }
    }
  }

  // 5. 시기 키워드
  if (!fromDate && !toDate) {
    const keywordRanges: Array<{ regex: RegExp; compute: () => [string, string] }> = [
      {
        regex: /올해\s*상반기/,
        compute: () => [`${thisYear}0101`, `${thisYear}0630`],
      },
      {
        regex: /올해\s*하반기/,
        compute: () => [`${thisYear}0701`, `${thisYear}1231`],
      },
      {
        regex: /작년\s*상반기/,
        compute: () => [`${thisYear - 1}0101`, `${thisYear - 1}0630`],
      },
      {
        regex: /작년\s*하반기/,
        compute: () => [`${thisYear - 1}0701`, `${thisYear - 1}1231`],
      },
      {
        regex: /재작년/,
        compute: () => [startOfYear(thisYear - 2), endOfYear(thisYear - 2)],
      },
      {
        regex: /작년/,
        compute: () => [startOfYear(thisYear - 1), endOfYear(thisYear - 1)],
      },
      {
        regex: /올해|금년|이번 ?해/,
        compute: () => [startOfYear(thisYear), todayYmd],
      },
      {
        regex: /지난달/,
        compute: () => {
          const prev = new Date(Date.UTC(thisYear, thisMonth - 2, 1));
          const endPrev = new Date(Date.UTC(thisYear, thisMonth - 1, 0));
          return [toYmd(prev), toYmd(endPrev)];
        },
      },
      {
        regex: /이번 ?달|이달/,
        compute: () => {
          const start = new Date(Date.UTC(thisYear, thisMonth - 1, 1));
          return [toYmd(start), todayYmd];
        },
      },
    ];
    for (const { regex, compute } of keywordRanges) {
      const m = cleaned.match(regex);
      if (m) {
        const [f, t] = compute();
        fromDate = f;
        toDate = t;
        cleaned = cleaned.replace(m[0], " ").trim();
        break;
      }
    }
  }

  // 6. 단일 연도 "YYYY년" — 양 끝 범위가 모두 아직 없을 때만
  if (!fromDate && !toDate) {
    const singleYearMatch = cleaned.match(/(\d{4})\s*년(?![가-힣])/);
    if (singleYearMatch) {
      const y = parseInt(singleYearMatch[1], 10);
      if (y >= 1900 && y <= 2100) {
        fromDate = startOfYear(y);
        toDate = endOfYear(y);
        cleaned = cleaned.replace(singleYearMatch[0], " ").trim();
      }
    }
  }

  // 정리
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return {
    fromDate,
    toDate,
    cleanedQuery: cleaned,
  };
}
