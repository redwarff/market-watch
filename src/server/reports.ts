import type { CompanyDate, ReportNote } from '@/lib/types';

type Dir = 'above' | 'below' | 'inline';

type ReleaseLike = {
  name: string;
  period: string;
  previous: string | null;
  actual: string | null;
  unit: string;
};

type Read = {
  means: Record<Dir, string>;
  influenced: Record<Dir, string>;
  lone: { means: string; influenced: string };
};

const READS: Record<string, Read> = {
  fomc_rate: {
    means: {
      above: 'The policy rate is higher than the prior decision. That is a tighter stance.',
      below: 'The policy rate is lower than the prior decision. That is an easier stance.',
      inline: 'The target was left unchanged. Markets then trade the statement and the path ahead, which this single number does not contain.',
    },
    influenced: {
      above:
        'A higher rate usually lifts Treasury yields and the dollar, and weighs on stocks priced on earnings far in the future. Banks reprice with the outlook for margins and credit. The statement can matter as much as the rate, and those words are not in this number.',
      below:
        'A lower rate usually pulls Treasury yields and the dollar down, and supports stocks priced on earnings far in the future. Banks reprice with the outlook for margins. The statement can matter as much as the rate.',
      inline:
        'A hold often moves markets less than a surprise hike or cut, unless the statement changes the path. Yields, the dollar, and rate-sensitive stocks are where that shows up.',
    },
    lone: {
      means: 'This is the federal funds decision. There is no prior rate in the row, so the figure alone does not say whether the Fed hiked, cut, or held.',
      influenced:
        'Yields, the dollar, and stock futures reprice on the decision and on the statement. Growth stocks and banks are usually the most sensitive.',
    },
  },
  fomc_dots: {
    means: {
      above: 'The published projection is higher than the prior one. That is a firmer path for policy.',
      below: 'The published projection is lower than the prior one. That is an easier path for policy.',
      inline: 'The published projection matched the prior one. The rest of the table, growth, unemployment, and inflation, can still have moved.',
    },
    influenced: {
      above:
        'A higher path for the policy rate usually lifts Treasury yields and the dollar, and weighs on stocks priced on earnings far in the future. Banks feel the path through net interest margins.',
      below:
        'A lower path usually pulls Treasury yields and the dollar down, and supports long-duration stocks. Banks feel the path through net interest margins.',
      inline:
        'An unchanged headline projection usually draws a smaller move. Yields still react if the rest of the forecast, or the spread of the dots, shifted.',
    },
    lone: {
      means: 'This is the Fed’s own forecast, including the dot plot for the policy rate. One figure does not show the whole table.',
      influenced:
        'A firmer path usually lifts yields and the dollar and weighs on long-duration stocks. A lower path does the reverse.',
    },
  },
  payrolls: {
    means: {
      above:
        'Hiring was stronger than the prior month. That is the firmer labor reading. Unemployment and wages come out in the same report and are not this headline number.',
      below:
        'Hiring was softer than the prior month. That is the cooler labor reading. Unemployment and wages come out in the same report and are not this headline number.',
      inline: 'Hiring matched the prior month. Unemployment and wages, in the same report, can still change the story.',
    },
    influenced: {
      above:
        'Stronger hiring tends to lift Treasury yields and the dollar, because it argues for a firmer Fed. Rate-sensitive growth stocks often fall on that mix. Consumer and cyclical companies move with what the report says about household income.',
      below:
        'Softer hiring tends to pull Treasury yields and the dollar down. Rate-sensitive growth stocks often get relief. Consumer and cyclical companies can lag if the report points to weaker household income.',
      inline:
        'An unchanged payrolls print usually moves markets less, unless wages or unemployment surprise. Yields and the dollar are still the first places a surprise shows up.',
    },
    lone: {
      means: 'This is the monthly change in employment. There is no prior month in the row to compare it with, and wages are a separate line in the same report.',
      influenced:
        'A strong jobs print tends to lift yields and the dollar and weigh on rate-sensitive stocks. A weak one does the reverse.',
    },
  },
  claims: {
    means: {
      above: 'More people filed for unemployment than the week before. That is the weaker labor reading, and a one-week change is noisy.',
      below: 'Fewer people filed for unemployment than the week before. That is the firmer labor reading, and a one-week change is noisy.',
      inline: 'Filings were unchanged from the prior week. On this noisy weekly count, layoffs did not shift.',
    },
    influenced: {
      above:
        'A single higher week rarely moves yields or stocks. A run of higher claims is read as a cooling labor market, which tends to pull Treasury yields down and help bonds. Consumer and cyclical stocks follow the growth reading more than one print.',
      below:
        'A single lower week rarely moves yields or stocks. A run of lower claims is read as a tighter labor market and can support Treasury yields.',
      inline: 'An unchanged claims print usually passes without a market move.',
    },
    lone: {
      means: 'This is new unemployment filings for the week. There is no prior week in the row, and one week is a noisy read on layoffs.',
      influenced: 'Claims move markets when they break a trend. One print on its own rarely resets yields or stocks.',
    },
  },
  jolts: {
    means: {
      above:
        'The headline was higher than the prior reading. If that headline is openings or quits, it points to a tighter labor market. The survey lags the month it describes and is revised often.',
      below:
        'The headline was lower than the prior reading. A drop in openings is read as less demand for workers. The survey lags and is revised often.',
      inline: 'The headline matched the prior reading. The survey is revised often, so a flat print rarely changes the labor story.',
    },
    influenced: {
      above: 'A jump in openings can support Treasury yields. Index futures usually move less than they do on payrolls day unless the surprise is large.',
      below: 'A sharp drop in openings can pull Treasury yields down. Index futures usually move less than they do on payrolls day unless the surprise is large.',
      inline: 'A flat JOLTS print rarely moves index futures.',
    },
    lone: {
      means: 'This is the job-openings survey. There is no prior reading in the row, and the figures lag the month they describe.',
      influenced: 'A large surprise in openings can nudge yields. The reaction is usually smaller than on payrolls day.',
    },
  },
  cpi: {
    means: {
      above: 'Inflation was hotter than the prior print.',
      below: 'Inflation was cooler than the prior print.',
      inline: 'Consumer prices matched the prior print.',
    },
    influenced: {
      above:
        'A hotter CPI usually lifts Treasury yields and the dollar. Stocks priced on distant earnings, including much of big tech, often fall when yields jump. Housing-related and other rate-sensitive names move with that yield reaction.',
      below:
        'A cooler CPI tends to pull Treasury yields and the dollar down, and to take pressure off stocks priced on distant earnings, including much of big tech. Housing-related names move with the yield reaction.',
      inline:
        'A CPI print that matches the last one usually produces a smaller move, unless the market had been leaning the other way. Yields, the dollar, and rate-sensitive stocks are still where it shows.',
    },
    lone: {
      means: 'This is the consumer inflation print. There is no prior print in the row to say whether inflation sped up or cooled. Core CPI, which leaves out food and energy, is a separate line.',
      influenced: 'Hotter inflation usually lifts yields and the dollar and weighs on long-duration stocks. A cooler print does the reverse.',
    },
  },
  ppi: {
    means: {
      above: 'Producer prices were hotter than the prior print. That can reach consumer prices or squeeze margins later.',
      below: 'Producer prices were cooler than the prior print.',
      inline: 'Producer prices matched the prior print.',
    },
    influenced: {
      above:
        'Hot producer prices can lift Treasury yields if traders expect them to reach CPI. They also squeeze firms that cannot pass the cost on, which shows up in industrials, materials, and later in retailers.',
      below:
        'Cooler producer prices ease the inflation worry and the pressure on margins. Yields can slip, and industrials, materials, and retailers get some relief if costs stop rising.',
      inline: 'An unchanged PPI print usually draws a small reaction. Yields move when the print changes the CPI outlook.',
    },
    lone: {
      means: 'This is prices received by US producers, upstream of CPI. There is no prior print in the row.',
      influenced: 'A hot print can lift yields and squeeze margins. A tame print eases that pressure.',
    },
  },
  pce: {
    means: {
      above: 'The print was higher than the prior one. If this line is the PCE price index, that is the hotter inflation reading, and it is the gauge the Fed emphasizes.',
      below: 'The print was lower than the prior one. If this line is the PCE price index, that is the cooler inflation reading.',
      inline: 'The print matched the prior one. Spending and income, in the same release, can still change the consumer story.',
    },
    influenced: {
      above:
        'A hotter PCE reading lifts Treasury yields and the dollar and weighs on long-duration stocks. The spending figures in the same release matter for retailers, travel, and other consumer businesses.',
      below:
        'A cooler PCE reading tends to pull yields and the dollar down and relieve long-duration stocks. Softer spending in the same release weighs on retailers and other consumer businesses.',
      inline: 'A PCE print in line with the last one usually moves markets less. Yields still react if the spending half of the release surprises.',
    },
    lone: {
      means: 'This release covers income, spending, and the PCE price index. One figure does not show all three, and there is no prior print in the row.',
      influenced: 'The inflation line moves yields, the dollar, and long-duration stocks. The spending line moves consumer businesses.',
    },
  },
  retail: {
    means: {
      above: 'Goods demand was firmer than the month before. The series is mostly goods, not services.',
      below: 'Goods demand was softer than the month before. The series is mostly goods, not services.',
      inline: 'Goods demand matched the prior month’s pace. The series is mostly goods, not services.',
    },
    influenced: {
      above:
        'A stronger retail print supports retailers, consumer discretionary, and payment networks, and can lift Treasury yields if demand looks too hot for the Fed.',
      below:
        'A softer retail print tends to cool the growth story. Yields and the dollar often ease a little, and retailers and other consumer stocks can lag. Service companies are only an indirect read.',
      inline: 'An unchanged pace rarely moves the broader market. Retailers still trade on whether that pace of demand holds.',
    },
    lone: {
      means: 'This is the monthly change in retail and food-service sales, mostly goods. There is no prior month in the row.',
      influenced: 'A strong print supports retailers and can lift yields. A weak print does the reverse.',
    },
  },
  ip: {
    means: {
      above: 'Output was firmer than the prior month. That covers factories, mines, and utilities.',
      below: 'Output was softer than the prior month. That covers factories, mines, and utilities.',
      inline: 'Output matched the prior month’s pace.',
    },
    influenced: {
      above: 'A firmer production print supports industrials, materials, and freight, and can nudge Treasury yields up if growth looks stronger.',
      below:
        'A decline weighs on industrials, materials, and freight. It can also pull yields down, which sometimes helps growth stocks even as the industrial names lag.',
      inline: 'A flat production print rarely moves the indexes. Industrials still trade on whether output is holding up.',
    },
    lone: {
      means: 'This is the monthly change in industrial output. There is no prior month in the row.',
      influenced: 'Industrials, materials, and freight are the closest links. A weak print can still help growth stocks if yields fall.',
    },
  },
  housing: {
    means: {
      above: 'More homes broke ground than in the prior month. Permits are in the same release and are not this headline starts figure.',
      below: 'Fewer homes broke ground than in the prior month. Permits are in the same release and are not this headline starts figure.',
      inline: 'Starts matched the prior month. Permits, in the same release, can still have shifted.',
    },
    influenced: {
      above:
        'A jump in starts helps homebuilders, building products, and housing retail. If traders also read it as stronger demand, yields can rise, which then works against the builders through mortgage rates.',
      below:
        'A drop in starts weighs on homebuilders, building products, and housing retail. Yields can ease if the drop is read as weaker demand, which takes a little pressure off mortgage rates.',
      inline: 'An unchanged starts print rarely moves the group. Homebuilders still trade on mortgage rates.',
    },
    lone: {
      means: 'This is housing starts, homes that broke ground. There is no prior month in the row, and permits are a separate line.',
      influenced: 'Homebuilders and building products are the direct link. Mortgage rates can matter as much as the count.',
    },
  },
  durable: {
    means: {
      above:
        'Orders rose versus the prior month. Aircraft can dominate the headline, so a broad investment story needs the ex-transportation lines, which are not separated here.',
      below:
        'Orders fell versus the prior month. Aircraft can dominate the headline, so the drop may be one category rather than a broad cut in investment.',
      inline: 'Orders matched the prior month. The ex-transportation lines can still have moved.',
    },
    influenced: {
      above:
        'A broad rise in orders supports machinery, industrials, and aircraft suppliers, and can nudge yields up. A headline move that is only aircraft is often faded.',
      below:
        'A broad drop weighs on machinery and industrials and can pull yields down. A drop that is only aircraft is often faded.',
      inline: 'A flat durable-goods headline rarely moves index futures.',
    },
    lone: {
      means: 'This is new orders for long-lived goods. There is no prior month in the row, and aircraft can swamp the headline.',
      influenced: 'Machinery, industrials, and aircraft suppliers are the usual links. A move that is only aircraft is often faded.',
    },
  },
  gdp: {
    means: {
      above: 'Output was firmer than the prior figure in this row. Later estimates revise the same quarter, so this may not be the last word.',
      below: 'Output was softer than the prior figure in this row. Later estimates revise the same quarter, so this may not be the last word.',
      inline: 'Output matched the prior figure. A later estimate can still revise the quarter.',
    },
    influenced: {
      above:
        'A firmer GDP print can lift Treasury yields and cyclical stocks. Index futures often react more to what the number implies for the Fed than to the growth figure alone.',
      below:
        'A softer GDP print can pull Treasury yields down and weigh on cyclical stocks. Index futures often react more to the Fed implication than to the growth figure alone.',
      inline: 'An unrevised growth figure usually draws a small reaction unless the composition of the quarter changed.',
    },
    lone: {
      means: 'This is the broad measure of US output for the quarter. There is no prior figure in the row, and later estimates revise it.',
      influenced: 'A large surprise moves yields and cyclical stocks. Futures often trade the Fed implication as much as the growth number.',
    },
  },
  homes: {
    means: {
      above: 'More new homes went under contract than in the prior month. The series is volatile and often revised.',
      below: 'Fewer new homes went under contract than in the prior month. The series is volatile and often revised.',
      inline: 'New-home sales matched the prior month. The series is volatile and often revised.',
    },
    influenced: {
      above: 'A higher sales count helps homebuilders and housing retail. Mortgage rates and any yield reaction can matter as much as the count.',
      below: 'A lower sales count weighs on homebuilders and housing retail. Yields can ease if demand looks softer.',
      inline: 'A flat sales count rarely moves the group on its own.',
    },
    lone: {
      means: 'This is signed contracts for new single-family homes. There is no prior month in the row.',
      influenced: 'Homebuilders are the direct link. Mortgage rates can matter as much as the sales count.',
    },
  },
  auction: {
    means: {
      above: 'Investors demanded a higher yield than at the prior auction in this row. That is the weaker bidding result.',
      below: 'Investors accepted a lower yield than at the prior auction in this row. That is the stronger bidding result.',
      inline: 'The high yield matched the prior auction in this row.',
    },
    influenced: {
      above: 'A higher auction yield can push that part of the yield curve up and weigh on rate-sensitive stocks the same day.',
      below: 'A lower auction yield is a quieter or slightly supportive read for that part of the curve and for rate-sensitive stocks.',
      inline: 'A high yield in line with the last similar auction usually passes quietly.',
    },
    lone: {
      means: 'This is the high yield investors accepted, not a statistical print about growth or inflation. There is no prior auction in the row.',
      influenced:
        'A routine result usually passes quietly. A yield that looks high versus similar recent notes can push that part of the curve up and weigh on rate-sensitive stocks the same day.',
    },
  },
  county: {
    means: {
      above: 'The local estimate was higher than the prior figure. It describes where growth happened, long after the national GDP release.',
      below: 'The local estimate was lower than the prior figure. It describes where growth happened, long after the national GDP release.',
      inline: 'The local estimate matched the prior figure. It is background for regional economies.',
    },
    influenced: {
      above: 'National yields, the dollar, and stock indexes almost never reprice on a county release.',
      below: 'National yields, the dollar, and stock indexes almost never reprice on a county release.',
      inline: 'National yields, the dollar, and stock indexes almost never reprice on a county release.',
    },
    lone: {
      means: 'This is a local estimate of output or income, published long after the national GDP release.',
      influenced: 'National yields, the dollar, and stock indexes almost never reprice on a county release.',
    },
  },
};

