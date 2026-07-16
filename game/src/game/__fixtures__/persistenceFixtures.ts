/** Representative schema documents with checksums frozen independently of the test implementation. */
export const CURRENT_SAVE_V1_FIXTURE = {
  schema: 'red-ledger-save',
  version: 1,
  gameVersion: 'test-build',
  metadata: {
    slotId: 'manual-1',
    kind: 'manual',
    name: 'Published fixture',
    savedAt: 1_710_000_000_000,
    sequence: 7,
    episodeId: 'first-notice',
    mapId: 'E1M3',
    mapTitle: 'E1M3 Records Annex',
    difficulty: 'field-adjuster',
    playSeconds: 142,
    thumbnail: { kind: 'placeholder', label: 'E1M3', palette: ['#d71920', '#f2f0e6'] },
  },
  state: { map: 'E1M3', health: 73, inventory: ['claim-stamp'] },
  checksum: '633edcc5',
} as const;

/** Original public progression shape, before secret discovery and mastery records were added. */
export const LEGACY_CAMPAIGN_V1_FIXTURE = {
  schema: 'red-ledger-campaign',
  version: 1,
  progress: {
    unlockedEpisodes: ['first-notice'],
    completedEpisodes: [],
    completedMaps: ['E1M1'],
    updatedAt: 1_710_000_000_100,
  },
  checksum: '6a6ec4db',
} as const;

export const CURRENT_CAMPAIGN_V2_FIXTURE = {
  schema: 'red-ledger-campaign',
  version: 2,
  progress: {
    unlockedEpisodes: ['first-notice', 'exclusions-apply'],
    completedEpisodes: ['first-notice'],
    completedMaps: ['E1M1', 'E1M8'],
    discoveredSecretMaps: ['E1M9'],
    records: {
      'E1M1:field-adjuster': {
        mapId: 'E1M1',
        difficulty: 'field-adjuster',
        completions: 1,
        bestTime: 120,
        highScore: 5_000,
        bestChain: 4,
        bestKillsPercent: 100,
        bestItemsPercent: 90,
        bestSecretsPercent: 100,
        bestGrade: 'A',
        parBeaten: true,
        achievedAt: 1_710_000_000_200,
      },
    },
    updatedAt: 1_710_000_000_200,
  },
  checksum: '59b62541',
} as const;
