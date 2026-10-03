import type { NavIconName } from "@/components/NavIcon";

// The content of /guides. Every string is an English translation key; keep
// them short and plain so they translate well.

export type GuideTopic = {
  title: string;
  body?: string;
  steps?: string[];
  tip?: string;
};

export type GuideSection = {
  id: string;
  icon: NavIconName;
  title: string;
  intro: string;
  audience: string;
  topics: GuideTopic[];
};

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: "getting-started",
    icon: "overwatch",
    title: "Getting started",
    audience: "Everyone",
    intro:
      "Create an account, add your WOS ID and join your state. It takes about two minutes.",
    topics: [
      {
        title: "Create your account",
        steps: [
          "Open Sign in and choose Sign up.",
          "Enter your email, a password, a public username and your WOS ID.",
          "Confirm your email if you are asked to.",
        ],
        tip: "Want to look around first? The free demo needs no account.",
      },
      {
        title: "Add your WOS accounts",
        body: "On Account, add every WOS ID you play. Your name, avatar, state, power, Furnace, Labyrinth score and alliance are filled in from WOSOracle. They refresh every Monday, and you can refresh by hand once a day.",
      },
      {
        title: "Join your state",
        body: "When your in-game state uses Overwatch, adding your WOS ID sends a join request to its owner and admins automatically. You get a notification as soon as they approve it. An admin can also invite your WOS ID; accept the invitation under the bell. Is your state not on Overwatch yet? Your owner can message us on Discord: wosoverwatch.",
      },
      {
        title: "Tell us your joiner heroes",
        body: "On Account, tick every joiner hero you have at 4★ or higher. Rallies only give you a hero you own, so this decides which rally you can join.",
      },
      {
        title: "Language and notifications",
        body: "Change the language with the globe in the header. The bell shows your notifications, coloured by kind: green Victory, red Defeat, blue rally assignments, purple roles, gold alliances.",
      },
    ],
  },
  {
    id: "before-svs",
    icon: "planning",
    title: "Before the SvS",
    audience: "Members",
    intro:
      "After the draw you only need to do one thing: say when you can play.",
    topics: [
      {
        title: "Vote your attendance",
        steps: [
          "Open Overwatch.",
          "Pick Whole battle, First half (12:00–14:30 UTC), Second half (14:30–17:00 UTC) or Can't join.",
          "Tick voice call if you can join it.",
        ],
        tip: "You can change your answer until the battle starts. If you have not voted 30 hours before, you get a reminder.",
      },
      {
        title: "Get your rally",
        body: "Six hours before the battle the plan is published and you get a message like “Hi Frost, you've been assigned to Ted's rally in Frost Wolves. You're joining with Jessie and 50/20/30 formation. Leads: Ted 12:00–14:00, Ice 14:00–16:00.” Rally Leads are told which blocks they lead, Castle Holders when to take over, and the garrison to stay in the castle. Overwatch shows the same details, and you are told about every change.",
      },
      {
        title: "Check the opponent",
        body: "Intel shows the opponent's strongest players, their alliances and their SvS record next to your own state's numbers.",
      },
    ],
  },
  {
    id: "battle",
    icon: "live",
    title: "During the battle",
    audience: "Garrison and coordinators",
    intro:
      "Live Battle opens by itself at 11:00 UTC, an hour before the battle. Every member has the Garrison role, and coordinators also call rallies. Use that hour to enter coordinates.",
    topics: [
      {
        title: "Garrison: when to send",
        steps: [
          "Open Live Battle, then Garrison.",
          "Enter your city's X and Y once; your march time is worked out for you.",
          "Turn on sound and notifications.",
          "Send when the countdown reaches zero.",
        ],
        body: "The timer aims your reinforcements between two enemy rallies, or right after the last one hits.",
        tip: "If the game lags on your connection, add your ping in milliseconds under Send early.",
      },
      {
        title: "The shared battle clock",
        body: "Every device times against the same server clock, so a phone that is a few seconds off still sends on time. If it says the clock is not synchronized, press Resync clock.",
      },
      {
        title: "Coordinators: enemy leaders",
        body: "Under Enemy leaders the opponent's 20 strongest players are already listed. Tap Use, enter the city coordinates and add them. Coordinates are remembered: next time that player is prefilled, and known leaders are added automatically when Live Battle opens. Mark a leader's pet when it is active.",
      },
      {
        title: "Coordinators: call a rally",
        steps: [
          "Open Call rally and pick the enemy leader.",
          "Type the rally timer you see in the game, for example 4:59.",
          "Press Call rally the moment the in-game timer shows that value.",
        ],
        tip: "Every second of delay shifts the whole schedule. Cancel a rally only if it was called by mistake; it disappears for everyone.",
      },
      {
        title: "After the battle",
        body: "The battle ends at 17:00 UTC. As soon as WOSOracle has the result, every member gets Victory or Defeat. Past battles are under State, Stats & history.",
      },
    ],
  },
  {
    id: "admins",
    icon: "state",
    title: "Running your state",
    audience: "Owners and admins",
    intro:
      "Overwatch does the routine work for every SvS. These are the places to look and the settings that shape it.",
    topics: [
      {
        title: "First setup",
        steps: [
          "The in-game state number fills in from the owner's WOS account.",
          "Under State management, set your hero generation so only unlocked heroes are offered.",
          "Add your alliances: load them from WOSOracle, add a shell alliance by its ID, or type a name.",
          "Mark Rally Leads and Castle Holders under Leads & holders in Planning, and give the Coordinator role to the players who call rallies. Every member has Garrison already.",
        ],
      },
      {
        title: "SvS automation settings",
        body: "In State management, SvS automation decides how many rallies are built, how many players each takes, the garrison size, the default formation, the four default joiner heroes and the order auto-fill weighs players in. Turn automatic rallies or automatic publishing off if you prefer to do them yourself.",
      },
      {
        title: "The Next SvS checklist",
        body: "Planning opens with a checklist: the draw, votes, rallies, publishing and Live Battle, each with when it happens automatically. The gold button runs the next step now: Generate now, then Publish now.",
      },
      {
        title: "Needs attention",
        body: "Under the checklist, Needs attention lists what to check before publishing: a pet block without a lead or castle holder, no garrison, a rally without an alliance or heroes, a player in the wrong half, players without a joiner hero, or open seats while players wait. Each line has a button that fixes it. When the list is empty, publish.",
      },
      {
        title: "How rallies are built",
        body: "The battle runs in three pet blocks: 12–14, 14–16 and 16–17 UTC. Each rally gets one Rally Lead per block, so leads swap when their pets run out, while the joiners stay. Rallies go into their first lead's alliance. Players are added by your auto-fill priorities and only get a joiner hero they own at 4★.",
      },
      {
        title: "The garrison",
        body: "One garrison holds the castle the whole battle. It is filled first, with the strongest defenders who play the whole battle: highest troop FC, then troop tier, then troop skill. Up to three Castle Holders take turns, one per pet block. When it's their turn they swap to the alliance holding the castle and take over; they bring no joiners. Set the garrison size under SvS automation.",
      },
      {
        title: "Adjust by hand",
        body: "Drag players between rallies or from the Waiting list. Tap a player to change their rally or the hero they bring. A rally's ⋯ menu has Rally setup (formation, half and joiner heroes), Assign heroes, Edit and Delete. Nothing you change is undone by the automation.",
      },
      {
        title: "Leads & holders",
        body: "Press Leads & holders in Planning to mark Rally Leads (ranked by Labyrinth) and Castle Holders (ranked by defense). They only lead or hold and are never placed as joiners. Change who leads a block under a rally's ⋯ → Leads by pet block, or the garrison's ⋯ → Castle holders by pet block.",
      },
      {
        title: "Members and join requests",
        body: "Approve join requests under Waiting for your verification. The owner sets who is an admin; admins give the Coordinator role, can take Garrison away (every member has it by default) and remove members. Every change is sent to the member as a notification.",
      },
      {
        title: "A WOS ID claimed by the wrong person",
        body: "Under Release a claimed WOS ID, enter the ID. It is removed from the login that claimed it so the real player can add it.",
      },
      {
        title: "Notices and tags",
        body: "Send notices to the whole state, one alliance or everyone with a tag. Tags are for your own groupings; rally and hero tags are created automatically when you publish.",
      },
    ],
  },
];

export const GUIDE_FAQ: { q: string; a: string }[] = [
  {
    q: "Where do I get help?",
    a: "Message us on Discord: wosoverwatch. Your state's admins can also help with anything inside your state.",
  },
  {
    q: "My WOS ID is already registered.",
    a: "Someone else claimed it. Ask an admin of your state to release it, then add it again.",
  },
  {
    q: "My power or Furnace is out of date.",
    a: "Press Refresh player data on Account (once a day). Everyone is also refreshed every Monday.",
  },
  {
    q: "I can't see Live Battle.",
    a: "It only appears from 11:00 to 17:00 UTC on battle day. Every member has the Garrison role by default; if you still can't see it, ask an admin whether yours was removed.",
  },
  {
    q: "The times look wrong.",
    a: "Every time in Overwatch is UTC, like the game's SvS. In Live Battle, press Resync clock.",
  },
  {
    q: "I don't get send alerts on my phone.",
    a: "Allow notifications for this site in your browser, keep the Garrison page open and the screen on during the battle.",
  },
  {
    q: "Is the demo safe to try?",
    a: "Yes. It runs only in your browser with fake players. Nothing is saved to any state, and Reset demo starts it over.",
  },
];
