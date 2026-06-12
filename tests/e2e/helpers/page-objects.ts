import { type Page, type Locator } from '@playwright/test';

/**
 * MTN E2E Page Objects
 *
 * Encapsulate page-specific selectors and actions to reduce duplication
 * and improve test maintainability.
 */

// ─── Dashboard (Command Center) ───

export class DashboardPage {
  readonly page: Page;
  readonly marketToggleUS: Locator;
  readonly marketToggleKR: Locator;
  readonly nextActionLabel: Locator;
  readonly nextActionCta: Locator;
  readonly marketStateCard: Locator;
  readonly macroCard: Locator;
  readonly riskCard: Locator;
  readonly watchlistPanel: Locator;
  readonly recentTradesPanel: Locator;
  readonly flowLinks: Locator;

  constructor(page: Page) {
    this.page = page;
    this.marketToggleUS = page.locator('button:has-text("미국")');
    this.marketToggleKR = page.locator('button:has-text("한국")');
    this.nextActionLabel = page.locator('h2').filter({ hasText: /.+/ }).first();
    this.nextActionCta = page.locator('a:has-text("이동")');
    this.marketStateCard = page.locator('div').filter({ hasText: /^진입 가능 신호$/ }).locator('..').first();
    this.macroCard = page.locator('div').filter({ hasText: /^큰 흐름$/ }).locator('..').first();
    this.riskCard = page.locator('div').filter({ hasText: /^오픈 리스크$/ }).locator('..').first();
    this.watchlistPanel = page.locator('text=관심 후보').locator('..');
    this.recentTradesPanel = page.locator('text=최근 매매 흐름').locator('..');
    this.flowLinks = page.locator('a:has(span.font-mono)');
  }

  async goto() {
    await this.page.goto('/');
    await this.page.waitForLoadState('networkidle');
  }

  async switchMarket(market: 'US' | 'KR') {
    const btn = market === 'US' ? this.marketToggleUS : this.marketToggleKR;
    await btn.click();
  }
}

// ─── Scanner ───

export class ScannerPage {
  readonly page: Page;
  readonly scanButton: Locator;
  readonly stopButton: Locator;
  readonly progressBar: Locator;
  readonly filterButtons: Locator;
  readonly sortSelect: Locator;
  readonly selectedCount: Locator;
  readonly contestButton: Locator;
  readonly telegramButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.scanButton = page.locator('button:has-text("스캔 시작")');
    this.stopButton = page.locator('button:has-text("중단")');
    this.progressBar = page.locator('text=Scan Progress').locator('..');
    this.filterButtons = page.locator('button').filter({ hasText: /Recommended|Action|IB Review|전체/ });
    this.sortSelect = page.locator('select');
    this.selectedCount = page.locator('text=/Selected/');
    this.contestButton = page.locator('button:has-text("콘테스트로 이동"), a:has-text("콘테스트로 이동")');
    this.telegramButton = page.locator('button:has-text("텔레그램 전송")');
  }

  async goto() {
    await this.page.goto('/scanner');
    await this.page.waitForLoadState('domcontentloaded');
  }

  async getStatCardValue(label: string): Promise<string> {
    const card = this.page.locator(`text=${label}`).locator('..').locator('p.font-mono');
    return (await card.textContent()) ?? '';
  }
}

// ─── Plan ───

export class PlanPage {
  readonly page: Page;
  readonly tickerInput: Locator;
  readonly analyzeButton: Locator;
  readonly sepaSection: Locator;
  readonly vcpSection: Locator;
  readonly riskSection: Locator;
  readonly saveButton: Locator;
  readonly successBanner: Locator;
  readonly errorBanner: Locator;

  constructor(page: Page) {
    this.page = page;
    this.tickerInput = page.locator('input[placeholder*="ticker"], input[placeholder*="종목"]').first();
    this.analyzeButton = page.locator('button:has-text("분석"), button:has-text("Analyze")').first();
    this.sepaSection = page.locator('text=SEPA').first().locator('..').locator('..');
    this.vcpSection = page.locator('text=VCP').first().locator('..').locator('..');
    this.riskSection = page.locator('text=리스크');
    this.saveButton = page.locator('button:has-text("계획 저장")');
    this.successBanner = page.locator('text=계획 저장 완료');
    this.errorBanner = page.locator('[class*="red"]').filter({ hasText: /오류|실패|error/i });
  }

  async goto(params?: { ticker?: string; exchange?: string; autoAnalyze?: boolean }) {
    const searchParams = new URLSearchParams();
    if (params?.ticker) searchParams.set('ticker', params.ticker);
    if (params?.exchange) searchParams.set('exchange', params.exchange);
    if (params?.autoAnalyze) searchParams.set('autoAnalyze', '1');
    const qs = searchParams.toString();
    await this.page.goto(`/plan${qs ? `?${qs}` : ''}`);
    await this.page.waitForLoadState('domcontentloaded');
  }
}

// ─── Portfolio ───

export class PortfolioPage {
  readonly page: Page;
  readonly marketToggleUS: Locator;
  readonly marketToggleKR: Locator;
  readonly totalEquity: Locator;
  readonly cashMetric: Locator;
  readonly openRisk: Locator;
  readonly positionCards: Locator;
  readonly sectorBars: Locator;
  readonly warningBanners: Locator;

  constructor(page: Page) {
    this.page = page;
    this.marketToggleUS = page.locator('button:has-text("미국")');
    this.marketToggleKR = page.locator('button:has-text("한국")');
    this.totalEquity = page.locator('text=총 자산').locator('..').locator('p.font-mono');
    this.cashMetric = page.locator('text=현금').locator('..').locator('p.font-mono');
    this.openRisk = page.locator('text=오픈 리스크').locator('..').locator('p.font-mono');
    this.positionCards = page.locator('text=활성 포지션').locator('..').locator('..').locator('[class*="rounded-xl"]');
    this.sectorBars = page.locator('text=섹터 노출도').locator('..').locator('[class*="bg-emerald"]');
    this.warningBanners = page.locator('[class*="amber"]').filter({ hasText: /.+/ });
  }

  async goto() {
    await this.page.goto('/portfolio');
    await this.page.waitForLoadState('domcontentloaded');
  }
}

// ─── History ───

export class HistoryPage {
  readonly page: Page;
  readonly reviewTab: Locator;
  readonly statsTab: Locator;
  readonly marketToggleUS: Locator;
  readonly marketToggleKR: Locator;
  readonly tradeTable: Locator;

  constructor(page: Page) {
    this.page = page;
    this.reviewTab = page.locator('button:has-text("복기 목록")');
    this.statsTab = page.locator('button:has-text("성과 통계")');
    this.marketToggleUS = page.locator('button:has-text("미국")');
    this.marketToggleKR = page.locator('button:has-text("한국")');
    this.tradeTable = page.locator('table, [role="table"]').first();
  }

  async goto(params?: { market?: 'US' | 'KR'; view?: 'review' | 'stats' }) {
    const searchParams = new URLSearchParams();
    if (params?.market) searchParams.set('market', params.market);
    if (params?.view) searchParams.set('view', params.view);
    const qs = searchParams.toString();
    await this.page.goto(`/history${qs ? `?${qs}` : ''}`);
    await this.page.waitForLoadState('domcontentloaded');
  }
}
