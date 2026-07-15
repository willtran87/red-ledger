import { chromium } from 'playwright';
import fs from 'node:fs';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
fs.mkdirSync('output/responsive', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function inspectAutomap(page, name, mobile) {
  if (mobile) await page.locator('#touch-map').tap();
  else await page.keyboard.press('Tab');
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#automap');
    return !canvas.hidden && Number(canvas.dataset.cellSize) > 0;
  });
  const metrics = await page.locator('#automap').evaluate((canvas) => {
    const rect = canvas.getBoundingClientRect();
    const legendHeight = Number(canvas.dataset.legendHeight);
    const ratioX = canvas.width / rect.width;
    const ratioY = canvas.height / rect.height;
    const context = canvas.getContext('2d');
    const y = Math.max(0, Math.floor((rect.height - legendHeight) * ratioY));
    const band = context.getImageData(0, y, canvas.width, Math.max(1, canvas.height - y)).data;
    let legendPixels = 0;
    for (let index = 0; index < band.length; index += 4) {
      if (band[index] > 120 && band[index + 1] > 120 && band[index + 2] > 120 && band[index + 3] > 0) legendPixels += 1;
    }
    return {
      rect: { width: rect.width, height: rect.height },
      backingPixels: canvas.width * canvas.height,
      ratioX,
      ratioY,
      cellSize: Number(canvas.dataset.cellSize),
      legendHeight,
      legendPixels,
      viewportCellsX: Number(canvas.dataset.viewportCellsX),
      viewportCellsZ: Number(canvas.dataset.viewportCellsZ),
      playerX: Number(canvas.dataset.playerX),
      playerY: Number(canvas.dataset.playerY),
      touchDisplay: getComputedStyle(document.querySelector('#touch-controls')).display,
      full: document.querySelector('#hud').classList.contains('full-automap'),
    };
  });
  assert(metrics.full, `${name}: automap did not enter full-map presentation`);
  assert(metrics.backingPixels <= 4_050_000, `${name}: automap backing store exceeds its pixel budget`);
  assert(Math.abs(metrics.ratioX - metrics.ratioY) < .02, `${name}: automap backing store stretches square cells`);
  assert(metrics.cellSize >= (mobile ? 16 : 24), `${name}: automap cells are too small to read (${metrics.cellSize}px)`);
  assert(metrics.viewportCellsX <= (mobile ? 22 : 36), `${name}: automap shows too much horizontal world span`);
  assert(metrics.viewportCellsZ <= 41, `${name}: automap shows too much vertical world span`);
  assert(Math.abs(metrics.playerX - metrics.rect.width / 2) < 1, `${name}: automap is not centered horizontally on the player`);
  assert(Math.abs(metrics.playerY - (metrics.rect.height - metrics.legendHeight) / 2) < 1, `${name}: automap is not centered vertically on the player`);
  assert(metrics.legendHeight >= 30 && metrics.legendPixels > 20, `${name}: automap legend is missing or clipped`);
  if (mobile) assert(metrics.touchDisplay === 'none', `${name}: gameplay touch controls obscure the full automap`);
  await page.screenshot({ path: `output/responsive/${name}-automap.png` });

  const dragDistance = 48;
  const dragMap = async (pointerId) => {
    const before = Number(await page.locator('#automap').getAttribute('data-player-x'));
    await page.locator('#automap').evaluate((canvas, detail) => {
      canvas.setPointerCapture = () => {};
      const pointer = (type, x) => canvas.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        pointerId: detail.pointerId,
        pointerType: detail.mobile ? 'touch' : 'mouse',
        clientX: x,
        clientY: 96,
      }));
      pointer('pointerdown', 96);
      pointer('pointermove', 96 + detail.distance);
      pointer('pointerup', 96 + detail.distance);
    }, { pointerId, mobile, distance: dragDistance });
    await page.waitForFunction(({ origin, distance }) =>
      Math.abs(Number(document.querySelector('#automap').dataset.playerX) - origin) >= distance - 2,
    { origin: before, distance: dragDistance });
    return Number(await page.locator('#automap').getAttribute('data-player-x')) - before;
  };

  const baseDrag = await dragMap(51);
  assert(Math.abs(baseDrag - dragDistance) < 2, `${name}: automap drag did not track the pointer (${baseDrag}px for ${dragDistance}px)`);
  await page.keyboard.press('Home');
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#automap');
    return Math.abs(Number(canvas.dataset.playerX) - canvas.getBoundingClientRect().width / 2) < 1;
  });
  const baseCellSize = Number(await page.locator('#automap').getAttribute('data-cell-size'));
  await page.keyboard.press('Equal');
  await page.waitForFunction((before) => Number(document.querySelector('#automap').dataset.cellSize) > before, baseCellSize);
  const zoomedDrag = await dragMap(52);
  assert(Math.abs(zoomedDrag - dragDistance) < 2, `${name}: zoom changed automap drag speed (${zoomedDrag}px for ${dragDistance}px)`);
  assert(Math.abs(zoomedDrag - baseDrag) < 1, `${name}: automap drag speed varies by rendered cell scale`);
  await page.keyboard.press('Home');
  if (mobile) {
    await page.locator('#automap').evaluate((canvas) => {
      canvas.setPointerCapture = () => {};
      const pointer = (type, x, y) => canvas.dispatchEvent(new PointerEvent(type, {
        bubbles: true, pointerId: 41, pointerType: 'touch', clientX: x, clientY: y,
      }));
      pointer('pointerdown', 80, 80);
      for (let offset = 2; offset <= 8; offset += 2) pointer('pointermove', 80 + offset, 80);
      pointer('pointerup', 88, 80);
    });
    assert(await page.locator('#automap').isVisible(), `${name}: slow automap drag was misread as a close tap`);
    await page.locator('#automap').evaluate((canvas) => {
      canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 42, pointerType: 'touch', clientX: 40, clientY: 40 }));
      canvas.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 42, pointerType: 'touch', clientX: 40, clientY: 40 }));
    });
    assert(await page.locator('#automap').isVisible(), `${name}: canceled automap gesture closed the map`);
    await page.locator('#automap').tap({ position: { x: 20, y: 20 } });
  }
  else await page.keyboard.press('Tab');
  assert(!(await page.locator('#automap').isVisible()), `${name}: automap did not close`);
}

