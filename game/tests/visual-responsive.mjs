import { chromium } from 'playwright';
import fs from 'node:fs';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5400';
fs.mkdirSync('output/responsive', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function inspectNarrowPointerFine(viewport, name) {
  const context = await browser.newContext({ viewport, isMobile: false, hasTouch: false });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(url, { waitUntil: 'networkidle' });
  const geometry = await page.evaluate(() => {
    const shell = document.querySelector('#game-shell').getBoundingClientRect();
    const menu = document.querySelector('#menu');
    const title = document.querySelector('#menu .game-title').getBoundingClientRect();
    const art = document.querySelector('#menu .title-art').getBoundingClientRect();
    const buttons = [...document.querySelectorAll('#menu button')].map((button) => {
      const rect = button.getBoundingClientRect();
      return { id: button.id, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    });
    return {
      shell: { left: shell.left, top: shell.top, right: shell.right, bottom: shell.bottom },
      title: { left: title.left, top: title.top, right: title.right, bottom: title.bottom },
      art: { left: art.left, top: art.top, right: art.right, bottom: art.bottom },
      buttons,
      menuClientWidth: menu.clientWidth,
      menuScrollWidth: menu.scrollWidth,
      pageClientWidth: document.documentElement.clientWidth,
      pageScrollWidth: document.documentElement.scrollWidth,
    };
  });
  const withinShell = (rect) => rect.left >= geometry.shell.left - 1 && rect.top >= geometry.shell.top - 1
    && rect.right <= geometry.shell.right + 1 && rect.bottom <= geometry.shell.bottom + 1;
  assert(withinShell(geometry.title), `${name}: title escaped the stage`);
  assert(withinShell(geometry.art), `${name}: title art escaped the stage`);
  assert(geometry.buttons.every(withinShell), `${name}: menu commands escaped the stage`);
  assert(geometry.menuScrollWidth <= geometry.menuClientWidth + 1, `${name}: menu has horizontal overflow`);
  assert(geometry.pageScrollWidth <= geometry.pageClientWidth + 1, `${name}: page has horizontal overflow`);
  assert(errors.length === 0, `${name}: ${errors.join(' | ')}`);
  await page.screenshot({ path: `output/responsive/${name}-pointer-fine-menu.png` });
  await context.close();
}

async function inspectMomentum(page, name) {
  const staged = await page.evaluate((actorIds) => {
    let kills = 0;
    while (kills < 8) {
      const actorId = actorIds.find((id) => window.__redLedger.defeatActor(id));
      if (!actorId) break;
      kills += 1;
    }
    window.advanceTime(30);
    return kills;
  }, ['returned-mail', 'desk-warden', 'ember-clerk']);
  assert(staged === 8, `${name}: could not stage Authority Rush`);
  await page.waitForFunction(() => document.querySelector('#combat-streak').dataset.tier === 'authority-rush');
  const metrics = await page.evaluate(() => {
    const box = (element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    };
    const shell = box(document.querySelector('#game-shell'));
    const streakElement = document.querySelector('#combat-streak');
    const streak = box(streakElement);
    const objective = box(document.querySelector('#objective'));
    const horizontalOverlap = Math.max(0, Math.min(streak.right, objective.right) - Math.max(streak.left, objective.left));
    const verticalOverlap = Math.max(0, Math.min(streak.bottom, objective.bottom) - Math.max(streak.top, objective.top));
    const touchOverlaps = [...document.querySelectorAll('#touch-controls button, #touch-stick, #touch-look')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return getComputedStyle(element).display !== 'none' && rect.width > 0 && rect.height > 0;
      })
      .map((element) => ({ id: element.id, rect: box(element) }))
      .filter(({ rect }) => Math.max(0, Math.min(streak.right, rect.right) - Math.max(streak.left, rect.left))
        * Math.max(0, Math.min(streak.bottom, rect.bottom) - Math.max(streak.top, rect.top)) > 0)
      .map(({ id }) => id);
    return {
      shell,
      streak,
      overlapArea: horizontalOverlap * verticalOverlap,
      touchOverlaps,
      fontSize: Number.parseFloat(getComputedStyle(streakElement.querySelector('span')).fontSize),
      label: streakElement.innerText,
      accessibleName: streakElement.getAttribute('aria-label'),
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  assert(metrics.streak.left >= metrics.shell.left - 1 && metrics.streak.top >= metrics.shell.top - 1
    && metrics.streak.right <= metrics.shell.right + 1 && metrics.streak.bottom <= metrics.shell.bottom + 1,
  `${name}: Authority Rush HUD escaped the game stage`);
  assert(metrics.overlapArea === 0, `${name}: Authority Rush HUD overlaps the objective`);
  assert(metrics.touchOverlaps.length === 0,
    `${name}: Authority Rush HUD overlaps touch controls (${metrics.touchOverlaps.join(', ')})`);
  assert(metrics.fontSize >= 10, `${name}: Authority Rush label fell below 10px`);
  assert(metrics.label.includes('AUTHORITY RUSH') && metrics.label.includes('PTS'),
    `${name}: Authority Rush label is incomplete`);
  assert(metrics.accessibleName.includes('Authority Rush') && metrics.accessibleName.includes('chain x8'),
    `${name}: Authority Rush accessible name is incomplete`);
  assert(metrics.pageOverflow <= 1, `${name}: Authority Rush introduced horizontal page overflow`);
  await page.waitForTimeout(180);
  await page.screenshot({ path: `output/responsive/${name}-momentum-authority-rush.png` });
}

async function inspectAutomap(page, name, mobile) {
  const compactViewport = (page.viewportSize()?.width ?? 0) <= 700 || (page.viewportSize()?.height ?? 0) <= 500;
  const credentialSetup = await page.evaluate(() => {
    const originalMap = JSON.parse(window.render_game_to_text()).map.id;
    window.__redLedger.loadMap('E1M6');
    const found = ['red', 'yellow', 'cyan'].map((credential) => {
      const result = window.__redLedger.teleportToDoor(credential);
      window.advanceTime(35);
      return result;
    });
    return { found, map: JSON.parse(window.render_game_to_text()).map.id, originalMap };
  });
  assert(credentialSetup.map === 'E1M6' && credentialSetup.found.every(Boolean),
    `${name}: could not stage all three credential routes for automap accessibility`);
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
      credentialCues: canvas.dataset.credentialCues,
      touchDisplay: getComputedStyle(document.querySelector('#touch-controls')).display,
      full: document.querySelector('#hud').classList.contains('full-automap'),
    };
  });
  assert(metrics.full, `${name}: automap did not enter full-map presentation`);
  assert(metrics.backingPixels <= 4_050_000, `${name}: automap backing store exceeds its pixel budget`);
  assert(Math.abs(metrics.ratioX - metrics.ratioY) < .02, `${name}: automap backing store stretches square cells`);
  assert(metrics.cellSize >= (mobile || compactViewport ? 16 : 24), `${name}: automap cells are too small to read (${metrics.cellSize}px)`);
  assert(metrics.viewportCellsX <= (mobile ? 22 : 36), `${name}: automap shows too much horizontal world span`);
  assert(metrics.viewportCellsZ <= 41, `${name}: automap shows too much vertical world span`);
  assert(Math.abs(metrics.playerX - metrics.rect.width / 2) < 1, `${name}: automap is not centered horizontally on the player`);
  assert(Math.abs(metrics.playerY - (metrics.rect.height - metrics.legendHeight) / 2) < 1, `${name}: automap is not centered vertically on the player`);
  assert(metrics.legendHeight >= 30 && metrics.legendPixels > 20, `${name}: automap legend is missing or clipped`);
  assert(metrics.credentialCues === 'cyan,red,yellow',
    `${name}: automap omitted redundant credential cues (${metrics.credentialCues})`);
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
  await page.evaluate((mapId) => {
    window.__redLedger.loadMap(mapId);
    window.advanceTime(35);
  }, credentialSetup.originalMap);
  await page.waitForFunction((mapId) => JSON.parse(window.render_game_to_text()).map.id === mapId,
    credentialSetup.originalMap);
}

async function inspectCompactOptions(viewport, name, mobile = false) {
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.click('#options-button');
  await page.selectOption('#text-scale', 'largest');
  const initial = await page.locator('#options-menu').evaluate((element) => {
    element.scrollTop = 0;
    const panel = element.getBoundingClientRect();
    const heading = element.querySelector('h1').getBoundingClientRect();
    const firstSetting = element.querySelector('label').getBoundingClientRect();
    const audioDetail = element.querySelector('#audio-profile-detail');
    const previewRow = element.querySelector('.audio-preview-row');
    const previewButton = element.querySelector('#audio-preview');
    const previewStatus = element.querySelector('#audio-preview-status');
    const previewRowBox = previewRow.getBoundingClientRect();
    const previewButtonBox = previewButton.getBoundingClientRect();
    const controlsContained = [...element.querySelectorAll('label input, label select, label output')].every((control) => {
      const label = control.closest('label').getBoundingClientRect();
      const rect = control.getBoundingClientRect();
      return rect.left >= label.left - 1 && rect.right <= label.right + 1 && rect.top >= label.top - 1 && rect.bottom <= label.bottom + 1;
    });
    return {
      panel: { top: panel.top, bottom: panel.bottom },
      heading: { top: heading.top, bottom: heading.bottom },
      firstSetting: { top: firstSetting.top, bottom: firstSetting.bottom },
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      controlsContained,
      rootFontSize: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
      audioDetail: {
        fontSize: Number.parseFloat(getComputedStyle(audioDetail).fontSize),
        overflow: audioDetail.scrollWidth > audioDetail.clientWidth + 1,
      },
      preview: {
        contained: previewButtonBox.left >= previewRowBox.left - 1 && previewButtonBox.right <= previewRowBox.right + 1,
        buttonHeight: previewButtonBox.height,
        statusFontSize: Number.parseFloat(getComputedStyle(previewStatus).fontSize),
        rowOverflow: previewRow.scrollWidth > previewRow.clientWidth + 1,
      },
    };
  });
  assert(initial.heading.top >= initial.panel.top && initial.heading.bottom <= initial.panel.bottom, `${name}: Options heading is unreachable at scroll start`);
  assert(initial.firstSetting.top >= initial.panel.top && initial.firstSetting.bottom <= initial.panel.bottom, `${name}: First option is unreachable at scroll start`);
  assert(initial.scrollWidth <= initial.clientWidth + 1, `${name}: Options overflow horizontally`);
  assert(initial.controlsContained, `${name}: Largest text caused an option control to overlap or escape its label`);
  assert(initial.rootFontSize >= 19.5, `${name}: Largest text preference was not applied`);
  assert(initial.audioDetail.fontSize >= 10 && !initial.audioDetail.overflow,
    `${name}: Audio profile guidance is unreadable or clipped`);
  assert(initial.preview.contained && !initial.preview.rowOverflow && initial.preview.statusFontSize >= 10,
    `${name}: Audio preview row is unreadable or overflows`);
  if (mobile) assert(initial.preview.buttonHeight >= 44, `${name}: Audio preview action is smaller than 44px`);
  if (mobile) {
    await page.locator('#audio-preview').tap();
    await page.waitForFunction(() => document.querySelector('#audio-preview-status')?.dataset.result === 'played');
    await page.waitForTimeout(420);
    const populatedPreview = await page.locator('.audio-preview-row').evaluate((row) => {
      const panel = document.querySelector('#options-menu').getBoundingClientRect();
      const rect = row.getBoundingClientRect();
      const status = row.querySelector('#audio-preview-status');
      return {
        panel: { top: panel.top, bottom: panel.bottom },
        row: { top: rect.top, bottom: rect.bottom },
        rowOverflow: row.scrollWidth > row.clientWidth + 1,
        statusOverflow: status.scrollWidth > status.clientWidth + 1,
        statusFontSize: Number.parseFloat(getComputedStyle(status).fontSize),
        status: status.textContent,
      };
    });
    assert(populatedPreview.row.top >= populatedPreview.panel.top
      && populatedPreview.row.bottom <= populatedPreview.panel.bottom + 1,
    `${name}: Populated audio preview shifted outside the compact Options viewport`);
    assert(!populatedPreview.rowOverflow && !populatedPreview.statusOverflow && populatedPreview.statusFontSize >= 10,
      `${name}: Populated audio preview is clipped or unreadable`);
    assert(populatedPreview.status.includes('hazard left') && populatedPreview.status.includes('critical attack right'),
      `${name}: Audio preview status omitted its directional sequence`);
    await page.screenshot({ path: `output/responsive/${name}-audio-preview.png` });
  }
  const back = page.locator('#options-menu [data-back]');
  await back.scrollIntoViewIfNeeded();
  const final = await Promise.all([
    page.locator('#options-menu').boundingBox(),
    back.boundingBox(),
  ]);
  assert(final[0] && final[1] && final[1].y >= final[0].y && final[1].y + final[1].height <= final[0].y + final[0].height + 1, `${name}: Options Back control cannot be scrolled into view`);
  const actions = await page.locator('.options-actions').evaluate((row) => {
    const rowBox = row.getBoundingClientRect();
    return [...row.querySelectorAll('button')].map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        id: button.id,
        text: button.textContent?.trim(),
        left: rect.left,
        right: rect.right,
        height: rect.height,
        rowLeft: rowBox.left,
        rowRight: rowBox.right,
      };
    });
  });
  assert(actions.some(({ id, text }) => id === 'restore-options' && text === 'Restore Defaults'),
    `${name}: Options omitted its recoverable defaults action`);
  assert(actions.every(({ left, right, rowLeft, rowRight }) => left >= rowLeft - 1 && right <= rowRight + 1),
    `${name}: An Options action escaped its row at the largest text size`);
  if (mobile) assert(actions.every(({ height }) => height >= 44), `${name}: An Options action is smaller than 44px`);
  await page.screenshot({ path: `output/responsive/${name}-options.png` });
  await context.close();
}