const GENERIC: Read = {
  means: {
    above: 'The print was higher than the previous one. For this series, that is the stronger reading.',
    below: 'The print was lower than the previous one. For this series, that is the softer reading.',
    inline: 'The print matched the previous one.',
  },
  influenced: {
    above:
      'A stronger print can lift Treasury yields when it changes the growth or inflation picture, and it tends to help the companies most tied to this part of the economy.',
    below:
      'A softer print can pull Treasury yields down and weigh on the companies most tied to this part of the economy. Rate-sensitive stocks sometimes get relief from the lower-yield reading.',
    inline: 'A print in line with the last one usually draws a smaller reaction in yields and in the companies tied to the release.',
  },
  lone: {
    means: 'The agency has published the print. There is no previous figure in the row to compare it with.',
    influenced:
      'High-impact releases can move Treasury yields, the dollar, and stock futures around the number. A single company moves when the surprise changes the outlook for rates, demand, or its costs.',
  },
};

/** A concise read of a release that already has a print. Upcoming releases return null. */
export function summarizeRelease(release: ReleaseLike): ReportNote | null {
  if (release.actual == null) return null;
  const dir = direction(release.actual, release.previous);
  const read = READS[kindOf(release.name)] ?? GENERIC;
  const line = dir === 'lone' ? read.lone : { means: read.means[dir], influenced: read.influenced[dir] };
  return {
    happened: happenedLine(release),
    means: line.means,
    influenced: line.influenced,
  };
}

