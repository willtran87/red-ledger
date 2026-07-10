import { CAMPAIGN, type MapId } from '../data';
import { INPUT_ACTIONS, bindingLabel, type InputAction } from './InputBindings';
import type { InputActionEvent, MenuNavigationEvent } from './InputSystem';
import { WEAPONS, type GameDifficulty } from './definitions';
import { GameEngine, type GameSnapshot } from './GameEngine';
import { runtimeUrl } from './AssetCatalog';

type PortraitState = 'neutral' | 'pain-center' | 'pain-left' | 'pain-right' | 'glance-left' | 'glance-right' | 'weapon-acquired' | 'overcharge' | 'invulnerable' | 'dead';

const $ = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing UI element: ${selector}`);
  return element;
};

export class UIController {
  private pendingEpisode = 0;
  private pendingDifficulty: GameDifficulty = 'field-adjuster';
  private automapVisible = false;
  private automapMode: 'full' | 'overlay' = 'full';
  private automapZoom = 1;
  private automapPan = { x: 0, z: 0 };
  private automapDrag?: { pointerId: number; x: number; y: number };
  private readonly playerTrail: Array<{ x: number; z: number }> = [];
  private trailMap = '';
  private weaponTimer?: number;
  private weaponFrameTimers: number[] = [];
  private lastMode = '';
  private currentWeapon = '';
  private portraitUntil = 0;
  private optionsReturn = 'menu';
  private capturingAction?: InputAction;
  private radialActive = false;
  private radialWeapon?: keyof typeof WEAPONS;
  private weaponSwitchAnimation?: Animation;
  private confirmAction?: () => void;
  private focusBeforeDialog?: HTMLElement;
  private slotReturn = 'pause-menu';

  constructor(readonly game: GameEngine) {
    this.buildEpisodeCards();
    this.buildDifficulties();
    this.bindActions();
    this.game.onChange = (snapshot) => this.update(snapshot);
    this.game.onIntermission = () => this.showIntermission();
    this.updateContinue();
    window.addEventListener('weapon-fire', (event) => this.flashWeapon((event as CustomEvent).detail));
    window.addEventListener('view-recoil', (event) => this.viewRecoil((event as CustomEvent<{ amount: number }>).detail));
    window.addEventListener('weapon-impact', (event) => this.impactFeedback((event as CustomEvent<{ kind: 'wall' | 'actor' }>).detail));
    window.addEventListener('player-portrait', (event) => this.specialPortrait((event as CustomEvent<{ state: PortraitState }>).detail.state));
    window.addEventListener('weapon-switch', (event) => this.animateWeaponSwitch((event as CustomEvent<{
      state: 'lowering' | 'raising' | 'ready'; duration: number;
    }>).detail));
    window.addEventListener('player-hurt', (event) => this.hurtFlash((event as CustomEvent<{ direction?: 'left' | 'right' | 'center' }>).detail));
    this.loadSettings();
  }

  private buildEpisodeCards(): void {
    const container = $('#episode-cards');
    ['First Notice', 'Exclusions Apply', 'Adverse Development'].forEach((title, index) => {
      const button = document.createElement('button');
      button.className = 'episode-card';
      button.title = title;
      button.setAttribute('aria-label', title);
      button.style.backgroundImage = `url('${runtimeUrl(`public_runtime/ui/episode-select-${index + 1}.png`)}')`;
      button.disabled = !this.game.isEpisodeUnlocked(index);
      if (button.disabled) button.title = `${title} - locked`;
      button.addEventListener('click', () => {
        this.pendingEpisode = index;
        this.showScreen('difficulty-menu');
      });
      container.append(button);
    });
  }

  private buildDifficulties(): void {
    const container = $('#difficulty-actions');
    const difficulties: Array<[GameDifficulty, string]> = [
      ['orientation', 'Orientation'],
      ['desk-adjuster', 'Desk Adjuster'],
      ['field-adjuster', 'Field Adjuster'],
      ['catastrophe-team', 'Catastrophe Team'],
      ['binding-authority', 'Binding Authority'],
    ];
    difficulties.forEach(([id, label]) => {
      const button = document.createElement('button');
      button.textContent = label;
      button.addEventListener('click', () => {
        this.game.audio.unlock();
        this.pendingDifficulty = id;
        this.showEpisodeIntro();
      });
      container.append(button);
    });
  }

  private bindActions(): void {
    $('#new-game').addEventListener('click', () => { this.updateEpisodeLocks(); this.showScreen('episode-menu'); });
    $('#continue-game').addEventListener('click', () => {
      this.game.audio.unlock();
      if (this.game.load()) this.hideScreens();
    });
    $('#options-button').addEventListener('click', () => { this.optionsReturn = 'menu'; this.showScreen('options-menu'); });
    $('#pause-options').addEventListener('click', () => { this.optionsReturn = 'pause-menu'; this.showScreen('options-menu'); });
    $('#credits-button').addEventListener('click', () => this.showScreen('credits'));
    $('#quit-game').addEventListener('click', () => this.confirm(
      'Quit game?', 'This browser session will end. Unsaved progress will be lost.', 'Quit', () => this.endSession(),
    ));
    $('#session-return').addEventListener('click', () => location.reload());
    $('#controls-button').addEventListener('click', () => { this.buildControls(); this.showScreen('controls-menu'); });
    $('#controls-back').addEventListener('click', () => { this.cancelBindingCapture(); this.showScreen('options-menu'); });
    $('#reset-controls').addEventListener('click', () => this.confirm(
      'Reset controls?',
      'All keyboard, mouse, and controller bindings will return to their defaults.',
      'Reset',
      () => { this.game.input.resetBindings(); this.buildControls(); },
    ));
    $('#cancel-binding').addEventListener('click', () => this.cancelBindingCapture());
    $('#level-select-button').addEventListener('click', () => this.showLevelSelect());
    document.querySelectorAll<HTMLElement>('[data-back]').forEach((button) => button.addEventListener('click', () => {
      this.showScreen(button.closest('#options-menu') ? this.optionsReturn : 'menu');
    }));
    $('#resume-game').addEventListener('click', () => { this.hideScreens(); this.game.resume(); });
    $('#save-game').addEventListener('click', () => { this.slotReturn = 'pause-menu'; this.showSlotScreen('save'); });
    $('#load-game').addEventListener('click', () => { this.slotReturn = 'pause-menu'; this.showSlotScreen('load'); });
    document.querySelectorAll('.slot-back').forEach((button) => button.addEventListener('click', () => this.showScreen(this.slotReturn)));
    $('#quit-menu').addEventListener('click', () => this.confirmMainMenu());
    $('#restart-checkpoint').addEventListener('click', () => {
      const game = this.game as GameEngine & { restartFromCheckpoint?: () => boolean };
      if (game.restartFromCheckpoint?.()) this.hideScreens();
    });
    $('#death-load').addEventListener('click', () => { this.slotReturn = 'death-menu'; this.showSlotScreen('load'); });
    $('#death-menu-button').addEventListener('click', () => this.confirmMainMenu());
    $('#confirm-cancel').addEventListener('click', () => this.closeConfirm());
    $('#confirm-accept').addEventListener('click', () => {
      const action = this.confirmAction;
      this.closeConfirm();
      action?.();
    });
    $<HTMLDialogElement>('#confirm-dialog').addEventListener('cancel', (event) => { event.preventDefault(); this.closeConfirm(); });
    $('#fatal-reload').addEventListener('click', () => location.reload());
    $('#continue-map').addEventListener('click', () => {
      const next = this.game.pendingMap;
      if (next && Number(next[1]) !== Number(this.game.world.map.id[1])) {
        this.pendingEpisode = Number(next[1]) - 1;
        this.pendingDifficulty = this.game.difficulty;
        this.showEpisodeIntro();
        return;
      }
      this.hideScreens();
      this.game.continueFromIntermission();
    });
    $('#begin-episode').addEventListener('click', () => { this.hideScreens(); this.game.startEpisode(this.pendingEpisode, this.pendingDifficulty); });
    $('#epilogue-menu').addEventListener('click', () => this.showScreen('menu'));
    $('#sensitivity').addEventListener('input', (event) => { this.game.sensitivity = Number((event.target as HTMLInputElement).value); });
    $('#render-scale').addEventListener('change', (event) => this.game.setRenderScale(Number((event.target as HTMLSelectElement).value)));
    ['sensitivity', 'render-scale', 'hud-mode', 'classic-input', 'screen-shake', 'reduced-motion', 'high-contrast', 'reduced-effects', 'flash-effects',
      'master-volume', 'music-volume', 'sfx-volume', 'mute-audio'].forEach((id) => {
      $(`#${id}`).addEventListener('change', () => this.applySettings(true));
    });
    for (const id of ['master-volume', 'music-volume', 'sfx-volume']) {
      $(`#${id}`).addEventListener('input', () => this.applySettings(true));
    }
    window.addEventListener('keydown', (event) => {
      if (this.automapVisible && (event.code === 'Equal' || event.code === 'NumpadAdd')) this.automapZoom = Math.min(3, this.automapZoom + .25);
      if (this.automapVisible && (event.code === 'Minus' || event.code === 'NumpadSubtract')) this.automapZoom = Math.max(.6, this.automapZoom - .25);
      if (this.automapVisible && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.code)) {
        const amount = event.shiftKey ? 3 : 1;
        if (event.code === 'ArrowLeft') this.automapPan.x += amount;
        if (event.code === 'ArrowRight') this.automapPan.x -= amount;
        if (event.code === 'ArrowUp') this.automapPan.z += amount;
        if (event.code === 'ArrowDown') this.automapPan.z -= amount;
        if (event.code === 'Home') this.automapPan = { x: 0, z: 0 };
        this.game.input.keys.delete(event.code);
        event.preventDefault();
      }
    });
    const automap = $<HTMLCanvasElement>('#automap');
    automap.addEventListener('pointerdown', (event) => {
      this.automapDrag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      automap.setPointerCapture(event.pointerId);
    });
    automap.addEventListener('pointermove', (event) => {
      if (!this.automapDrag || this.automapDrag.pointerId !== event.pointerId) return;
      this.automapPan.x += (event.clientX - this.automapDrag.x) / 12;
      this.automapPan.z += (event.clientY - this.automapDrag.y) / 12;
      this.automapDrag.x = event.clientX;
      this.automapDrag.y = event.clientY;
    });
    const stopMapDrag = (event: PointerEvent) => {
      if (this.automapDrag?.pointerId === event.pointerId) this.automapDrag = undefined;
    };
    automap.addEventListener('pointerup', stopMapDrag);
    automap.addEventListener('pointercancel', stopMapDrag);
    window.addEventListener('input-action', (event) => this.handleInputAction((event as CustomEvent<InputActionEvent>).detail));
    window.addEventListener('input-action-release', (event) => this.handleInputRelease((event as CustomEvent<InputActionEvent>).detail));
    window.addEventListener('input-menu-navigation', (event) => this.handleMenuNavigation((event as CustomEvent<MenuNavigationEvent>).detail));
    window.addEventListener('input-binding-captured', () => {
      this.capturingAction = undefined;
      $('#cancel-binding').toggleAttribute('hidden', true);
      this.buildControls();
    });
    window.addEventListener('input-binding-cancelled', () => this.cancelBindingCapture());
    window.addEventListener('input-lifecycle-pause', () => {
      if (this.game.mode === 'playing') this.game.pause();
    });
  }

  private update(snapshot: GameSnapshot): void {
    if (this.trailMap !== snapshot.map.id) { this.playerTrail.length = 0; this.trailMap = snapshot.map.id; this.automapPan = { x: 0, z: 0 }; }
    $('#health').textContent = String(Math.max(0, Math.ceil(snapshot.player.health)));
    $('#armor').textContent = String(Math.ceil(snapshot.player.armor));
    const weapon = WEAPONS[snapshot.player.weapon];
    $('#ammo').textContent = weapon.ammo === 'none' ? '--' : String(Math.floor(snapshot.player.ammo[weapon.ammo]));
    $('#message').textContent = snapshot.message;
    $('#map-name').textContent = `${snapshot.map.id} ${snapshot.map.title}`;
    if (snapshot.mode === 'dead') this.setPortrait('dead');
    else if (performance.now() >= this.portraitUntil) this.setPortrait('neutral');
    if (this.currentWeapon !== weapon.id) {
      $<HTMLElement>('#weapon-view').style.backgroundImage = `url('${runtimeUrl(weapon.idle)}')`;
      this.currentWeapon = weapon.id;
    }
    $('#keys').innerHTML = [...snapshot.player.credentials].map((key) => `<img alt="${key}" src="${runtimeUrl(`public_runtime/ui/icons/credential-${key}.png`)}">`).join('');
    const bossBar = $('#boss-bar');
    bossBar.toggleAttribute('hidden', !snapshot.boss);
    if (snapshot.boss) bossBar.querySelector<HTMLElement>('span')!.style.width = `${Math.max(0, snapshot.boss.health / snapshot.boss.maxHealth * 100)}%`;
    $('#hud').classList.toggle('active', snapshot.mode === 'playing' || snapshot.mode === 'paused');
    if (snapshot.mode === 'paused' && this.lastMode !== 'paused') this.showScreen('pause-menu');
    if (snapshot.mode === 'dead' && this.lastMode !== 'dead') this.showScreen('death-menu');
    if (snapshot.mode === 'complete') {
      this.showScreen('epilogue');
    }
    if (this.radialActive) this.updateWeaponRadial();
    if (this.lastMode !== snapshot.mode) this.updateContinue();
    if (this.automapVisible) this.drawAutomap(snapshot);
    const lastTrail = this.playerTrail[this.playerTrail.length - 1];
    if (!lastTrail || Math.hypot(lastTrail.x - snapshot.player.position.x, lastTrail.z - snapshot.player.position.z) > .8) {
      this.playerTrail.push({ x: snapshot.player.position.x, z: snapshot.player.position.z });
      if (this.playerTrail.length > 180) this.playerTrail.shift();
    }
    this.lastMode = snapshot.mode;
  }

  private drawAutomap(snapshot: GameSnapshot): void {
    const canvas = $('#automap') as HTMLCanvasElement;
    const context = canvas.getContext('2d')!;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#08090a'; context.fillRect(0, 0, canvas.width, canvas.height);
    const grid = snapshot.map.grid;
    const scale = Math.min((canvas.width - 20) / grid[0].length, (canvas.height - 20) / grid.length) * this.automapZoom;
    const playerGridX = snapshot.player.position.x / snapshot.map.cellSize;
    const playerGridZ = snapshot.player.position.z / snapshot.map.cellSize;
    const ox = canvas.width / 2 - playerGridX * scale + this.automapPan.x * scale;
    const oy = canvas.height / 2 - playerGridZ * scale + this.automapPan.z * scale;
    for (let z = 0; z < grid.length; z += 1) {
      for (let x = 0; x < grid[z].length; x += 1) {
        if (!snapshot.player.floorPlan && !this.game.world.visitedTiles.has(`${x},${z}`)) continue;
        const tile = grid[z][x];
        if (tile === '#') context.fillStyle = '#646a70';
        else if ('RYC'.includes(tile)) context.fillStyle = tile === 'R' ? '#d9232e' : tile === 'Y' ? '#e2b93b' : '#47bcd1';
        else if (tile === 'h') context.fillStyle = '#7a1018';
        else if (tile === 's' && !snapshot.player.floorPlan) context.fillStyle = '#1d2023';
        else context.fillStyle = '#34383d';
        context.fillRect(ox + x * scale, oy + z * scale, Math.ceil(scale), Math.ceil(scale));
      }
    }
    context.fillStyle = '#fffdf7';
    context.strokeStyle = '#238ca5';
    context.beginPath();
    this.playerTrail.forEach((point, index) => {
      const tx = ox + point.x / snapshot.map.cellSize * scale;
      const tz = oy + point.z / snapshot.map.cellSize * scale;
      if (index === 0) context.moveTo(tx, tz); else context.lineTo(tx, tz);
    });
    context.stroke();
    context.fillStyle = '#fffdf7';
    context.beginPath();
    const px = ox + snapshot.player.position.x / snapshot.map.cellSize * scale;
    const pz = oy + snapshot.player.position.z / snapshot.map.cellSize * scale;
    context.arc(px, pz, 2.5, 0, Math.PI * 2); context.fill();
    context.strokeStyle = '#d9232e'; context.beginPath(); context.moveTo(px, pz);
    context.lineTo(px - Math.sin(snapshot.player.yaw) * 7, pz - Math.cos(snapshot.player.yaw) * 7); context.stroke();
  }

  private showIntermission(): void {
    const episode = Number(this.game.world.map.id[1]);
    const art = this.game.world.map.index === 8 ? `episode-${episode}-outro` : `intermission-episode-${episode}`;
    $('#intermission-art').setAttribute('src', runtimeUrl(`public_runtime/ui/illustrations/${art}.png`));
    const tally = this.game.tally;
    const percent = (value: number, total: number) => total ? Math.round(value / total * 100) : 100;
    $('#tally').textContent = [
      `${this.game.world.map.id}: ${this.game.world.map.title}`,
      `Threats ${tally.kills}/${tally.totalKills}  ${percent(tally.kills, tally.totalKills)}%`,
      `Items   ${tally.items}/${tally.totalItems}  ${percent(tally.items, tally.totalItems)}%`,
      `Secrets ${tally.secrets}/${tally.totalSecrets}  ${percent(tally.secrets, tally.totalSecrets)}%`,
      `Time    ${Math.floor(tally.elapsed / 60)}:${String(Math.floor(tally.elapsed % 60)).padStart(2, '0')}`,
    ].join('\n');
    const episodeMaps = CAMPAIGN.episodes[episode - 1].maps;
    const currentIndex = episodeMaps.indexOf(this.game.world.map.id);
    $('#episode-progress').replaceChildren(...episodeMaps.map((id, index) => {
      const marker = document.createElement('span');
      marker.textContent = id;
      marker.className = index < currentIndex ? 'complete' : index === currentIndex ? 'current' : '';
      return marker;
    }));
    this.showScreen('intermission');
  }

  private flashWeapon(detail: { weapon: keyof typeof WEAPONS; duration: number }): void {
    const element = $<HTMLElement>('#weapon-view');
    const weapon = WEAPONS[detail.weapon];
    this.weaponFrameTimers.forEach((timer) => window.clearTimeout(timer));
    this.weaponFrameTimers = [];
    const frames = (this.game.assets.data.weapons[detail.weapon]?.view.fire?.map((frame) => frame.url) ?? [weapon.fire]).map(runtimeUrl);
    frames.forEach((url, index) => {
      this.weaponFrameTimers.push(window.setTimeout(() => { element.style.backgroundImage = `url('${url}')`; }, detail.duration * 1000 * index / Math.max(1, frames.length)));
    });
    if (this.weaponTimer) window.clearTimeout(this.weaponTimer);
    this.weaponTimer = window.setTimeout(() => { element.style.backgroundImage = `url('${runtimeUrl(weapon.idle)}')`; }, detail.duration * 1000);
    this.setPortrait(Math.floor(performance.now() / 180) % 2 ? 'glance-left' : 'glance-right');
    this.portraitUntil = performance.now() + Math.min(220, detail.duration * 1000);
  }

  private viewRecoil(detail: { amount: number }): void {
    if ($<HTMLInputElement>('#reduced-motion').checked) return;
    const weapon = $<HTMLElement>('#weapon-view');
    weapon.animate([
      { transform: 'translate(-50%, 0)' },
      { transform: `translate(-50%, ${Math.min(12, detail.amount * 3)}px)` },
      { transform: 'translate(-50%, 0)' },
    ], { duration: 100, easing: 'ease-out' });
  }

  private impactFeedback(detail: { kind: 'wall' | 'actor' }): void {
    if ($<HTMLInputElement>('#reduced-effects').checked) return;
    $<HTMLCanvasElement>('#game-canvas').animate(
      [{ filter: detail.kind === 'wall' ? 'brightness(1.18)' : 'contrast(1.15)' }, { filter: 'none' }],
      { duration: detail.kind === 'wall' ? 70 : 90 },
    );
  }

  private specialPortrait(state: PortraitState): void {
    this.setPortrait(state);
    this.portraitUntil = performance.now() + 900;
  }

  private animateWeaponSwitch(detail: { state: 'lowering' | 'raising' | 'ready'; duration: number }): void {
    const weapon = $<HTMLElement>('#weapon-view');
    this.weaponSwitchAnimation?.cancel();
    if ($<HTMLInputElement>('#reduced-motion').checked || detail.state === 'ready') {
      weapon.style.transform = 'translateX(-50%)';
      return;
    }
    const raised = 'translate(-50%, 0)';
    const lowered = 'translate(-50%, 100%)';
    const frames = detail.state === 'lowering' ? [raised, lowered] : [lowered, raised];
    this.weaponSwitchAnimation = weapon.animate(
      frames.map((transform) => ({ transform })),
      { duration: Math.max(1, detail.duration * 1000), easing: 'linear', fill: 'forwards' },
    );
  }

  private hurtFlash(detail: { direction?: 'left' | 'right' | 'center' } = {}): void {
    const shell = $('#game-shell');
    const direction = detail.direction ?? 'center';
    this.setPortrait(direction === 'left' ? 'pain-left' : direction === 'right' ? 'pain-right' : 'pain-center');
    this.portraitUntil = performance.now() + 320;
    if ($<HTMLInputElement>('#flash-effects').checked) {
      const flash = $('#damage-flash');
      flash.classList.remove('from-left', 'from-right');
      if (direction === 'left') flash.classList.add('from-left');
      if (direction === 'right') flash.classList.add('from-right');
      flash.classList.remove('active');
      void (flash as HTMLElement).offsetWidth;
      flash.classList.add('active');
    }
    if (!($<HTMLInputElement>('#screen-shake').checked) || $<HTMLInputElement>('#reduced-motion').checked) return;
    shell.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(4px,-2px)' }, { transform: 'translate(-3px,2px)' }, { transform: 'translate(0,0)' }], { duration: 120 });
  }

  private setPortrait(state: PortraitState): void {
    const damage = Math.max(0, Math.min(4, Math.floor((100 - Math.min(100, this.game.player.health)) / 20)));
    const special: Partial<Record<PortraitState, string>> = {
      'weapon-acquired': 'ui_portrait_weapon-acquired-grin_F_00.png',
      overcharge: 'ui_portrait_overcharge_F_00.png',
      invulnerable: 'ui_portrait_invulnerable_F_00.png',
      dead: 'ui_portrait_dead_F_00.png',
    };
    const file = special[state] ?? `ui_portrait_damage-${damage}_${state}_F_00.png`;
    $<HTMLImageElement>('#portrait').src = runtimeUrl(`public_runtime/ui/portrait/${file}`);
  }

  private showEpisodeIntro(): void {
    const copy = [
      'A routine first notice reaches a quiet regional office. The building closes around the file before anyone can explain what was reported.',
      'The loss has escaped the campus. Response infrastructure now stretches across a flooded city where every exclusion has become physical.',
      'The trail descends beneath accounting and architecture into the machinery that decides which futures are affordable.',
    ][this.pendingEpisode];
    $('#episode-intro-art').setAttribute('src', runtimeUrl(`public_runtime/ui/illustrations/episode-${this.pendingEpisode + 1}-intro.png`));
    $('#episode-intro-copy').textContent = copy;
    this.showScreen('episode-intro');
  }

  private toggleAutomap(mode: 'full' | 'overlay'): void {
    const canvas = $<HTMLCanvasElement>('#automap');
    if (this.automapVisible && this.automapMode === mode) this.automapVisible = false;
    else { this.automapVisible = true; this.automapMode = mode; }
    canvas.classList.toggle('overlay', this.automapMode === 'overlay');
    canvas.toggleAttribute('hidden', !this.automapVisible);
  }

  private showSlotScreen(mode: 'save' | 'load'): void {
    const container = $(`#${mode}-slot-list`);
    container.replaceChildren();
    this.game.manualSlots().forEach((slot) => {
      const row = document.createElement('div');
      row.className = 'slot-row';
      const preview = document.createElement('div');
      preview.className = 'slot-preview';
      const slotWithThumbnail = slot as typeof slot & { thumbnail?: { kind: 'image'; dataUrl: string } | { kind: 'placeholder'; label: string; palette: readonly [string, string] } };
      const thumbnail = slotWithThumbnail.thumbnail;
      if (thumbnail?.kind === 'image') {
        const image = document.createElement('img');
        image.src = thumbnail.dataUrl;
        image.alt = '';
        preview.append(image);
      } else if (thumbnail?.kind === 'placeholder') {
        preview.style.background = `linear-gradient(135deg, ${thumbnail.palette[0]}, ${thumbnail.palette[1]})`;
      }
      const label = document.createElement('strong');
      label.textContent = `Slot ${slot.slot}`;
      preview.append(label);
      const copy = document.createElement('span');
      copy.className = 'slot-copy';
      const name = mode === 'save' ? document.createElement('input') : document.createElement('strong');
      if (name instanceof HTMLInputElement) {
        name.value = slot.status === 'valid' ? slot.name : `Manual ${slot.slot}`;
        name.maxLength = 32;
        name.setAttribute('aria-label', `Slot ${slot.slot} name`);
      } else name.textContent = slot.name;
      const detail = document.createElement('small');
      detail.textContent = slot.detail;
      copy.append(name, detail);
      const action = document.createElement('button');
      action.textContent = mode === 'save' ? 'Write' : 'Load';
      action.disabled = mode === 'load' && slot.status !== 'valid';
      action.addEventListener('click', () => {
        if (mode === 'save') {
          const write = () => {
            const requestedName = name instanceof HTMLInputElement ? name.value.trim() : '';
            this.game.saveManual(slot.slot, requestedName || `Manual ${slot.slot}`);
            this.updateContinue();
            this.showScreen('pause-menu');
          };
          if (slot.status === 'valid') this.confirm('Overwrite save?', `${slot.name} will be replaced and cannot be recovered.`, 'Overwrite', write);
          else write();
        } else if (this.game.loadManual(slot.slot)) {
          if (this.game.mode === 'paused') this.showScreen('pause-menu');
          else this.hideScreens();
        }
      });
      row.append(preview, copy, action);
      container.append(row);
    });
    this.showScreen(`${mode}-slots`);
  }

  private showLevelSelect(): void {
    const container = $('#level-select-list');
    container.replaceChildren();
    const progress = this.game.campaignProgress();
    (Object.keys(CAMPAIGN.maps) as MapId[]).forEach((id) => {
      const map = CAMPAIGN.maps[id];
      const episodeIndex = Number(id[1]) - 1;
      const episode = CAMPAIGN.episodes[episodeIndex];
      const mapIndex = episode.maps.indexOf(id);
      const unlocked = this.game.isEpisodeUnlocked(episodeIndex)
        && (mapIndex === 0 || progress.completedMaps.includes(id) || progress.completedMaps.includes(episode.maps[mapIndex - 1]));
      const button = document.createElement('button');
      button.textContent = `${id} ${map.title}`;
      button.disabled = !unlocked;
      button.title = unlocked ? `Start ${id}` : `${id} - locked`;
      button.addEventListener('click', () => {
        this.game.audio.unlock();
        this.game.startMapFromSelect(id, 'field-adjuster');
        this.hideScreens();
      });
      container.append(button);
    });
    this.showScreen('level-select');
  }

  private buildControls(): void {
    const container = $('#controls-list');
    container.replaceChildren();
    INPUT_ACTIONS.forEach((action) => {
      const row = document.createElement('div');
      row.className = 'control-row';
      const label = document.createElement('span');
      label.textContent = action.split('-').map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');
      const button = document.createElement('button');
      const bindings = this.game.input.getBinding(action);
      button.textContent = bindings.length ? bindings.map(bindingLabel).join(' / ') : 'Unbound';
      button.title = `Rebind ${label.textContent}`;
      button.classList.toggle('capturing', this.capturingAction === action);
      button.addEventListener('click', () => {
        this.capturingAction = action;
        this.game.input.beginBindingCapture(action);
        button.textContent = 'Press an input';
        button.classList.add('capturing');
        $('#cancel-binding').toggleAttribute('hidden', false);
      });
      row.append(label, button);
      container.append(row);
    });
  }

  private cancelBindingCapture(): void {
    this.game.input.cancelBindingCapture();
    this.capturingAction = undefined;
    $('#cancel-binding').toggleAttribute('hidden', true);
    if ($('#controls-menu').classList.contains('active')) this.buildControls();
  }

  private handleInputAction(detail: InputActionEvent): void {
    if (detail.repeat || this.game.mode !== 'playing') return;
    if (detail.action === 'automap') this.toggleAutomap('full');
    else if (detail.action === 'automap-overlay') this.toggleAutomap('overlay');
    else if (detail.action === 'weapon-radial') this.openWeaponRadial();
    else if (detail.action === 'pause' && detail.source === 'touch') this.game.pause();
  }

  private handleInputRelease(detail: InputActionEvent): void {
    if (detail.action !== 'weapon-radial' || !this.radialActive) return;
    if (this.radialWeapon) this.game.selectWeapon(this.radialWeapon);
    this.radialActive = false;
    this.game.setRadialSelecting(false);
    $('#weapon-radial').toggleAttribute('hidden', true);
  }

  private openWeaponRadial(): void {
    this.radialActive = true;
    this.game.setRadialSelecting(true);
    const container = $('#weapon-radial');
    container.replaceChildren();
    const weapons = Object.values(WEAPONS).sort((left, right) => left.slot - right.slot);
    weapons.forEach((weapon, index) => {
      const button = document.createElement('button');
      const angle = index / weapons.length * Math.PI * 2;
      button.textContent = String(weapon.slot);
      button.title = weapon.id;
      button.disabled = !this.game.player.weapons.has(weapon.id);
      button.style.transform = `translate(${Math.sin(angle) * 72}px, ${-Math.cos(angle) * 72}px)`;
      container.append(button);
    });
    container.toggleAttribute('hidden', false);
    this.updateWeaponRadial();
  }

  private updateWeaponRadial(): void {
    const owned = Object.values(WEAPONS).filter((weapon) => this.game.player.weapons.has(weapon.id)).sort((left, right) => left.slot - right.slot);
    if (!owned.length) return;
    const stick = this.game.input.gamepadLook;
    if (Math.hypot(stick.x, stick.y) > .35) {
      const angle = (Math.atan2(stick.x, -stick.y) + Math.PI * 2) % (Math.PI * 2);
      this.radialWeapon = owned[Math.round(angle / (Math.PI * 2) * owned.length) % owned.length].id;
    } else this.radialWeapon ??= this.game.player.weapon;
    document.querySelectorAll<HTMLButtonElement>('#weapon-radial button').forEach((button) => {
      button.classList.toggle('selected', Number(button.textContent) === WEAPONS[this.radialWeapon!].slot);
    });
  }

  private handleMenuNavigation(detail: MenuNavigationEvent): void {
    const active = document.querySelector<HTMLElement>('.screen.active');
    if (!active || this.capturingAction) return;
    const focusable = [...active.querySelectorAll<HTMLElement>('button:not(:disabled):not([hidden]), select:not(:disabled), input:not(:disabled)')]
      .filter((element) => element.offsetParent !== null);
    if (!focusable.length) return;
    const current = document.activeElement instanceof HTMLElement ? focusable.indexOf(document.activeElement) : -1;
    if (detail.action === 'up' || detail.action === 'down') {
      const direction = detail.action === 'down' ? 1 : -1;
      focusable[(current + direction + focusable.length) % focusable.length].focus();
      return;
    }
    if (detail.action === 'left' || detail.action === 'right') {
      const element = current >= 0 ? focusable[current] : focusable[0];
      const direction = detail.action === 'right' ? 1 : -1;
      if (element instanceof HTMLInputElement && element.type === 'range') {
        direction > 0 ? element.stepUp() : element.stepDown();
        element.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (element instanceof HTMLSelectElement) {
        element.selectedIndex = Math.max(0, Math.min(element.options.length - 1, element.selectedIndex + direction));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      } else focusable[(current + direction + focusable.length) % focusable.length].focus();
      return;
    }
    if (detail.action === 'confirm' && detail.source === 'gamepad' && !detail.repeat) {
      (current >= 0 ? focusable[current] : focusable[0]).click();
      return;
    }
    if (detail.action !== 'back' || detail.repeat) return;
    if (active.id === 'controls-menu') $<HTMLButtonElement>('#controls-back').click();
    else if (active.id === 'save-slots' || active.id === 'load-slots') active.querySelector<HTMLElement>('.slot-back')?.click();
    else if (active.id === 'pause-menu') $<HTMLButtonElement>('#resume-game').click();
    else active.querySelector<HTMLElement>('[data-back]')?.click();
  }

  private updateEpisodeLocks(): void {
    document.querySelectorAll<HTMLButtonElement>('.episode-card').forEach((button, index) => {
      button.disabled = !this.game.isEpisodeUnlocked(index);
      button.title = button.disabled ? `${button.getAttribute('aria-label')} - locked` : button.getAttribute('aria-label') ?? '';
    });
  }

  private loadSettings(): void {
    try {
      const settings = JSON.parse(localStorage.getItem('red-ledger-settings-v1') ?? '{}') as Record<string, unknown>;
      if (typeof settings.sensitivity === 'number') $<HTMLInputElement>('#sensitivity').value = String(settings.sensitivity);
      if (typeof settings.renderScale === 'number') $<HTMLSelectElement>('#render-scale').value = String(settings.renderScale);
      if (settings.hudMode === 'minimal') $<HTMLSelectElement>('#hud-mode').value = 'minimal';
      for (const id of ['classic-input', 'screen-shake', 'reduced-motion', 'high-contrast', 'reduced-effects', 'flash-effects']) {
        if (typeof settings[id] === 'boolean') $<HTMLInputElement>(`#${id}`).checked = Boolean(settings[id]);
      }
    } catch { localStorage.removeItem('red-ledger-settings-v1'); }
    $<HTMLInputElement>('#master-volume').value = String(this.game.audio.masterVolume);
    $<HTMLInputElement>('#music-volume').value = String(this.game.audio.musicVolume);
    $<HTMLInputElement>('#sfx-volume').value = String(this.game.audio.sfxVolume);
    $<HTMLInputElement>('#mute-audio').checked = this.game.audio.muted;
    this.applySettings(false);
  }

  private applySettings(persist: boolean): void {
    const sensitivity = Number($<HTMLInputElement>('#sensitivity').value);
    const renderScale = Number($<HTMLSelectElement>('#render-scale').value);
    const hudMode = $<HTMLSelectElement>('#hud-mode').value;
    this.game.sensitivity = sensitivity;
    this.game.classicInput = $<HTMLInputElement>('#classic-input').checked;
    this.game.setRenderScale(renderScale);
    $('#hud').classList.toggle('minimal', hudMode === 'minimal');
    $('#game-shell').classList.toggle('reduced-motion', $<HTMLInputElement>('#reduced-motion').checked);
    $('#game-shell').classList.toggle('high-contrast-attacks', $<HTMLInputElement>('#high-contrast').checked);
    this.game.accessibility.highContrast = $<HTMLInputElement>('#high-contrast').checked;
    this.game.accessibility.reducedEffects = $<HTMLInputElement>('#reduced-effects').checked;
    this.game.audio.setMasterVolume(Number($<HTMLInputElement>('#master-volume').value));
    this.game.audio.setMusicVolume(Number($<HTMLInputElement>('#music-volume').value));
    this.game.audio.setSfxVolume(Number($<HTMLInputElement>('#sfx-volume').value));
    this.game.audio.setMuted($<HTMLInputElement>('#mute-audio').checked);
    window.dispatchEvent(new CustomEvent('accessibility-settings-change', { detail: {
      reducedMotion: $<HTMLInputElement>('#reduced-motion').checked,
      highContrast: $<HTMLInputElement>('#high-contrast').checked,
      reducedEffects: $<HTMLInputElement>('#reduced-effects').checked,
      flashEffects: $<HTMLInputElement>('#flash-effects').checked,
      screenShake: $<HTMLInputElement>('#screen-shake').checked,
    } }));
    if (!persist) return;
    localStorage.setItem('red-ledger-settings-v1', JSON.stringify({
      sensitivity,
      renderScale,
      hudMode,
      'classic-input': $<HTMLInputElement>('#classic-input').checked,
      'screen-shake': $<HTMLInputElement>('#screen-shake').checked,
      'reduced-motion': $<HTMLInputElement>('#reduced-motion').checked,
      'high-contrast': $<HTMLInputElement>('#high-contrast').checked,
      'reduced-effects': $<HTMLInputElement>('#reduced-effects').checked,
      'flash-effects': $<HTMLInputElement>('#flash-effects').checked,
    }));
  }

  private updateContinue(): void { ($('#continue-game') as HTMLButtonElement).disabled = !this.game.hasSave(); }
  private hideScreens(): void { document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active')); }
  private showScreen(id: string): void {
    this.hideScreens();
    const screen = $<HTMLElement>(`#${id}`);
    screen.classList.add('active');
    requestAnimationFrame(() => screen.querySelector<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled)')?.focus());
  }

  private confirm(title: string, copy: string, acceptLabel: string, action: () => void): void {
    const dialog = $<HTMLDialogElement>('#confirm-dialog');
    this.focusBeforeDialog = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    this.confirmAction = action;
    $('#confirm-title').textContent = title;
    $('#confirm-copy').textContent = copy;
    $('#confirm-accept').textContent = acceptLabel;
    if (!dialog.open) dialog.showModal();
    $<HTMLButtonElement>('#confirm-cancel').focus();
  }

  private closeConfirm(): void {
    const dialog = $<HTMLDialogElement>('#confirm-dialog');
    this.confirmAction = undefined;
    if (dialog.open) dialog.close();
    this.focusBeforeDialog?.focus();
    this.focusBeforeDialog = undefined;
  }

  private confirmMainMenu(): void {
    this.confirm('Return to main menu?', 'Unsaved progress since the last save will be lost.', 'Main Menu', () => {
      this.game.audio.stopMusic();
      this.game.mode = 'menu';
      this.showScreen('menu');
    });
  }

  private endSession(): void {
    this.game.audio.stopMusic();
    this.game.mode = 'menu';
    this.showScreen('session-ended');
    window.close();
  }
}