async function inspectShortLandscapeDifficulty() {
  const context = await browser.newContext({ viewport: { width: 568, height: 320 }, isMobile: true, hasTouch: true });
  await context.addInitScript(() => localStorage.setItem('red-ledger-settings-v1', JSON.stringify({ uiTextScale: 'largest' })));
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.click('#new-game');
  await page.locator('.episode-card').first().click();
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-difficulty') === 'field-adjuster');
  const difficultyDetail = await page.locator('#difficulty-detail').innerText();
  assert(difficultyDetail.startsWith('Recommended:') && difficultyDetail.includes('standard ammo pickups'),
    'mobile-landscape-568: Difficulty detail does not match the retained Field Adjuster selection');
  const initial = await page.locator('#difficulty-menu').evaluate((screen) => {
    screen.scrollTop = 0;
    const panel = screen.getBoundingClientRect();
    const heading = screen.querySelector('h1').getBoundingClientRect();
    return {
      panel: { top: panel.top, bottom: panel.bottom },
      heading: { top: heading.top, bottom: heading.bottom },
      clientHeight: screen.clientHeight,
      scrollHeight: screen.scrollHeight,
      overflowY: getComputedStyle(screen).overflowY,
    };
  });
  assert(initial.heading.top >= initial.panel.top && initial.heading.bottom <= initial.panel.bottom,
    'mobile-landscape-568: Largest Difficulty heading is clipped at scroll start');
  assert(initial.overflowY === 'auto' && initial.scrollHeight >= initial.clientHeight,
    'mobile-landscape-568: Difficulty does not provide a bounded scroll surface');
  const back = page.locator('#difficulty-menu [data-back]');
  await back.scrollIntoViewIfNeeded();
  const [panel, backBox] = await Promise.all([page.locator('#difficulty-menu').boundingBox(), back.boundingBox()]);
  assert(panel && backBox && backBox.y >= panel.y && backBox.y + backBox.height <= panel.y + panel.height + 1,
    'mobile-landscape-568: Largest Difficulty Back control cannot be reached');
  await page.screenshot({ path: 'output/responsive/mobile-landscape-568-difficulty-largest.png' });
  await context.close();
}