export function describeCompanyDate(
  date: CompanyDate,
  days: number,
): { about: string; affects: string; report: ReportNote | null } {
  if (date.kind === 'ex_dividend') {
    return {
      about:
        'The first trading day on which a buyer of the shares does not receive the upcoming dividend. Shareholders of record before that point keep the payment.',
      affects:
        'The share price often opens lower by about the dividend, separate from company news. Income funds and dividend strategies care about the date. It is not a report on the business.',
      report: null,
    };
  }
  if (date.kind === 'dividend') {
    return {
      about: 'The day the company pays the dividend to the shareholders entitled to it.',
      affects:
        'Cash leaves the company and arrives in those accounts. The share price usually adjusted on the ex-dividend date, not on the pay date.',
      report: null,
    };
  }
  const print = parseEarnings(date.detail);
  if (print) {
    return {
      about: '',
      affects: '',
      report: earningsReport(print, date.when),
    };
  }
  const pending = days < 0;
  return {
    about: pending
      ? 'The quarterly report of earnings per share and revenue, often with an outlook for the next quarter. The figures for this print are not in the feed yet.'
      : 'The quarterly report of earnings per share and revenue, often with an outlook for the next quarter. Until the company confirms the day, the date can be an estimate.',
    affects: earningsAffects(date.when, false),
    report: null,
  };
}