async function run(viewport, name, mobile = false) {
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(url, { waitUntil: 'networkidle' });
  const menu = await page.evaluate(() => {
    const geometry = (element) => {
      const rect = element.getBoundingClientRect(); const style = getComputedStyle(element);
      return { width: rect.width, height: rect.height, fontSize: Number.parseFloat(style.fontSize) };
    };
    return { title: geometry(document.querySelector('#menu .game-title')), art: geometry(document.querySelector('#menu .title-art')), buttons: [...document.querySelectorAll('#menu button')].map(geometry) };
  });
  if (!mobile && viewport.width >= 1920) {
    assert(menu.title.fontSize >= 80, `${name}: title did not use the high-resolution scale`);
    assert(menu.art.width >= 1100, `${name}: title art is undersized at high resolution`);
    assert(menu.buttons.every((button) => button.height >= 48 && button.fontSize >= 18), `${name}: main menu controls are undersized at high resolution`);
  }
  if (mobile) assert(menu.buttons.every((button) => button.height >= 44), `${name}: main menu has sub-44px touch targets`);
  await page.screenshot({ path: `output/responsive/${name}-menu.png` });
  await page.click('#new-game');
  const episodePresentation = await page.evaluate(() => {
    const geometry = (element) => {
      const rect = element.getBoundingClientRect(); const style = getComputedStyle(element);
      return { width: rect.width, height: rect.height, fontSize: Number.parseFloat(style.fontSize) };
    };
    return { title: geometry(document.querySelector('#episode-menu h1')), cards: [...document.querySelectorAll('.episode-card')].map(geometry), labels: [...document.querySelectorAll('.episode-card span')].map(geometry), back: geometry(document.querySelector('#episode-menu [data-back]')) };
  });
  if (!mobile && viewport.width >= 1920) {
    assert(episodePresentation.cards.every((card) => card.width >= 280 && card.height >= 175), `${name}: episode cards did not scale for high resolution`);
    assert(episodePresentation.labels.every((label) => label.fontSize >= 14), `${name}: episode labels are too small at high resolution`);
  }
  if (mobile) assert(episodePresentation.back.height >= 44, `${name}: episode Back target is too short`);
  await page.screenshot({ path: `output/responsive/${name}-episodes.png` });
  await page.locator('.episode-card').first().click();
  const difficultyPresentation = await page.evaluate(() => {
    const geometry = (element) => {
      const rect = element.getBoundingClientRect(); const style = getComputedStyle(element);
      return { width: rect.width, height: rect.height, fontSize: Number.parseFloat(style.fontSize) };
    };
    return { title: geometry(document.querySelector('#difficulty-menu h1')), buttons: [...document.querySelectorAll('#difficulty-menu button')].map(geometry) };
  });
  if (!mobile && viewport.width >= 1920) {
    assert(difficultyPresentation.title.fontSize >= 44, `${name}: difficulty heading is undersized at high resolution`);
    assert(difficultyPresentation.buttons.every((button) => button.height >= 48 && button.fontSize >= 18), `${name}: difficulty controls are undersized at high resolution`);
  }
  if (mobile) assert(difficultyPresentation.buttons.every((button) => button.height >= 44), `${name}: difficulty menu has sub-44px touch targets`);
  await page.screenshot({ path: `output/responsive/${name}-difficulty.png` });
  await page.locator('#difficulty-actions button').nth(1).click();
  const introPresentation = await page.evaluate(() => {
    const geometry = (element) => {
      const rect = element.getBoundingClientRect(); const style = getComputedStyle(element);
      return { width: rect.width, height: rect.height, fontSize: Number.parseFloat(style.fontSize) };
    };
    return { art: geometry(document.querySelector('#episode-intro-art')), copy: geometry(document.querySelector('#episode-intro-copy')), buttons: [...document.querySelectorAll('#episode-intro button')].map(geometry) };
  });
  if (!mobile && viewport.width >= 1920) {
    assert(introPresentation.art.width >= 900, `${name}: episode art is undersized at high resolution`);
    assert(introPresentation.copy.fontSize >= 20, `${name}: episode copy is undersized at high resolution`);
  }
  if (mobile) assert(introPresentation.buttons.every((button) => button.height >= 44), `${name}: intro has sub-44px touch targets`);
  await page.screenshot({ path: `output/responsive/${name}-intro.png` });
  await page.click('#begin-episode');
  if (!mobile && viewport.width >= 1920) {
    const briefing = await page.locator('#entry-controls').evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const value = element.querySelector('small');
      return { width: rect.width, valueFontSize: Number.parseFloat(getComputedStyle(value).fontSize) };
    });
    assert(briefing.width >= 720, `${name}: entry briefing is undersized on a high-resolution display`);
    assert(briefing.valueFontSize >= 14, `${name}: entry briefing values are too small on a high-resolution display`);
    await page.screenshot({ path: `output/responsive/${name}-briefing.png` });
  }
  if (await page.locator('#ready-overlay').isVisible()) await page.click('#enter-file');
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');
  await page.waitForTimeout(500);
  const metrics = await page.evaluate(() => {
    const shell = document.querySelector('#game-shell').getBoundingClientRect();
    const status = document.querySelector('#status').getBoundingClientRect();
    const weapon = document.querySelector('#weapon-view').getBoundingClientRect();
    const reticle = document.querySelector('#reticle').getBoundingClientRect();
    return { shell: [shell.x, shell.y, shell.width, shell.height], status: [status.x, status.y, status.width, status.height], weapon: [weapon.x, weapon.y, weapon.width, weapon.height], reticle: [reticle.x, reticle.y, reticle.width, reticle.height], scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight] };
  });
  if (!mobile) assert(Math.abs(metrics.shell[2] / metrics.shell[3] - 1.6) < .01, `${name}: stage aspect ratio drifted`);
  else assert(metrics.shell[2] === viewport.width && metrics.shell[3] === viewport.height, `${name}: portrait shell does not use the available viewport`);
  assert(metrics.shell[2] <= viewport.width && metrics.shell[3] <= viewport.height, `${name}: stage exceeds viewport`);
  assert(metrics.status[1] >= metrics.shell[1] && metrics.status[1] + metrics.status[3] <= metrics.shell[1] + metrics.shell[3] + 1, `${name}: status bar escaped stage`);
  if (!mobile) assert(metrics.weapon[1] >= metrics.reticle[1] + metrics.reticle[3] + metrics.shell[3] * .035, `${name}: weapon art enters the protected aiming lane`);
  else {
    assert(metrics.weapon[2] / metrics.shell[2] >= .67 && metrics.weapon[2] / metrics.shell[2] <= .69, `${name}: portrait weapon width changed`);
    assert(metrics.weapon[3] / metrics.shell[3] >= .45 && metrics.weapon[3] / metrics.shell[3] <= .47, `${name}: portrait weapon height changed`);
  }
  await page.screenshot({ path: `output/responsive/${name}-gameplay.png` });
  await inspectAutomap(page, name, mobile);
  if (mobile) {
    for (const selector of ['#touch-fire', '#touch-stick', '#touch-look', '#touch-use', '#touch-weapon', '#touch-map', '#touch-pause']) {
      assert(await page.locator(selector).isVisible(), `Mobile control ${selector} is not visible`);
      const box = await page.locator(selector).boundingBox();
      assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height, `${selector} escaped the viewport`);
      assert(box && box.width >= 44 && box.height >= 44, `${selector} is smaller than 44px`);
    }
    await page.locator('#touch-pause').tap();
    assert(await page.locator('#pause-menu').isVisible(), 'Touch pause control did not open the pause menu');
    await page.locator('#pause-options').tap();
    const options = await page.locator('#options-menu').evaluate((element) => ({ scrollHeight: element.scrollHeight, clientHeight: element.clientHeight }));
    assert(options.clientHeight > 700, 'Mobile options overlay is still compressed');
    await page.screenshot({ path: `output/responsive/${name}-options.png`, fullPage: true });
    await page.locator('#options-menu [data-back]').tap();
    await page.locator('#resume-game').tap();
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert(await page.locator('#pause-menu').isVisible(), 'Focus loss did not pause gameplay');
    await page.locator('#quit-menu').tap();
    assert(await page.locator('#confirm-dialog').isVisible(), 'Leaving an active session did not request confirmation');
    await page.locator('#confirm-cancel').tap();
  } else {
    await page.keyboard.press('Escape');
    assert(await page.locator('#pause-menu').isVisible(), `${name}: pause menu did not open`);
    const pause = await page.evaluate(() => {
      const geometry = (element) => {
        const rect = element.getBoundingClientRect(); const style = getComputedStyle(element);
        return { width: rect.width, height: rect.height, fontSize: Number.parseFloat(style.fontSize) };
      };
      return { plaque: geometry(document.querySelector('#pause-menu img')), buttons: [...document.querySelectorAll('#pause-menu button')].map(geometry) };
    });
    if (viewport.width >= 1920) {
      assert(pause.plaque.width >= 180, `${name}: pause plaque is undersized at high resolution`);
      assert(pause.buttons.every((button) => button.height >= 48 && button.fontSize >= 18), `${name}: pause controls are undersized at high resolution`);
    }
    await page.screenshot({ path: `output/responsive/${name}-pause.png` });
  }
  assert(errors.length === 0, `${name}: ${errors.join(' | ')}`);
  await context.close();
}

await run({ width: 2560, height: 1600 }, 'desktop-2560');
await run({ width: 1280, height: 720 }, 'desktop-1280');
await run({ width: 390, height: 844 }, 'mobile-390', true);
console.log('Responsive visual geometry passed');
await browser.close();
