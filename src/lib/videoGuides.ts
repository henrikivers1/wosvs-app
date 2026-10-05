// The video guides on YouTube, shown on /guides and linked from the landing page.

export type VideoGuide = {
  youtubeId: string;
  title: string;
  description: string;
  length: string;
};

export const VIDEO_GUIDES: VideoGuide[] = [
  {
    youtubeId: "Pu8hXVNJ1Ms",
    title: "Getting started & state management",
    description: "Getting your state, join links, alliances, SvS automation, members and roles.",
    length: "3:31",
  },
  {
    youtubeId: "qoBxfETNbWA",
    title: "Battle planning",
    description: "The Next SvS checklist, Rally Leads, the garrison and rallies, and publishing.",
    length: "2:30",
  },
  {
    youtubeId: "4RPfSfiCoDg",
    title: "Opponent intel & stats",
    description: "Their alliances, likely rally leads and SvS record, and your battle history.",
    length: "1:29",
  },
  {
    youtubeId: "F3SjElZ6uEo",
    title: "Live battle",
    description: "What coordinators and the garrison see, and how the send timing works.",
    length: "2:08",
  },
];

export const YOUTUBE_CHANNEL = "https://www.youtube.com/@wosoverwatch";

export const youtubeUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