function happenedLine(release: ReleaseLike): string {
  const now = printed(release.actual || '', release.unit);
  const name = release.period ? `${release.name}, ${release.period}` : release.name;
  if (release.previous == null) return `${name} came in at ${now}.`;
  return `${name} came in at ${now}, after ${printed(release.previous, release.unit)} previously.`;
}

function printed(value: string, unit: string): string {
  const number = Number(value);
  if (/thousands/i.test(unit) && Number.isFinite(number)) {
    return Math.round(number * 1000).toLocaleString('en-US');
  }
  const shown = Number.isFinite(number)
    ? number.toLocaleString('en-US', { maximumFractionDigits: Math.abs(number) >= 100 ? 1 : 2 })
    : value.trim();
  if (!unit) return shown;
  if (unit.startsWith('%')) return `${shown}${unit}`;
  return `${shown} (${unit})`;
}

function direction(actual: string, previous: string | null): Dir | 'lone' {
  if (previous == null) return 'lone';
  const left = Number(actual);
  const right = Number(previous);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return 'lone';
  if (left === right) return 'inline';
  return left > right ? 'above' : 'below';
}

function kindOf(name: string): string {
  const tests: [RegExp, string][] = [
    [/summary of economic projections|economic projections/i, 'fomc_dots'],
    [/fomc minutes/i, 'fomc_minutes'],
    [/beige book/i, 'beige'],
    [/fomc rate/i, 'fomc_rate'],
    [/nonfarm|employment situation/i, 'payrolls'],
    [/jobless claims/i, 'claims'],
    [/jolts/i, 'jolts'],
    [/^cpi\b|consumer price index/i, 'cpi'],
    [/^ppi\b|producer price index/i, 'ppi'],
    [/gdp by county|personal income by county/i, 'county'],
    [/personal income|pce/i, 'pce'],
    [/retail sales/i, 'retail'],
    [/industrial production/i, 'ip'],
    [/housing starts|building permits/i, 'housing'],
    [/durable goods/i, 'durable'],
    [/\bgdp\b/i, 'gdp'],
    [/new home sales/i, 'homes'],
    [/treasury auction/i, 'auction'],
  ];
  for (const [test, kind] of tests) {
    if (test.test(name)) return kind;
  }
  return 'other';
}

