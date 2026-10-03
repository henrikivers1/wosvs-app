import type { DemoTables, Row } from "@/lib/demo/store";

export const DEMO_USER_ID = "00000000-0000-4000-8000-00000000d3e0";
export const DEMO_STATE_ID = "00000000-0000-4000-8000-0000000057a7";
export const DEMO_STATE_NUMBER = 9999;
export const DEMO_OPPONENT_NUMBER = 9998;

const NAMES = [
  "Frostbite",
  "IceQueen",
  "Nordic",
  "Glacier",
  "Polaris",
  "Blizzard",
  "Snowfang",
  "Tundra",
  "Aurora",
  "Whiteout",
  "Permafrost",
  "Hailstorm",
  "Icebreaker",
  "Wolfpack",
  "Yeti",
  "Avalanche",
  "Coldsteel",
  "Rime",
  "Sleet",
  "Northwind",
  "Frostfire",
  "Snowdrift",
  "Icicle",
  "Boreal",
  "Crystal",
  "Winterfell",
  "Hoarfrost",
  "Floe",
  "Iceberg",
  "Snowhawk",
  "Freezer",
  "Chill",
  "Arctic",
  "Kelvin",
  "Fjord",
  "Sastrugi",
  "Nunatak",
  "Brrr",
  "Stormcrow",
];

const ENEMY_NAMES = [
  "Inferno",
  "Ember",
  "Blaze",
  "Magma",
  "Cinder",
  "Scorch",
  "Pyro",
  "Ash",
];

