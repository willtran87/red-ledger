import { CAMPAIGN, type MapId } from '../data';
import { INPUT_ACTIONS, bindingLabel, type InputAction } from './InputBindings';
import type { InputActionEvent, MenuNavigationEvent } from './InputSystem';
import { WEAPONS, type GameDifficulty } from './definitions';
import { GameEngine, type GameSnapshot } from './GameEngine';
import { runtimeUrl } from './AssetCatalog';

type PortraitState = 'neutral' | 'pain-center' | 'pain-left' | 'pain-right' | 'glance-left' | 'glance-right' | 'weapon-acquired' | 'overcharge' | 'invulnerable' | 'dead';

const DIFFICULTY_OPTIONS: ReadonlyArray<{ id: GameDifficulty; label: string; detail: string }> = [
  { id: 'orientation', label: 'Orientation', detail: 'Story-focused. More supplies, slower threats, forgiving damage.' },
  { id: 'desk-adjuster', label: 'Desk Adjuster', detail: 'A measured first campaign with generous recovery.' },
  { id: 'field-adjuster', label: 'Field Adjuster', detail: 'Recommended. The intended balance of pressure, supplies, and speed.' },
  { id: 'catastrophe-team', label: 'Catastrophe Team', detail: 'Hard placements and lean supplies demand route mastery.' },
  { id: 'binding-authority', label: 'Binding Authority', detail: 'Relentless speed and damage for fully mastered files.' },
];