type EarningsPrint = {
  epsActual: number;
  epsEstimate: number;
  epsActualText: string;
  epsEstimateText: string;
  revActualText: string | null;
  revEstimateText: string | null;
  revActual: number | null;
  revEstimate: number | null;
};

function parseEarnings(detail: string): EarningsPrint | null {
  const eps = detail.match(/EPS\s+(-?[\d,.\u2212]+)\s+vs\s+(-?[\d,.\u2212]+)\s+est\./);
  if (!eps) return null;
  const epsActual = parseFigure(eps[1]);
  const epsEstimate = parseFigure(eps[2]);
  if (epsActual == null || epsEstimate == null) return null;
  const revVersus = detail.match(/Rev\s+(-?[\d,.\u2212]+[TBMK]?)\s+vs\s+(-?[\d,.\u2212]+[TBMK]?)\s+est\./i);
  const revOnly = detail.match(/Rev\s+(-?[\d,.\u2212]+[TBMK]?)/i);
  const revActualText = revVersus?.[1] ?? revOnly?.[1] ?? null;
  const revEstimateText = revVersus?.[2] ?? null;
  return {
    epsActual,
    epsEstimate,
    epsActualText: eps[1],
    epsEstimateText: eps[2],
    revActualText,
    revEstimateText,
    revActual: revActualText ? parseFigure(revActualText) : null,
    revEstimate: revEstimateText ? parseFigure(revEstimateText) : null,
  };
}