// Small deterministic random generator so every demo starts the same.
function random(seed: number) {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function id(prefix: string, index: number) {
  const hex = (prefix + index.toString(16)).padStart(12, "0").slice(-12);
  return `00000000-0000-4000-8000-${hex}`;
}

// Next SvS battle: two days from now at 12:00 UTC.
function nextBattleStart(now: Date) {
  const battle = new Date(now);
  battle.setUTCDate(battle.getUTCDate() + 2);
  battle.setUTCHours(12, 0, 0, 0);
  return battle;
}

export function buildDemoSeed(now: Date): DemoTables {
  const rand = random(42);
  const iso = now.toISOString();
  const battleAt = nextBattleStart(now).toISOString();
  const planId = id("9a", 1);
  const battleId = id("ba", 1);

  const alliances: Row[] = [
    {
      id: id("a1", 1),
      state_id: DEMO_STATE_ID,
      name: "Frost Wolves",
      color: "#4f8fba",
      max_members: 100,
      created_at: iso,
    },
    {
      id: id("a1", 2),
      state_id: DEMO_STATE_ID,
      name: "Polar Guard",
      color: "#e4a853",
      max_members: 100,
      created_at: iso,
    },
    {
      id: id("a1", 3),
      state_id: DEMO_STATE_ID,
      name: "Ice Legion",
      color: "#6bbf7a",
      max_members: 100,
      created_at: iso,
    },
  ];

  const accounts: Row[] = [];
  const profiles: Row[] = [];
  const members: Row[] = [];
  const allianceMembers: Row[] = [];
  const everyone = ["You (demo)", ...NAMES];
  everyone.forEach((name, index) => {
    const userId = index === 0 ? DEMO_USER_ID : id("u0", index);
    const accountId = id("ac", index);
    const furnaceRaw = 55 + Math.floor(rand() * 26);
    const alliance = alliances[index % alliances.length];
    accounts.push({
      id: accountId,
      user_id: userId,
      wos_id: String(300_000_000 + index * 7_919),
      nickname: name,
      is_configured: true,
      created_at: iso,
      furnace_level_raw: furnaceRaw,
      furnace_level: Math.min(10, Math.floor((furnaceRaw - 30) / 5)),
      power: Math.round((40 + rand() * 210) * 1_000_000),
      chief_level: 60 + Math.floor(rand() * 20),
      vip_level: 5 + Math.floor(rand() * 8),
      kills: Math.round(rand() * 5_000_000),
      labyrinth_score: Math.round(1_000 + rand() * 8_000),
      game_avatar_url: null,
      state_number: DEMO_STATE_NUMBER,
      alliance_external_id: index % alliances.length,
      alliance_abbr: ["FWV", "PGD", "ICL"][index % 3],
      alliance_name: alliance.name,
      game_active: true,
      player_data_source: "demo",
      player_data_updated_at: iso,
      player_data_synced_at: iso,
      infantry_tier: 10 + Math.floor(rand() * 3),
      lancer_tier: 10 + Math.floor(rand() * 3),
      marksman_tier: 10 + Math.floor(rand() * 3),
      infantry_fc_level: Math.floor(rand() * 6),
      lancer_fc_level: Math.floor(rand() * 6),
      marksman_fc_level: Math.floor(rand() * 6),
      infantry_t12_skill: null,
      lancer_t12_skill: null,
      marksman_t12_skill: null,
    });
    profiles.push({
      id: userId,
      username: index === 0 ? "demo_commander" : name.toLowerCase(),
      display_name: name,
      preferred_language: "en",
      created_at: iso,
    });
    members.push({
      state_id: DEMO_STATE_ID,
      wos_account_id: accountId,
      role: index === 0 ? "owner" : index < 3 ? "admin" : "member",
      joined_at: iso,
    });
    allianceMembers.push({
      state_id: DEMO_STATE_ID,
      wos_account_id: accountId,
      alliance_id: alliance.id,
      assigned_at: iso,
    });
  });

  // Most players already told us their 4★ joiner heroes; a few have not.
  const JOINERS = [
    "Jessie",
    "Jasser",
    "Seo-yoon",
    "Sergey",
    "Patrick",
    "Ling Xue",
    "Gina",
    "Bahiti",
  ];
  const playerHeroes: Row[] = [];
  accounts.forEach((account, index) => {
    if (index > 0 && rand() < 0.15) return;
    account.heroes_updated_at = iso;
    const owned =
      index === 0 ? ["Jessie", "Sergey"] : JOINERS.filter(() => rand() < 0.4);
    owned.forEach((hero) =>
      playerHeroes.push({ wos_account_id: account.id, hero, updated_at: iso }),
    );
  });
  const heroesOf = (accountId: unknown) =>
    playerHeroes
      .filter((row) => row.wos_account_id === accountId)
      .map((row) => row.hero as string);

  const byLabyrinth = [...accounts].sort(
    (first, second) =>
      (second.labyrinth_score as number) - (first.labyrinth_score as number),
  );
  const leaders = byLabyrinth.slice(0, 4);

  const rallyLeadTag = {
    id: id("7a", 1),
    state_id: DEMO_STATE_ID,
    name: "Rally Lead",
    color: "#e4a853",
    system_key: "rally_lead",
    kind: "custom",
    hero_generation: null,
    bulk_move_limit: 100,
    created_at: iso,
  };
  const heroTags = ["Jessie", "Jasser", "Sergey"].map((hero, index) => ({
    id: id("7b", index),
    state_id: DEMO_STATE_ID,
    name: hero,
    color: "#9b6bd6",
    system_key: null,
    kind: "hero",
    hero_generation: 1,
    bulk_move_limit: 100,
    created_at: iso,
  }));
  const rallyTags = leaders.slice(0, 2).map((leader, index) => ({
    id: id("7c", index),
    state_id: DEMO_STATE_ID,
    name: `${leader.nickname} rally`,
    color: "#4f8fba",
    system_key: null,
    kind: "rally",
    hero_generation: null,
    bulk_move_limit: 100,
    created_at: iso,
  }));

  const memberTags: Row[] = [
    ...leaders.map((leader) => ({
      tag_id: rallyLeadTag.id,
      wos_account_id: leader.id,
      source: "manual",
      assigned_at: iso,
    })),
    ...accounts.slice(5, 20).map((account, index) => ({
      tag_id: heroTags[index % heroTags.length].id,
      wos_account_id: account.id,
      source: "manual",
      assigned_at: iso,
    })),
  ];

  const groups: Row[] = leaders.slice(0, 2).map((leader, index) => ({
    id: id("6a", index),
    plan_id: planId,
    state_id: DEMO_STATE_ID,
    name: `${leader.nickname}'s rally`,
    leader_wos_account_id: leader.id,
    alliance_id: alliances[index].id,
    assignment_tag_id: rallyTags[index].id,
    max_members: 10,
    notes: null,
    sort_order: index,
    created_at: iso,
    formation: "50/20/30",
    joiner_heroes: ["Jessie", "Jasser", "Seo-yoon", "Sergey"],
    shift: "whole",
  }));
  const alreadyAssigned = new Set<unknown>();
  const assignments: Row[] = groups.flatMap((group, groupIndex) => {
    const groupMembers = [
      accounts.find((account) => account.id === group.leader_wos_account_id)!,
      // The demo user sits in the first rally so publishing shows their message.
      ...(groupIndex === 0 ? [accounts[0]] : []),
      ...accounts.slice(6 + groupIndex * 5, 10 + groupIndex * 5),
    ];
    const unique = groupMembers.filter((account) => {
      if (alreadyAssigned.has(account.id)) return false;
      alreadyAssigned.add(account.id);
      return true;
    });
    return unique.map((account) => ({
      plan_id: planId,
      group_id: group.id,
      state_id: DEMO_STATE_ID,
      wos_account_id: account.id,
      assigned_at: iso,
      hero:
        (group.joiner_heroes as string[]).find((hero) =>
          heroesOf(account.id).includes(hero),
        ) ?? null,
      formation: null,
    }));
  });

  const choices = [
    "whole",
    "whole",
    "first_half",
    "second_half",
    "unavailable",
  ];
  const attendance: Row[] = [
    {
      plan_id: planId,
      state_id: DEMO_STATE_ID,
      wos_account_id: accounts[0].id,
      availability: "whole",
      voice_call: true,
      updated_at: iso,
    },
    ...accounts.slice(1).flatMap((account) =>
      rand() < 0.7
        ? [
            {
              plan_id: planId,
              state_id: DEMO_STATE_ID,
              wos_account_id: account.id,
              availability: choices[Math.floor(rand() * choices.length)],
              voice_call: rand() < 0.5,
              updated_at: iso,
            },
          ]
        : [],
    ),
  ];

  const enemyAlliances = ["INF", "EMB", "BLZ", "ASH", "MAG"].map(
    (abbr, index) => ({
      id: 900 + index,
      abbr,
      name: ["Infernal", "Embers", "Blazing Sun", "Ashfall", "Magma Core"][
        index
      ],
      power: Math.round((9 - index * 1.4) * 1_000_000_000),
      memberCount: 100 - index * 6,
    }),
  );
  const ownAlliances = alliances.map((alliance, index) => ({
    id: 800 + index,
    abbr: ["FWV", "PGD", "ICL"][index],
    name: alliance.name as string,
    power: Math.round((8 - index * 1.6) * 1_000_000_000),
    memberCount: 95 - index * 8,
  }));

  return {
    profiles,
    wos_accounts: accounts,
    player_heroes: playerHeroes,
    states: [
      {
        id: DEMO_STATE_ID,
        name: `Demo State #${DEMO_STATE_NUMBER}`,
        created_at: iso,
        game_state_number: DEMO_STATE_NUMBER,
        hero_generation_max: 10,
        svs_season: 21,
        svs_opponent: DEMO_OPPONENT_NUMBER,
        svs_battle_at: battleAt,
        svs_draw_expected_at: null,
        svs_next_battle_at: battleAt,
        oracle_checked_at: iso,
      },
    ],
    state_members: members,
    state_member_capabilities: [
      {
        state_id: DEMO_STATE_ID,
        wos_account_id: accounts[0].id,
        capability: "rally_caller",
      },
      {
        state_id: DEMO_STATE_ID,
        wos_account_id: accounts[0].id,
        capability: "garrison",
      },
    ],
    state_tags: [rallyLeadTag, ...heroTags, ...rallyTags],
    state_member_tags: memberTags,
    state_alliances: alliances,
    state_alliance_members: allianceMembers,
    battle_plans: [
      {
        id: planId,
        state_id: DEMO_STATE_ID,
        name: `SvS vs ${DEMO_OPPONENT_NUMBER}`,
        battle_type: "svs",
        scheduled_at: battleAt,
        notes: "Demo plan: try assigning players, then publish.",
        status: "draft",
        created_by: null,
        published_at: null,
        created_at: iso,
        updated_at: iso,
        opponent_state_number: DEMO_OPPONENT_NUMBER,
        auto_created: true,
      },
    ],
    battles: [
      {
        id: battleId,
        state_id: DEMO_STATE_ID,
        name: `SvS vs ${DEMO_OPPONENT_NUMBER}`,
        status: "scheduled",
        created_at: iso,
        ended_at: null,
        battle_type: "svs",
        scheduled_at: battleAt,
        plan_id: planId,
        result: null,
        started_at: null,
      },
    ],
    battle_plan_groups: groups,
    battle_plan_assignments: assignments,
    battle_attendance: attendance,
    battle_intel: [
      {
        plan_id: planId,
        state_id: DEMO_STATE_ID,
        opponent_state: DEMO_OPPONENT_NUMBER,
        fetched_at: iso,
        opponent: {
          stateNumber: DEMO_OPPONENT_NUMBER,
          trackedPlayers: 1180,
          // Their 20 strongest players, the likely rally leaders.
          topPlayers: Array.from({ length: 20 }, (_, index) => ({
            wosId: String(400_000_000 + index),
            name: `${ENEMY_NAMES[index % ENEMY_NAMES.length]}${index < ENEMY_NAMES.length ? "" : index + 1}`,
            power: 320_000_000 - index * 9_000_000,
            furnaceLevel: 80 - Math.floor(index / 4),
            allianceAbbr: enemyAlliances[index % 5].abbr,
          })),
          alliances: enemyAlliances,
          stats: [
            {
              key: "power",
              label: "Total power",
              value: 41_000_000_000,
              rank: 212,
              outOf: 1500,
            },
          ],
        },
        opponent_svs: {
          record: {
            battle_wins: 9,
            battle_losses: 6,
            prep_wins: 10,
            prep_losses: 5,
            castles_taken: 5,
            castles_lost: 3,
          },
          recent: [
            {
              battleAt: new Date(now.getTime() - 28 * 86_400_000).toISOString(),
              opponent: 9001,
              outcome: "conquered",
              prepWon: true,
              battleWon: true,
            },
            {
              battleAt: new Date(now.getTime() - 56 * 86_400_000).toISOString(),
              opponent: 9042,
              outcome: "repelled",
              prepWon: true,
              battleWon: false,
            },
          ],
        },
        own: {
          stateNumber: DEMO_STATE_NUMBER,
          trackedPlayers: 1120,
          topPlayers: byLabyrinth.slice(0, 5).map((account) => ({
            wosId: account.wos_id,
            name: account.nickname,
            power: account.power,
            furnaceLevel: account.furnace_level_raw,
            allianceAbbr: account.alliance_abbr,
          })),
          alliances: ownAlliances,
          stats: [],
        },
      },
    ],
    enemy_leaders: [],
    rallies: [],
    battle_plan_comments: [],
    state_announcements: [],
    state_announcement_recipients: [],
    state_invites: [],
    notifications: [
      {
        id: 1,
        user_id: DEMO_USER_ID,
        type: "svs_drawn",
        title: "SvS opponent drawn",
        body: `Your state faces state ${DEMO_OPPONENT_NUMBER}. Open Overwatch to vote when you can play.`,
        data: { plan_id: planId },
        read_at: null,
        created_at: iso,
        state_id: DEMO_STATE_ID,
        wos_account_id: accounts[0].id,
        category: "battle",
      },
    ],
  };
}

// Fake roster for an enemy alliance in the demo picker.
export function demoEnemyRoster(allianceId: number) {
  const rand = random(allianceId);
  return Array.from({ length: 20 }, (_, index) => ({
    wosId: String(410_000_000 + allianceId * 100 + index),
    name: `${ENEMY_NAMES[index % ENEMY_NAMES.length]}${index + 1}`,
    power: Math.round((60 + rand() * 260) * 1_000_000),
    furnaceLevel: 60 + Math.floor(rand() * 20),
    rank: index === 0 ? 5 : 1 + Math.floor(rand() * 4),
  })).sort((first, second) => second.power - first.power);
}
