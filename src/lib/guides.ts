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
        body: "When your in-game state uses Overwatch, adding your WOS ID sends a join request to its owner and admins automatically. You get a notification as soon as they approve it. An admin can also invite your WOS ID; accept the invitation under the bell.",
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
        body: "Six hours before the battle the plan is published and you get a message like “Hi Frost, you've been assigned to Ted's rally in Frost Wolves. You're joining with Jessie and 50/20/30 formation.” Overwatch shows the same details, and you are told about every change.",
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
      "Live Battle opens by itself at 12:00 UTC for everyone with the Garrison or Coordinator role.",
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
        body: "Under Enemy leaders the opponent's 20 strongest players are already listed. Tap Use, enter the city coordinates and add them. Coordinates are remembered: next time that player is prefilled, and known leaders are added automatically when the battle starts. Mark a leader's pet when it is active.",
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
          "Give Coordinator and Garrison roles to the right members.",
        ],
      },
      {
        title: "SvS automation settings",
        body: "In State management, SvS automation decides how many rallies are built, how many players each takes, the default formation and the four default joiner heroes. Turn automatic rallies or automatic publishing off if you prefer to do them yourself.",
      },
      {
        title: "The Next SvS checklist",
        body: "Planning opens with a checklist: the draw, votes, rallies, publishing and the battle, each with when it happens automatically. The gold button runs the next step now: Generate now, Fill open slots now or Publish now.",
      },
      {
        title: "How rallies are built",
        body: "Rally Leads who can play come first, topped up with the best Labyrinth players who voted. Each rally goes into its leader's own alliance and fights in the half the leader voted for. Players are then added by your auto-fill priorities, and only get a joiner hero they own at 4★.",
      },
      {
        title: "Adjust by hand",
        body: "Drag players between rallies, or tick several and move them at once. Rally setup changes a rally's formation, half and joiner heroes; Assign heroes shares the heroes out again. Nothing you change is undone by the automation.",
      },
      {
        title: "Rally Leads",
        body: "Open Top 20 Labyrinth in Planning to mark or unmark Rally Leads. Only Rally Leads can lead a rally.",
      },
      {
        title: "Members and join requests",
        body: "Approve join requests under Waiting for your verification. The owner sets who is an admin; admins can give the Coordinator or Garrison role and remove members. Every change is sent to the member as a notification.",
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
    q: "My WOS ID is already registered.",
    a: "Someone else claimed it. Ask an admin of your state to release it, then add it again.",
  },
  {
    q: "My power or Furnace is out of date.",
    a: "Press Refresh player data on Account (once a day). Everyone is also refreshed every Monday.",
  },
  {
    q: "I can't see Live Battle.",
    a: "It only appears from 12:00 to 17:00 UTC on battle day, and only for admins and members with the Coordinator or Garrison role.",
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
