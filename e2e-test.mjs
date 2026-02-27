/**
 * The 1s Vlog. - Puppeteer E2E テスト
 * 
 * 使い方:
 *   1. npm run dev でVite開発サーバーを起動
 *   2. npm run test:e2e でテストを実行
 * 
 * テスト結果のスクリーンショットは ./screenshots/ に保存されます
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const BASE_URL = 'http://localhost:3000';
const TIMEOUT = 10000;

// テスト結果カウンター
let passed = 0;
let failed = 0;
const errors = [];

// ── ユーティリティ ──────────────────────────────

function ensureScreenshotDir() {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
        fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }
}

async function screenshot(page, name) {
    await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `${name}.png`),
        fullPage: true,
    });
}

function log(icon, msg) {
    console.log(`  ${icon} ${msg}`);
}

async function assert(testName, fn) {
    try {
        await fn();
        passed++;
        log('✅', testName);
    } catch (err) {
        failed++;
        errors.push({ testName, error: err.message });
        log('❌', `${testName} — ${err.message}`);
    }
}

// ── テスト本体 ──────────────────────────────────

async function run() {
    ensureScreenshotDir();
    console.log('\n🎬 The 1s Vlog. — E2E テスト開始\n');

    // コンソールエラーを収集
    const consoleErrors = [];

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 430, height: 932 }); // iPhone 14 Pro Max相当

    // コンソールログ監視
    page.on('console', (msg) => {
        if (msg.type() === 'error') {
            consoleErrors.push(msg.text());
        }
    });

    // ページロードエラー監視
    page.on('pageerror', (err) => {
        consoleErrors.push(`[PageError] ${err.message}`);
    });

    // ──────────────────────────────────────
    // 1. ページの正常読み込み
    // ──────────────────────────────────────
    console.log('📋 1. ページ読み込みテスト');

    await assert('ページが正常に読み込まれる', async () => {
        const response = await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: TIMEOUT });
        if (!response || !response.ok()) {
            throw new Error(`HTTP ${response?.status()} — ページの読み込みに失敗`);
        }
    });

    await screenshot(page, '01_initial_load');

    await assert('コンソールにエラーがない', async () => {
        // React DevTools等の無害なメッセージは除外
        const realErrors = consoleErrors.filter(
            (e) => !e.includes('DevTools') && !e.includes('favicon') && !e.includes('404')
        );
        if (realErrors.length > 0) {
            throw new Error(`コンソールエラー: ${realErrors.join(', ')}`);
        }
    });

    // ──────────────────────────────────────
    // 2. ヘッダーの表示確認
    // ──────────────────────────────────────
    console.log('\n📋 2. ヘッダー表示テスト');

    await assert('アプリタイトル「The 1s Vlog.」が表示される', async () => {
        const header = await page.$('header h1');
        if (!header) throw new Error('ヘッダーのh1が見つからない');
        const text = await page.evaluate((el) => el.textContent, header);
        if (!text.includes('The 1s Vlog')) {
            throw new Error(`タイトルが不正: "${text}"`);
        }
    });

    await assert('「Free Edition」バッジが表示される', async () => {
        const badge = await page.evaluate(() => {
            const els = document.querySelectorAll('header div');
            for (const el of els) {
                if (el.textContent.trim() === 'Free Edition') return true;
            }
            return false;
        });
        if (!badge) throw new Error('Free Editionバッジが見つからない');
    });

    // ──────────────────────────────────────
    // 3. プレビュー領域の確認
    // ──────────────────────────────────────
    console.log('\n📋 3. プレビュー領域テスト');

    await assert('Canvasプレビューが描画されている', async () => {
        const canvas = await page.$('canvas');
        if (!canvas) throw new Error('canvas要素が見つからない');
        const box = await canvas.boundingBox();
        if (!box || box.width === 0 || box.height === 0) {
            throw new Error('canvasのサイズが0');
        }
    });

    await assert('再生ボタンが表示されている', async () => {
        // プレビューエリア内の再生オーバーレイ
        const playOverlay = await page.$('.aspect-video div[class*="cursor-pointer"]');
        if (!playOverlay) throw new Error('再生オーバーレイが見つからない');
    });

    await assert('タイムカウンターが「0.0s / 0.0s」を表示', async () => {
        const timeText = await page.evaluate(() => {
            const els = document.querySelectorAll('div');
            for (const el of els) {
                if (el.textContent.match(/0\.0s\s*\/\s*0\.0s/)) return el.textContent.trim();
            }
            return null;
        });
        if (!timeText) throw new Error('タイムカウンターが見つからない');
    });

    // ──────────────────────────────────────
    // 4. タイトル設定パネルのテスト
    // ──────────────────────────────────────
    console.log('\n📋 4. タイトル設定パネルテスト');

    await assert('「Title Settings」ボタンが存在する', async () => {
        const btn = await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (const b of buttons) {
                if (b.textContent.includes('Title Settings')) return true;
            }
            return false;
        });
        if (!btn) throw new Error('Title Settingsボタンが見つからない');
    });

    await assert('Title Settingsをクリックするとパネルが開く', async () => {
        // Title Settingsボタンをクリック
        await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (const b of buttons) {
                if (b.textContent.includes('Title Settings')) { b.click(); return; }
            }
        });
        await page.waitForSelector('input[placeholder*="タイトル"]', { timeout: 3000 });
    });

    await screenshot(page, '02_title_panel_open');

    await assert('タイトルテキストを入力できる', async () => {
        const input = await page.$('input[placeholder*="タイトル"]');
        if (!input) throw new Error('タイトル入力欄が見つからない');
        await input.click({ clickCount: 3 }); // 既存テキストを選択
        await input.type('My Vlog Test');
        const value = await page.evaluate((el) => el.value, input);
        if (value !== 'My Vlog Test') {
            throw new Error(`入力値が不正: "${value}"`);
        }
    });

    await assert('スタイル選択ボタンが6つ表示される', async () => {
        // "None", "Simple", "Minimal", "Camcorder", "Cinematic", "Magazine"
        const count = await page.evaluate(() => {
            const labels = ['None', 'Simple', 'Minimal', 'Camcorder', 'Cinematic', 'Magazine'];
            const buttons = document.querySelectorAll('button');
            let found = 0;
            for (const b of buttons) {
                if (labels.includes(b.textContent.trim())) found++;
            }
            return found;
        });
        if (count !== 6) throw new Error(`スタイルボタンの数が不正: ${count}/6`);
    });

    await assert('スタイルを「Cinematic」に切り替えられる', async () => {
        await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (const b of buttons) {
                if (b.textContent.trim() === 'Cinematic') { b.click(); return; }
            }
        });
        // 選択状態の確認（activeなボタンはbgがtext色になる）
        const isActive = await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (const b of buttons) {
                if (b.textContent.trim() === 'Cinematic') {
                    return b.className.includes('text-white') && b.className.includes('scale-105');
                }
            }
            return false;
        });
        if (!isActive) throw new Error('Cinematicスタイルが選択状態になっていない');
    });

    await screenshot(page, '03_title_cinematic');

    // ──────────────────────────────────────
    // 5. クリップ一覧のテスト
    // ──────────────────────────────────────
    console.log('\n📋 5. クリップ一覧テスト');

    await assert('Clipsヘッダーにカウント(0)が表示される', async () => {
        const text = await page.evaluate(() => {
            const headings = document.querySelectorAll('h2');
            for (const h of headings) {
                if (h.textContent.includes('Clips')) return h.textContent.trim();
            }
            return null;
        });
        if (!text || !text.includes('(0)')) {
            throw new Error(`クリップカウント不正: "${text}"`);
        }
    });

    await assert('空状態メッセージ「クリップがありません」が表示される', async () => {
        const msg = await page.evaluate(() => {
            const paragraphs = document.querySelectorAll('p');
            for (const p of paragraphs) {
                if (p.textContent.includes('クリップがありません')) return true;
            }
            return false;
        });
        if (!msg) throw new Error('空状態メッセージが見つからない');
    });

    // ──────────────────────────────────────
    // 6. FAB（アップロード）ボタンのテスト
    // ──────────────────────────────────────
    console.log('\n📋 6. FABボタンテスト');

    await assert('右下のFABボタン（+）が表示されている', async () => {
        const fab = await page.$('div[class*="fixed"][class*="bottom-6"]');
        if (!fab) throw new Error('FABボタンが見つからない');
        const box = await fab.boundingBox();
        if (!box || box.width === 0) throw new Error('FABボタンのサイズが0');
    });

    // ──────────────────────────────────────
    // 7. エクスポートボタンの状態テスト
    // ──────────────────────────────────────
    console.log('\n📋 7. エクスポートボタンテスト');

    await assert('クリップなしの状態で「動画を作成」ボタンがdisabledになる', async () => {
        const isDisabled = await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (const b of buttons) {
                if (b.textContent.includes('動画を作成')) return b.disabled;
            }
            return null;
        });
        if (isDisabled !== true) {
            throw new Error('動画作成ボタンがdisabledではない');
        }
    });

    await assert('再生ボタンがdisabledになる', async () => {
        const isDisabled = await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (const b of buttons) {
                // Play/Pauseアイコンのあるボタン（コントロール領域のもの）
                const svg = b.querySelector('svg');
                if (svg && b.closest('.flex.items-center.justify-between')) {
                    return b.disabled;
                }
            }
            return null;
        });
        if (isDisabled !== true) {
            throw new Error('再生ボタンがdisabledではない');
        }
    });

    await screenshot(page, '04_final_state');

    // ──────────────────────────────────────
    // 結果サマリー
    // ──────────────────────────────────────
    console.log('\n' + '─'.repeat(46));
    console.log(`\n🎬 テスト結果: ${passed} passed / ${failed} failed / ${passed + failed} total\n`);

    if (errors.length > 0) {
        console.log('❌ 失敗したテスト:');
        errors.forEach(({ testName, error }) => {
            console.log(`   • ${testName}: ${error}`);
        });
        console.log();
    }

    // コンソールエラーの最終レポート
    if (consoleErrors.length > 0) {
        console.log('⚠️  コンソールエラー一覧:');
        consoleErrors.forEach((e) => console.log(`   • ${e}`));
        console.log();
    }

    console.log(`📸 スクリーンショット: ${SCREENSHOT_DIR}\n`);

    await browser.close();

    // 失敗がある場合はexit code 1
    process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
    console.error('💥 テスト実行に失敗:', err.message);
    process.exit(1);
});