function parseFigure(raw: string): number | null {
  const match = raw.replace(/\u2212/g, '-').replace(/,/g, '').match(/^(-?\d+(?:\.\d+)?)([TBMK])?$/i);
  if (!match) return null;
  const size = match[2]?.toUpperCase();
  const mult = size === 'T' ? 1e12 : size === 'B' ? 1e9 : size === 'M' ? 1e6 : size === 'K' ? 1e3 : 1;
  const number = Number(match[1]) * mult;
  return Number.isFinite(number) ? number : null;
}

function earningsReport(print: EarningsPrint, when: CompanyDate['when']): ReportNote {
  const epsSide = side(print.epsActual, print.epsEstimate);
  const revSide = print.revActual != null && print.revEstimate != null ? side(print.revActual, print.revEstimate) : null;
  const revenue = print.revEstimateText
    ? `Revenue was ${print.revActualText}, against an estimate of ${print.revEstimateText}.`
    : print.revActualText
      ? `Revenue was ${print.revActualText}.`
      : '';
  return {
    happened: `Earnings per share were ${print.epsActualText}, against an estimate of ${print.epsEstimateText}. ${revenue}`.trim(),
    means: earningsMeans(epsSide, revSide),
    influenced: earningsAffects(when, true, epsSide, revSide),
  };
}