async function inspectSmallPersonalizedDeck(handedness) {
  const context = await browser.newContext({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });
  await context.addInitScript((hand) => localStorage.setItem('red-ledger-settings-v1', JSON.stringify({
    touchControlSize: 'large',
    touchHandedness: hand,
    uiTextScale: 'largest',
  })), handedness);
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.click('#new-game');
  await page.locator('.episode-card').first().click();
  await page.locator('#difficulty-actions button').nth(1).click();
  await page.locator('#begin-episode').tap();
  if (await page.locator('#ready-overlay').isVisible()) await page.locator('#enter-file').tap();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');

  const result = await page.evaluate((messageText) => {
    const selectors = ['#touch-stick', '#touch-look', '#touch-fire', '#touch-use', '#touch-weapon', '#touch-map', '#touch-pause'];
    const box = (selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return { selector, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    };
    const controls = selectors.map(box);
    const overlaps = [];
    controls.forEach((left, index) => controls.slice(index + 1).forEach((right) => {
      const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
      const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
      if (width > .5 && height > .5) overlaps.push(`${left.selector}/${right.selector}:${width}x${height}`);
    }));
    const message = document.querySelector('#message');
    message.textContent = messageText;
    const messageBox = box('#message');
    const objectiveBox = box('#objective');
    const hudOverlap = Math.max(0, Math.min(messageBox.bottom, objectiveBox.bottom) - Math.max(messageBox.top, objectiveBox.top));
    return { controls, overlaps, messageBox, objectiveBox, hudOverlap };
  }, 'The red credential is visible through glass from the starting room, then opens the parking return loop.');
  assert(result.overlaps.length === 0, `320x568 ${handedness}: touch controls overlap (${result.overlaps.join(', ')})`);
  assert(result.controls.every((box) => box.left >= 0 && box.top >= 0 && box.right <= 320 && box.bottom <= 568),
    `320x568 ${handedness}: a personalized touch control escaped the viewport`);
  assert(result.hudOverlap === 0,
    `320x568 ${handedness}: long authored message overlaps the objective by ${result.hudOverlap}px`);
  assert(result.controls.every((box) => result.messageBox.bottom <= box.top || result.messageBox.top >= box.bottom
    || result.messageBox.right <= box.left || result.messageBox.left >= box.right),
  `320x568 ${handedness}: long authored message overlaps a touch control`);
  await page.screenshot({ path: `output/responsive/mobile-320-${handedness}-large-deck.png` });
  await context.close();
}

async function inspectPauseDossier(page, name, viewport, mobile) {
  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert(state.mode === 'paused' && state.pause, `${name}: text state omitted the active pause dossier`);
  assert(state.pause.mapId === state.map.id && state.pause.objective === state.objective,
    `${name}: pause dossier disagrees with the active map or objective`);
  assert(state.pause.recoveryState === 'persistent' && state.pause.recovery.includes('Checkpoint saved'),
    `${name}: ordinary pause did not identify its durable checkpoint: ${JSON.stringify(state.pause)}`);
  const metrics = await page.locator('#pause-menu').evaluate((screen) => {
    const review = screen.querySelector('#pause-review');
    const box = review.getBoundingClientRect();
    const screenBox = screen.getBoundingClientRect();
    return {
      box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width },
      screen: { left: screenBox.left, top: screenBox.top, right: screenBox.right, bottom: screenBox.bottom },
      overflow: review.scrollWidth > review.clientWidth + 1 || screen.scrollWidth > screen.clientWidth + 1,
      fonts: [...review.querySelectorAll('strong, b, p, footer')]
        .map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
      recoveryState: review.dataset.recovery,
      label: review.getAttribute('aria-label'),
    };
  });
  assert(!metrics.overflow, `${name}: pause dossier overflows horizontally`);
  assert(metrics.box.left >= metrics.screen.left && metrics.box.right <= metrics.screen.right + 1,
    `${name}: pause dossier escapes the pause screen`);
  assert(metrics.fonts.every((fontSize) => fontSize >= 10), `${name}: pause dossier contains sub-10px copy`);
  assert(metrics.recoveryState === 'persistent' && metrics.label.includes(state.map.id),
    `${name}: pause dossier does not expose its recovery state and accessible map summary`);
  if (!mobile && viewport.width >= 1920) {
    assert(metrics.box.width >= 760, `${name}: pause dossier remained undersized at high resolution`);
    assert(metrics.fonts.every((fontSize) => fontSize >= 12), `${name}: pause dossier did not use its high-resolution type scale`);
  }
}