const formatTime = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const formatLabel = (value: string): string => value.split('-').map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');

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
  private lastAnnouncedMessage = '';
  private useFeedbackTimer?: number;
  private weaponVisualToken = 0;
  private weaponBobPhase = 0;
  private weaponBob = { x: 0, y: 0 };
  private lastView?: { x: number; z: number; yaw: number };

  constructor(readonly game: GameEngine) {
    this.buildEpisodeCards();
    this.buildDifficulties();
    this.bindActions();
    this.game.onChange = (snapshot) => this.update(snapshot);
    this.game.onIntermission = () => this.showIntermission();
    this.updateContinue();
    window.addEventListener('weapon-fire', (event) => this.flashWeapon((event as CustomEvent).detail));
    window.addEventListener('view-recoil', (event) => this.viewRecoil((event as CustomEvent<{ amount: number }>).detail));
    window.addEventListener('weapon-impact', (event) => this.impactFeedback((event as CustomEvent<{ kind: 'wall' | 'actor'; killed?: boolean }>).detail));
    window.addEventListener('weapon-dry', (event) => this.dryWeapon((event as CustomEvent<{ weapon: keyof typeof WEAPONS }>).detail));
    window.addEventListener('player-portrait', (event) => this.specialPortrait((event as CustomEvent<{ state: PortraitState }>).detail.state));
    window.addEventListener('weapon-switch', (event) => this.animateWeaponSwitch((event as CustomEvent<{
      state: 'lowering' | 'raising' | 'ready'; duration: number;
    }>).detail));
    window.addEventListener('player-hurt', (event) => this.hurtFlash((event as CustomEvent<{ direction?: 'left' | 'right' | 'center' }>).detail));
    window.addEventListener('use-failed', (event) => this.useFailure((event as CustomEvent<{
      reason: 'credential' | 'encounter' | 'nothing';
      direction: 'left' | 'right' | 'center';
      icon: string;
      credential?: string;
    }>).detail));
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
    const detail = $('#difficulty-detail');
    const describe = (copy: string) => { detail.textContent = copy; };
    DIFFICULTY_OPTIONS.forEach(({ id, label, detail: copy }) => {
      const button = document.createElement('button');
      button.textContent = id === 'field-adjuster' ? `${label} - Recommended` : label;
      button.addEventListener('focus', () => describe(copy));
      button.addEventListener('mouseenter', () => describe(copy));
      button.addEventListener('click', () => {
        this.game.audio.unlock();
        this.pendingDifficulty = id;
        this.showEpisodeIntro();
      });
      container.append(button);
    });
    describe(DIFFICULTY_OPTIONS.find(({ id }) => id === 'field-adjuster')!.detail);
  }

  private bindActions(): void {
    $('#new-game').addEventListener('click', () => { this.updateEpisodeLocks(); this.showScreen('episode-menu'); });
    $('#continue-game').addEventListener('click', () => {
      this.game.audio.unlock();
      if (this.game.load()) {
        $('#menu-feedback').textContent = '';
        this.prepareGameEntry();
      } else {
        const message = 'No valid save is available. Start a new game to create one.';
        $('#menu-feedback').textContent = message;
        this.announce(message);
      }
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
    $('#begin-episode').addEventListener('click', () => { this.game.startEpisode(this.pendingEpisode, this.pendingDifficulty); this.prepareGameEntry(); });
    $('#enter-file').addEventListener('click', () => this.enterReadyState());
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
    if (snapshot.message && snapshot.message !== this.lastAnnouncedMessage) {
      this.lastAnnouncedMessage = snapshot.message;
      this.announce(snapshot.message);
    } else if (!snapshot.message) this.lastAnnouncedMessage = '';
    $('#map-name').textContent = `${snapshot.map.id} ${snapshot.map.title}`;
    $('#objective').textContent = snapshot.objective;
    const interaction = snapshot.interaction;
    const prompt = $('#context-prompt');
    prompt.toggleAttribute('hidden', !interaction);
    prompt.classList.toggle('locked', interaction?.state === 'locked');
    if (interaction) {
      prompt.querySelector<HTMLImageElement>('img')!.src = runtimeUrl(`public_runtime/ui/icons/${interaction.icon}.png`);
      prompt.querySelector<HTMLElement>('span')!.textContent = interaction.label;
    }
    const streak = $<HTMLElement>('#combat-streak');
    streak.toggleAttribute('hidden', snapshot.momentum.chain < 2);
    streak.querySelector<HTMLElement>('strong')!.textContent = `x${snapshot.momentum.chain}`;
    streak.querySelector<HTMLElement>('span')!.textContent = `${snapshot.momentum.score} pts`;
    streak.style.setProperty('--momentum', `${Math.max(0, Math.min(100, snapshot.momentum.timer / 4 * 100))}%`);
    if (snapshot.mode === 'dead') this.setPortrait('dead');
    else if (performance.now() >= this.portraitUntil) this.setPortrait('neutral');
    if (this.currentWeapon !== weapon.id) {
      this.cancelWeaponFrames();
      $<HTMLElement>('#weapon-view').style.backgroundImage = `url('${runtimeUrl(weapon.idle)}')`;
      this.currentWeapon = weapon.id;
    }
    this.updateWeaponBob(snapshot);
    $('#keys').innerHTML = [...snapshot.player.credentials].map((key) => `<img alt="${key}" src="${runtimeUrl(`public_runtime/ui/icons/credential-${key}.png`)}">`).join('');
    const bossBar = $('#boss-bar');
    bossBar.toggleAttribute('hidden', !snapshot.boss);
    if (snapshot.boss) {
      bossBar.querySelector<HTMLElement>('strong')!.textContent = formatLabel(snapshot.boss.id);
      const phase = this.game.enemyBehavior.getActorState(snapshot.boss.uid)?.phaseId;
      bossBar.querySelector<HTMLElement>('small')!.textContent = phase ? formatLabel(phase) : 'Active';
      bossBar.querySelector<HTMLElement>('span')!.style.width = `${Math.max(0, snapshot.boss.health / snapshot.boss.maxHealth * 100)}%`;
    }
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

    const mapPoint = (x: number, z: number) => ({ x: ox + x / snapshot.map.cellSize * scale, y: oy + z / snapshot.map.cellSize * scale });
    this.game.world.doors.forEach((door) => {
      if (!snapshot.player.floorPlan && !this.game.world.visitedTiles.has(`${door.x},${door.z}`)) return;
      const point = mapPoint((door.x + .5) * snapshot.map.cellSize, (door.z + .5) * snapshot.map.cellSize);
      context.fillStyle = door.open ? '#646a70' : door.credential === 'red' ? '#d9232e' : door.credential === 'yellow' ? '#e2b93b' : door.credential === 'cyan' ? '#47bcd1' : '#f4f1ea';
      context.fillRect(point.x - 2, point.y - (door.open ? 1 : 3), 4, door.open ? 2 : 6);
    });
    const exit = mapPoint(snapshot.map.exit.x * snapshot.map.cellSize, snapshot.map.exit.z * snapshot.map.cellSize);
    context.strokeStyle = '#ffe17a'; context.lineWidth = 1.5; context.beginPath();
    context.moveTo(exit.x - 4, exit.y - 4); context.lineTo(exit.x + 4, exit.y + 4);
    context.moveTo(exit.x + 4, exit.y - 4); context.lineTo(exit.x - 4, exit.y + 4); context.stroke();
    this.game.world.pickups.filter((pickup) => !pickup.collected).forEach((pickup) => {
      const tile = `${Math.floor(pickup.position.x / snapshot.map.cellSize)},${Math.floor(pickup.position.z / snapshot.map.cellSize)}`;
      if (!snapshot.player.floorPlan && !this.game.world.visitedTiles.has(tile)) return;
      const point = mapPoint(pickup.position.x, pickup.position.z);
      context.fillStyle = pickup.kind === 'credential' ? '#ffe17a' : pickup.kind === 'weapon' ? '#d9232e' : '#47bcd1';
      context.fillRect(point.x - 1.5, point.y - 1.5, 3, 3);
    });
    if (snapshot.player.powerups.forensic > 0) this.game.world.actors.filter((actor) => !actor.dead && !actor.phaseLocked).forEach((actor) => {
      const point = mapPoint(actor.position.x, actor.position.z);
      context.fillStyle = actor.kind === 'boss' ? '#ffe17a' : '#d9232e';
      context.beginPath(); context.arc(point.x, point.y, actor.kind === 'boss' ? 2.5 : 1.5, 0, Math.PI * 2); context.fill();
    });
    snapshot.map.triggers.filter((trigger) => !this.game.world.activatedMechanisms.has(trigger.id)
      && this.game.world.visitedTiles.has(`${Math.floor(trigger.x)},${Math.floor(trigger.z)}`)
      && ['open-door', 'toggle-sectors', 'lower-floor', 'raise-floor', 'drain-liquid', 'flood-liquid', 'move-walls'].includes(trigger.action))
      .forEach((trigger) => {
        const point = mapPoint(trigger.x * snapshot.map.cellSize, trigger.z * snapshot.map.cellSize);
        context.fillStyle = '#e2b93b'; context.fillRect(point.x - 2, point.y - 2, 4, 4);
      });
    snapshot.map.secrets.filter((secret) => this.game.world.discoveredSecrets.has(secret.id)).forEach((secret) => {
      const point = mapPoint(secret.at.x * snapshot.map.cellSize, secret.at.z * snapshot.map.cellSize);
      context.strokeStyle = '#fffdf7'; context.strokeRect(point.x - 3, point.y - 3, 6, 6);
    });
    if (this.automapMode === 'full') {
      context.fillStyle = '#d4d2cb'; context.font = '6px monospace';
      context.fillText('EXIT X   DOOR |   RESOURCE []   CONTROL []', 7, canvas.height - 7);
    }
  }

  private showIntermission(): void {
    const episode = Number(this.game.world.map.id[1]);
    const art = this.game.world.map.index === 8 ? `episode-${episode}-outro` : `intermission-episode-${episode}`;
    $('#intermission-art').setAttribute('src', runtimeUrl(`public_runtime/ui/illustrations/${art}.png`));
    const tally = this.game.tally;
    const result = this.game.mapResult;
    const percent = (value: number, total: number) => total ? Math.round(value / total * 100) : 100;
    $('#intermission-grade').textContent = result ? result.performance.grade : '-';
    $('#tally').textContent = [
      `${this.game.world.map.id}: ${this.game.world.map.title}`,
      `Threats ${tally.kills}/${tally.totalKills}  ${percent(tally.kills, tally.totalKills)}%`,
      `Items   ${tally.items}/${tally.totalItems}  ${percent(tally.items, tally.totalItems)}%`,
      `Secrets ${tally.secrets}/${tally.totalSecrets}  ${percent(tally.secrets, tally.totalSecrets)}%`,
      `Score   ${this.game.momentum.score}`,
      ...(result?.completionBonus ? [`Clear bonus +${result.completionBonus}`] : []),
      `Best chain x${this.game.momentum.best}`,
      `Time    ${formatTime(tally.elapsed)} / Par ${formatTime(this.game.world.map.parSeconds)}`,
      ...(result ? [`Record  ${formatTime(result.record.bestTime)} / ${result.record.highScore} pts / ${result.record.completions} clear${result.record.completions === 1 ? '' : 's'}`] : []),
    ].join('\n');
    $('#result-bests').textContent = result?.newBests.length ? `NEW: ${result.newBests.join(' / ')}` : 'Record held';
    const episodeMaps = CAMPAIGN.episodes[episode - 1].maps;
    const progress = this.game.campaignProgress();
    const visibleMaps = episodeMaps.filter((id) => !CAMPAIGN.maps[id].secretMap
      || id === this.game.world.map.id || progress.discoveredSecretMaps.includes(id) || progress.completedMaps.includes(id));
    $('#episode-progress').replaceChildren(...visibleMaps.map((id) => {
      const marker = document.createElement('span');
      marker.textContent = id;
      marker.className = id === this.game.world.map.id ? 'current' : progress.completedMaps.includes(id) ? 'complete' : '';
      return marker;
    }));
    this.showScreen('intermission');
    this.playCompletionBurst();
  }

  private playCompletionBurst(): void {
    if ($<HTMLInputElement>('#reduced-effects').checked) return;
    const screen = $('#intermission');
    screen.querySelectorAll('.completion-particle').forEach((element) => element.remove());
    const texture = runtimeUrl('public_runtime/effects/particle-status-feedback/fx_particle-status-feedback_F_08.png');
    for (let index = 0; index < 20; index += 1) {
      const particle = document.createElement('i');
      particle.className = 'completion-particle';
      particle.setAttribute('aria-hidden', 'true');
      particle.style.backgroundImage = `url('${texture}')`;
      screen.append(particle);
      const side = index % 2 ? 1 : -1;
      const spread = side * (70 + (index * 43) % 360);
      const rise = -90 - (index * 29) % 180;
      const fall = 130 + (index * 31) % 210;
      const animation = particle.animate([
        { opacity: 0, transform: 'translate(-50%, -50%) scale(.45) rotate(0deg)' },
        { opacity: 1, transform: `translate(calc(-50% + ${spread * .55}px), calc(-50% + ${rise}px)) scale(1) rotate(${side * 120}deg)`, offset: .28 },
        { opacity: 0, transform: `translate(calc(-50% + ${spread}px), calc(-50% + ${fall}px)) scale(.68) rotate(${side * 520}deg)` },
      ], { duration: 900 + (index % 4) * 110, easing: 'cubic-bezier(.18,.7,.32,1)', fill: 'forwards' });
      void animation.finished.then(() => particle.remove(), () => particle.remove());
    }
  }

  private flashWeapon(detail: { weapon: keyof typeof WEAPONS; duration: number }): void {
    const element = $<HTMLElement>('#weapon-view');
    const weapon = WEAPONS[detail.weapon];
    this.cancelWeaponFrames();
    const token = this.weaponVisualToken;
    const frames = (this.game.assets.data.weapons[detail.weapon]?.view.fire?.map((frame) => frame.url) ?? [weapon.fire]).map(runtimeUrl);
    const visualDuration = Math.max(detail.duration * 1000, frames.length * 38);
    frames.forEach((url, index) => {
      this.weaponFrameTimers.push(window.setTimeout(() => {
        if (token === this.weaponVisualToken) element.style.backgroundImage = `url('${url}')`;
      }, visualDuration * index / Math.max(1, frames.length)));
    });
    this.weaponTimer = window.setTimeout(() => {
      if (token === this.weaponVisualToken && this.currentWeapon === detail.weapon) element.style.backgroundImage = `url('${runtimeUrl(weapon.idle)}')`;
    }, visualDuration);
    this.flashMuzzle(detail.weapon);
    this.setPortrait(Math.floor(performance.now() / 180) % 2 ? 'glance-left' : 'glance-right');
    this.portraitUntil = performance.now() + Math.min(220, detail.duration * 1000);
  }

  private viewRecoil(detail: { amount: number }): void {
    if ($<HTMLInputElement>('#reduced-motion').checked) return;
    const weapon = $<HTMLElement>('#weapon-view');
    const kick = Math.min(14, Math.max(3, detail.amount * 180));
    weapon.animate([
      { translate: '0 0' },
      { translate: `0 ${kick}px` },
      { translate: '0 0' },
    ], { duration: 125, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }

  private impactFeedback(detail: { kind: 'wall' | 'actor'; killed?: boolean }): void {
    if ($<HTMLInputElement>('#reduced-effects').checked) return;
    if (detail.kind === 'actor') {
      const marker = $('#hit-marker');
      marker.classList.remove('active', 'kill');
      if (detail.killed) marker.classList.add('kill');
      void (marker as HTMLElement).offsetWidth;
      marker.classList.add('active');
      return;
    }
    $<HTMLCanvasElement>('#game-canvas').animate([{ filter: 'brightness(1.12)' }, { filter: 'none' }], { duration: 65 });
  }

  private cancelWeaponFrames(): void {
    this.weaponVisualToken += 1;
    this.weaponFrameTimers.forEach((timer) => window.clearTimeout(timer));
    this.weaponFrameTimers = [];
    if (this.weaponTimer) window.clearTimeout(this.weaponTimer);
    this.weaponTimer = undefined;
  }

  private flashMuzzle(weapon: keyof typeof WEAPONS): void {
    if ($<HTMLInputElement>('#reduced-effects').checked || weapon === 'claim-stamp') return;
    const flash = $<HTMLElement>('#muzzle-flash');
    const frame = weapon === 'binding-engine' || weapon === 'plasma-copier' ? 6
      : weapon === 'catastrophe-launcher' ? 7 : weapon === 'umbra-saw' ? 5
        : weapon === 'audit-repeater' || weapon === 'twin-bore-riveter' ? 3 : 2;
    const anchors: Partial<Record<keyof typeof WEAPONS, [number, number]>> = {
      'staple-driver': [50, 35], 'audit-repeater': [49, 34], 'twin-bore-riveter': [51, 36],
      'catastrophe-launcher': [52, 35], 'plasma-copier': [50, 34], 'binding-engine': [50, 33], 'umbra-saw': [53, 32],
    };
    const [left, bottom] = anchors[weapon] ?? [50, 35];
    flash.style.left = `${left}%`;
    flash.style.bottom = `${bottom}%`;
    flash.style.backgroundImage = `url('${runtimeUrl(`public_runtime/effects/particle-weapon-feedback/fx_particle-weapon-feedback_F_${String(frame).padStart(2, '0')}.png`)}')`;
    flash.getAnimations().forEach((animation) => animation.cancel());
    flash.animate([
      { opacity: 0, transform: 'translate(-50%, 30%) scale(.45) rotate(-8deg)' },
      { opacity: 1, transform: 'translate(-50%, 0) scale(1.25) rotate(4deg)' },
      { opacity: 0, transform: 'translate(-50%, -12%) scale(.72) rotate(10deg)' },
    ], { duration: 105, easing: 'steps(3, end)' });
  }

  private dryWeapon(detail: { weapon: keyof typeof WEAPONS }): void {
    const element = $<HTMLElement>('#weapon-view');
    const dry = this.game.assets.data.weapons[detail.weapon]?.view.dry?.[0]?.url;
    if (!dry) return;
    this.cancelWeaponFrames();
    const token = this.weaponVisualToken;
    element.style.backgroundImage = `url('${runtimeUrl(dry)}')`;
    if (!($<HTMLInputElement>('#reduced-motion').checked)) {
      element.animate([{ translate: '0 0' }, { translate: '2px 2px' }, { translate: '0 0' }], { duration: 90 });
    }
    this.weaponTimer = window.setTimeout(() => {
      if (token === this.weaponVisualToken && this.currentWeapon === detail.weapon) element.style.backgroundImage = `url('${runtimeUrl(WEAPONS[detail.weapon].idle)}')`;
    }, 120);
  }

  private updateWeaponBob(snapshot: GameSnapshot): void {
    const reduced = $<HTMLInputElement>('#reduced-motion').checked;
    const current = { x: snapshot.player.position.x, z: snapshot.player.position.z, yaw: snapshot.player.yaw };
    const previous = this.lastView;
    this.lastView = current;
    const distance = previous ? Math.hypot(current.x - previous.x, current.z - previous.z) : 0;
    this.weaponBobPhase += Math.min(.45, distance * 2.6);
    const moving = distance > .002 && !reduced;
    const targetX = moving ? Math.sin(this.weaponBobPhase) * 5 : 0;
    const targetY = moving ? Math.abs(Math.cos(this.weaponBobPhase)) * 4 : 0;
    this.weaponBob.x += (targetX - this.weaponBob.x) * .34;
    this.weaponBob.y += (targetY - this.weaponBob.y) * .34;
    const element = $<HTMLElement>('#weapon-view');
    element.style.setProperty('--weapon-bob-x', `${this.weaponBob.x.toFixed(2)}px`);
    element.style.setProperty('--weapon-bob-y', `${this.weaponBob.y.toFixed(2)}px`);
  }

  private prepareGameEntry(): void {
    if (matchMedia('(pointer: coarse)').matches) {
      this.hideScreens();
      return;
    }
    this.game.pause();
    this.hideScreens();
    $('#ready-overlay').toggleAttribute('hidden', false);
    $<HTMLButtonElement>('#enter-file').focus();
  }

  private enterReadyState(): void {
    $('#ready-overlay').toggleAttribute('hidden', true);
    this.game.resume();
    const request = $<HTMLCanvasElement>('#game-canvas').requestPointerLock() as Promise<void> | undefined;
    void request?.catch(() => undefined);
  }

  private useFailure(detail: { reason: 'credential' | 'encounter' | 'nothing'; direction: 'left' | 'right' | 'center'; icon: string; credential?: string }): void {
    const feedback = $<HTMLElement>('#use-feedback');
    const copy = detail.reason === 'credential'
      ? `${detail.credential ?? 'Required'} credential needed`
      : detail.reason === 'encounter' ? 'Control locked while threats remain' : 'Nothing usable nearby';
    const icon = detail.reason === 'credential'
      ? `public_runtime/ui/icons/credential-${detail.icon}.png`
      : `public_runtime/ui/icons/${detail.reason === 'encounter' ? 'minimal-alert' : 'minimal-terminal'}.png`;
    feedback.className = `from-${detail.direction}`;
    feedback.querySelector<HTMLImageElement>('img')!.src = runtimeUrl(icon);
    feedback.querySelector<HTMLElement>('span')!.textContent = copy;
    feedback.toggleAttribute('hidden', false);
    this.announce(copy);
    if (this.useFeedbackTimer) window.clearTimeout(this.useFeedbackTimer);
    this.useFeedbackTimer = window.setTimeout(() => feedback.toggleAttribute('hidden', true), detail.reason === 'nothing' ? 650 : 1200);
  }

  private specialPortrait(state: PortraitState): void {
    this.setPortrait(state);
    this.portraitUntil = performance.now() + 900;
  }

  private animateWeaponSwitch(detail: { state: 'lowering' | 'raising' | 'ready'; duration: number }): void {
    const weapon = $<HTMLElement>('#weapon-view');
    if (detail.state === 'lowering') this.cancelWeaponFrames();
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
    $('#hud').classList.toggle('full-automap', this.automapVisible && this.automapMode === 'full');
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
    const difficulty = $<HTMLSelectElement>('#level-select-difficulty');
    difficulty.value = this.pendingDifficulty;
    CAMPAIGN.episodes.forEach((episode, episodeIndex) => {
      if (!this.game.isEpisodeUnlocked(episodeIndex)) return;
      const section = document.createElement('section');
      section.className = 'level-episode';
      const heading = document.createElement('h2');
      heading.textContent = `Episode ${episode.number}: ${episode.title}`;
      const grid = document.createElement('div');
      grid.className = 'level-map-grid';
      episode.maps.forEach((id, mapIndex) => {
        const map = CAMPAIGN.maps[id];
        const secretKnown = progress.discoveredSecretMaps.includes(id) || progress.completedMaps.includes(id);
        if (map.secretMap && !secretKnown) return;
        const unlocked = map.secretMap ? secretKnown
          : mapIndex === 0 || progress.completedMaps.includes(id) || progress.completedMaps.includes(episode.maps[mapIndex - 1]);
        const record = progress.records[`${id}:${difficulty.value}`];
        const button = document.createElement('button');
        const label = document.createElement('strong');
        label.textContent = `${id} ${map.title}`;
        const detail = document.createElement('small');
        detail.textContent = record
          ? `Grade ${record.bestGrade}  PB ${formatTime(record.bestTime)}  ${record.highScore} pts`
          : `Par ${formatTime(map.parSeconds)}`;
        button.append(label, detail);
        button.disabled = !unlocked;
        button.title = unlocked ? `Start ${id}` : `${id} - locked`;
        button.addEventListener('click', () => {
          this.game.audio.unlock();
          this.pendingDifficulty = difficulty.value as GameDifficulty;
          this.game.startMapFromSelect(id, this.pendingDifficulty);
          this.prepareGameEntry();
        });
        grid.append(button);
      });
      section.append(heading, grid);
      container.append(section);
    });
    difficulty.onchange = () => this.showLevelSelect();
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
    if (detail.repeat) return;
    if (detail.action === 'pause') {
      this.game.input.keys.delete('Escape');
      const activeScreen = document.querySelector<HTMLElement>('.screen.active');
      if (this.game.mode === 'playing') this.game.pause();
      else if (this.game.mode === 'paused' && activeScreen?.id === 'pause-menu') {
        this.hideScreens();
        this.game.resume();
      }
      return;
    }
    if (this.game.mode !== 'playing') return;
    if (detail.action === 'automap') this.toggleAutomap('full');
    else if (detail.action === 'automap-overlay') this.toggleAutomap('overlay');
    else if (detail.action === 'weapon-radial') this.openWeaponRadial();
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

  private updateContinue(): void {
    const button = $<HTMLButtonElement>('#continue-game');
    const available = this.game.hasSave();
    button.disabled = false;
    button.dataset.available = String(available);
    button.setAttribute('aria-describedby', 'menu-feedback');
    button.title = available ? 'Continue the newest valid save' : 'No valid save is available';
  }
  private announce(message: string): void {
    const announcer = $('#announcer');
    announcer.textContent = '';
    requestAnimationFrame(() => { announcer.textContent = message; });
  }
  private hideScreens(): void { document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active')); }
  private showScreen(id: string): void {
    this.hideScreens();
    const screen = $<HTMLElement>(`#${id}`);
    screen.classList.add('active');
    requestAnimationFrame(() => {
      screen.querySelector<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled)')?.focus({ preventScroll: true });
      screen.scrollTop = 0;
    });
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