function side(actual: number, estimate: number): Dir {
  const scale = Math.max(Math.abs(actual), Math.abs(estimate), 1);
  if (Math.abs(actual - estimate) / scale < 0.005) return 'inline';
  return actual > estimate ? 'above' : 'below';
}

function earningsMeans(eps: Dir, rev: Dir | null): string {
  if (rev == null) {
    if (eps === 'above') {
      return 'Profit came in ahead of the estimate. That is a stronger quarter than analysts had penciled in. The outlook that came with the report is not in this figure, and it often matters as much as the quarter itself.';
    }
    if (eps === 'below') {
      return 'Profit came in short of the estimate. That is a weaker quarter than analysts had penciled in. The outlook that came with the report is not in this figure.';
    }
    return 'Profit landed on the estimate. The outlook that came with the report is not in this figure, and it is often what the stock trades on.';
  }
  if (eps === 'above' && rev === 'above') {
    return 'Both profit and revenue came in ahead of the estimates. That is a stronger quarter than analysts had penciled in. The outlook is not in these two figures, and it often matters as much as the quarter itself.';
  }
  if (eps === 'below' && rev === 'below') {
    return 'Both profit and revenue came in short of the estimates. That is a weaker quarter than analysts had penciled in. The outlook is not in these two figures.';
  }
  if (eps === 'above' && rev === 'below') {
    return 'Profit beat the estimate, while revenue came in short. The mix, and any outlook, usually decides which number the stock trades on.';
  }
  if (eps === 'below' && rev === 'above') {
    return 'Profit missed the estimate, while revenue came in ahead. Sales were firmer than expected and profit was not.';
  }
  if (eps === 'inline' && rev === 'inline') return 'Profit and revenue both landed on the estimates.';
  if (eps === 'inline' && rev === 'above') return 'Profit landed on the estimate, and revenue came in ahead. The outlook is not in these figures.';
  if (eps === 'inline' && rev === 'below') return 'Profit landed on the estimate, and revenue came in short. The outlook is not in these figures.';
  if (eps === 'above' && rev === 'inline') return 'Profit beat the estimate, and revenue landed on it. The outlook is not in these figures.';
  return 'Profit missed the estimate, and revenue landed on it. The outlook is not in these figures.';
}

function earningsAffects(when: CompanyDate['when'], published: boolean, eps?: Dir, rev?: Dir | null): string {
  const session =
    when === 'after_close'
      ? 'The first full reaction is usually in after-hours trading and the next regular session.'
      : when === 'before_open'
        ? 'The first full reaction is usually before the open and in the regular session that follows.'
        : 'The shares usually move in the session that follows the release.';
  if (!published) {
    return `${session} Close competitors can move with them. A result near the estimates can still move the stock if the outlook changes.`;
  }
  const split = (eps === 'above' && rev === 'below') || (eps === 'below' && rev === 'above');
  if (split) {
    return `${session} A split result is often choppy. The stock and its closest peers usually move on whichever line, profit or sales, the market decides matters more, and on the outlook.`;
  }
  if (eps === 'below' || rev === 'below') {
    return `${session} A miss tends to weigh on the shares and can spill over to close competitors. A stronger outlook can offset a weak quarter.`;
  }
  if (eps === 'above' || rev === 'above') {
    return `${session} A beat tends to lift the shares and can carry suppliers and competitors. The stock can still fall if the outlook disappoints.`;
  }
  return `${session} A result on the estimates can still move the shares if the outlook changes. Peers usually move less than they do on a clear beat or miss.`;
}