async function inspectExitReview(page, name, viewport, mobile) {
  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert(state.exitReview?.mapId === state.map.id, `${name}: text state omitted the return-to-title review`);
  const trigger = page.locator('#quit-menu');
  if (mobile) await trigger.tap();
  else await trigger.click();
  assert(await page.locator('#confirm-dialog').isVisible(), `${name}: return to title did not open its confirmation`);
  const metrics = await page.locator('#confirm-dialog').evaluate((dialog) => {
    const review = dialog.querySelector('#confirm-review');
    const dialogBox = dialog.getBoundingClientRect();
    const reviewBox = review.getBoundingClientRect();
    const buttons = [...dialog.querySelectorAll('button')].map((button) => {
      const box = button.getBoundingClientRect();
      return { width: box.width, height: box.height, fontSize: Number.parseFloat(getComputedStyle(button).fontSize) };
    });
    return {
      title: dialog.querySelector('#confirm-title').textContent,
      copy: dialog.querySelector('#confirm-copy').textContent,
      returnPoint: dialog.querySelector('#confirm-return-point').textContent,
      consequence: dialog.querySelector('#confirm-consequence').textContent,
      durability: dialog.querySelector('#confirm-durability').textContent,
      accept: dialog.querySelector('#confirm-accept').textContent,
      recovery: review.dataset.recovery,
      consequenceState: review.dataset.consequence,
      label: review.getAttribute('aria-label'),
      dialogBox: { left: dialogBox.left, top: dialogBox.top, right: dialogBox.right, bottom: dialogBox.bottom, width: dialogBox.width },
      reviewBox: { left: reviewBox.left, top: reviewBox.top, right: reviewBox.right, bottom: reviewBox.bottom },
      overflow: dialog.scrollWidth > dialog.clientWidth + 1 || review.scrollWidth > review.clientWidth + 1,
      fonts: [...review.querySelectorAll('span, strong, p, small')]
        .map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
      buttons,
      focused: document.activeElement?.id,
      selection: window.getSelection()?.toString() ?? '',
    };
  });
  assert(metrics.title === 'Return to title?' && metrics.copy.includes('E1M1'), `${name}: exit review lacks its concrete decision context`);
  assert(/^(Autosave|Episode recovery|Manual file|Quicksave|Previous tab copy) • E1M1 /.test(metrics.returnPoint),
    `${name}: exit review obscures the exact Continue return point: ${metrics.returnPoint}`);
  assert(metrics.returnPoint === state.exitReview.returnPoint && metrics.consequence === state.exitReview.consequence,
    `${name}: visible exit review disagrees with render_game_to_text`);
  assert(['safe', 'rewind'].includes(metrics.consequenceState), `${name}: same-map exit review reports the wrong consequence`);
  assert(metrics.recovery === 'persistent' && metrics.durability.includes('survives closing or reloading'), `${name}: exit review obscures persistent durability`);
  assert(metrics.accept === 'Return to Title' && metrics.focused === 'confirm-cancel', `${name}: exit review lacks a precise action or safe initial focus`);
  assert(metrics.selection === '', `${name}: exit review retained accidental text selection: ${metrics.selection}`);
  assert(metrics.label.includes('Return point') && metrics.label.includes('E1M1'), `${name}: exit review lacks a complete accessible summary`);
  assert(!metrics.overflow && metrics.dialogBox.left >= 0 && metrics.dialogBox.top >= 0
    && metrics.dialogBox.right <= viewport.width + 1 && metrics.dialogBox.bottom <= viewport.height + 1,
  `${name}: exit review overflows the viewport`);
  assert(metrics.reviewBox.left >= metrics.dialogBox.left && metrics.reviewBox.right <= metrics.dialogBox.right + 1,
    `${name}: exit review escapes its dialog`);
  assert(metrics.fonts.every((fontSize) => fontSize >= 10), `${name}: exit review contains sub-10px copy`);
  if (mobile) assert(metrics.buttons.every((button) => button.height >= 44), `${name}: exit review has a sub-44px touch action`);
  if (!mobile && viewport.width >= 1920) {
    assert(metrics.dialogBox.width >= 760, `${name}: exit review remained undersized at high resolution`);
    assert(metrics.fonts.every((fontSize) => fontSize >= 12), `${name}: exit review did not use its high-resolution type scale`);
    assert(metrics.buttons.every((button) => button.height >= 48 && button.fontSize >= 18), `${name}: high-resolution exit actions are undersized`);
  }
  await page.screenshot({ path: `output/responsive/${name}-exit-review.png`, fullPage: mobile });
  await page.locator('#confirm-dialog').screenshot({ path: `output/responsive/${name}-exit-review-dialog.png` });
  if (mobile) await page.locator('#confirm-cancel').tap();
  else await page.locator('#confirm-cancel').click();
  assert(await page.locator('#pause-menu').isVisible(), `${name}: canceling the exit review did not return to pause`);
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
  assert(episodePresentation.labels.every((label) => label.fontSize >= 10), `${name}: episode labels fell below the compact-copy floor`);
  if (mobile) assert(episodePresentation.back.height >= 44, `${name}: episode Back target is too short`);
  await page.screenshot({ path: `output/responsive/${name}-episodes.png` });
  await page.locator('.episode-card').first().click();
  const difficultyPresentation = await page.evaluate(() => {
    const geometry = (element) => {
      const rect = element.getBoundingClientRect(); const style = getComputedStyle(element);
      return { width: rect.width, height: rect.height, fontSize: Number.parseFloat(style.fontSize) };
    };
    return { title: geometry(document.querySelector('#difficulty-menu h1')), buttons: [...document.querySelectorAll('#difficulty-menu button:not([hidden])')].map(geometry) };
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
  if (mobile) await page.locator('#begin-episode').tap();
  else await page.click('#begin-episode');
  const briefing = await page.locator('#ready-overlay').evaluate((element) => {
    const font = (selector) => [...element.querySelectorAll(selector)]
      .map((item) => Number.parseFloat(getComputedStyle(item).fontSize));
    const controls = element.querySelector('#entry-controls').getBoundingClientRect();
    return {
      width: controls.width,
      objective: font('#entry-objective'),
      mapTitle: font('header strong'),
      mapMeta: font('header span'),
      activeSeal: font('header small'),
      labels: font('.entry-controls b'),
      values: font('.entry-controls small'),
    };
  });
  assert([...briefing.mapMeta, ...briefing.activeSeal, ...briefing.labels, ...briefing.values]
    .every((fontSize) => fontSize >= 10), `${name}: field briefing contains sub-10px instructional copy`);
  if (!mobile && viewport.width >= 701 && viewport.height >= 501) {
    assert(briefing.mapTitle.every((fontSize) => fontSize >= 18), `${name}: field briefing map title is too small at a normal desktop viewport`);
    assert(briefing.objective.every((fontSize) => fontSize >= 13), `${name}: field briefing objective is too small at a normal desktop viewport`);
    assert(briefing.mapMeta.every((fontSize) => fontSize >= 12), `${name}: field briefing metadata is too small at a normal desktop viewport`);
    assert(briefing.labels.every((fontSize) => fontSize >= 11), `${name}: field briefing control labels are too small at a normal desktop viewport`);
    assert(briefing.values.every((fontSize) => fontSize >= 13), `${name}: field briefing control values are too small at a normal desktop viewport`);
  }
  if (!mobile && viewport.width >= 1920) {
    assert(briefing.width >= 720, `${name}: entry briefing is undersized on a high-resolution display`);
    assert(briefing.values.every((fontSize) => fontSize >= 16), `${name}: entry briefing values are too small on a high-resolution display`);
  }
  await page.screenshot({ path: `output/responsive/${name}-briefing.png` });
  if (await page.locator('#ready-overlay').isVisible()) {
    if (mobile) await page.locator('#enter-file').tap();
    else await page.click('#enter-file');
  }
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
  const feedbackFonts = await page.evaluate(() => ({
    objective: Number.parseFloat(getComputedStyle(document.querySelector('#objective')).fontSize),
    replay: Number.parseFloat(getComputedStyle(document.querySelector('#replay-controls button')).fontSize),
    streak: Number.parseFloat(getComputedStyle(document.querySelector('#combat-streak span')).fontSize),
    boss: Number.parseFloat(getComputedStyle(document.querySelector('#boss-bar small')).fontSize),
    move: Number.parseFloat(getComputedStyle(document.querySelector('#touch-stick'), '::after').fontSize),
    look: Number.parseFloat(getComputedStyle(document.querySelector('#touch-look'), '::after').fontSize),
  }));
  assert(Object.values(feedbackFonts).every((fontSize) => fontSize >= 10),
    `${name}: compact gameplay feedback fell below 10px: ${JSON.stringify(feedbackFonts)}`);
  if (!mobile) assert(metrics.weapon[1] >= metrics.reticle[1] + metrics.reticle[3] + metrics.shell[3] * .035, `${name}: weapon art enters the protected aiming lane`);
  else {
    assert(metrics.weapon[2] / metrics.shell[2] >= .67 && metrics.weapon[2] / metrics.shell[2] <= .69, `${name}: portrait weapon width changed`);
    assert(metrics.weapon[3] / metrics.shell[3] >= .45 && metrics.weapon[3] / metrics.shell[3] <= .47, `${name}: portrait weapon height changed`);
  }
  await page.screenshot({ path: `output/responsive/${name}-gameplay.png` });
  await inspectMomentum(page, name);
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
    await inspectPauseDossier(page, name, viewport, mobile);
    await page.screenshot({ path: `output/responsive/${name}-pause.png`, fullPage: true });
    await page.locator('#pause-options').tap();
    const options = await page.locator('#options-menu').evaluate((element) => ({ scrollHeight: element.scrollHeight, clientHeight: element.clientHeight }));
    assert(options.clientHeight > 700, 'Mobile options overlay is still compressed');
    await page.screenshot({ path: `output/responsive/${name}-options.png`, fullPage: true });
    await page.locator('#controls-button').tap();
    const controls = await page.locator('#controls-menu').evaluate((element) => ({
      overflow: element.scrollWidth > element.clientWidth + 1,
      rowOverflow: [...element.querySelectorAll('.control-row')].some((row) => row.scrollWidth > row.clientWidth + 1),
      fonts: [...element.querySelectorAll('.control-row, .control-row button')]
        .map((item) => Number.parseFloat(getComputedStyle(item).fontSize)),
    }));
    assert(!controls.overflow && !controls.rowOverflow, `${name}: mobile control bindings overflow after the readability increase`);
    assert(controls.fonts.every((fontSize) => fontSize >= 10), `${name}: mobile control bindings fell below 10px`);
    await page.screenshot({ path: `output/responsive/${name}-controls.png`, fullPage: true });
    await page.locator('#controls-back').tap();
    await page.locator('#options-menu [data-back]').tap();
    await page.locator('#save-game').tap();
    const slots = await page.locator('#save-slots').evaluate((element) => ({
      overflow: element.scrollWidth > element.clientWidth + 1,
      rowOverflow: [...element.querySelectorAll('.slot-row')].some((row) => row.scrollWidth > row.clientWidth + 1),
      fonts: [...element.querySelectorAll('.slot-row, .slot-row button, .slot-copy small')]
        .map((item) => Number.parseFloat(getComputedStyle(item).fontSize)),
    }));
    assert(!slots.overflow && !slots.rowOverflow, `${name}: mobile save files overflow after the readability increase`);
    assert(slots.fonts.every((fontSize) => fontSize >= 10), `${name}: mobile save-file copy fell below 10px`);
    await page.screenshot({ path: `output/responsive/${name}-save-slots.png`, fullPage: true });
    await page.locator('#save-slots .slot-back').tap();
    await page.locator('#resume-game').tap();
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert(await page.locator('#pause-menu').isVisible(), 'Focus loss did not pause gameplay');
    await inspectExitReview(page, name, viewport, mobile);
  } else {
    await page.keyboard.press('Escape');
    assert(await page.locator('#pause-menu').isVisible(), `${name}: pause menu did not open`);
    await inspectPauseDossier(page, name, viewport, mobile);
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
    await inspectExitReview(page, name, viewport, mobile);
  }
  assert(errors.length === 0, `${name}: ${errors.join(' | ')}`);
  await context.close();
}

await inspectCompactOptions({ width: 1280, height: 500 }, 'desktop-short-1280');
await inspectNarrowPointerFine({ width: 640, height: 400 }, 'desktop-zoom-200');
await inspectNarrowPointerFine({ width: 568, height: 320 }, 'desktop-narrow-568');
await inspectCompactOptions({ width: 568, height: 320 }, 'mobile-landscape-568', true);
await inspectShortLandscapeDifficulty();
await inspectSmallPersonalizedDeck('right');
await inspectSmallPersonalizedDeck('left');
await run({ width: 2560, height: 1600 }, 'desktop-2560');
await run({ width: 1280, height: 720 }, 'desktop-1280');
await run({ width: 640, height: 400 }, 'desktop-zoom-200-flow');
await run({ width: 390, height: 844 }, 'mobile-390', true);
console.log('Responsive visual geometry passed');
await browser.close();
