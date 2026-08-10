import type { Rules } from "./optimizer";

/**
 * Line-up rules, one entry per competition you actually play.
 *
 * These are STARTING POINTS, not gospel — Sorare re-tunes eligibility, caps
 * and captain bonuses between seasons. Check the rules panel on the
 * competition page in the app and edit here.
 *
 * positionsMin / positionsMax use the API's own names: Goalkeeper, Defender,
 * Midfielder, Forward. With size 5 and mins of 1/1/1/1, the fifth card is a
 * free "extra" slot.
 */
export const COMPETITIONS: Record<string, Rules> = {
  "cap-limited": {
    name: "cap-limited",
    size: 5,
    rarities: ["limited"],
    positionsMin: { Goalkeeper: 1, Defender: 1, Midfielder: 1, Forward: 1 },
    positionsMax: { Goalkeeper: 2, Defender: 3, Midfielder: 3, Forward: 3 },
    maxPerClub: 2,
    minInSeason: 0,
    l15Cap: 240,
    captainMultiplier: 1.2,
    allowCaptain: true,
    minPStart: 0.15,
  },
  "champion-limited": {
    name: "champion-limited",
    size: 5,
    rarities: ["limited"],
    positionsMin: { Goalkeeper: 1, Defender: 1, Midfielder: 1, Forward: 1 },
    positionsMax: { Goalkeeper: 2, Defender: 3, Midfielder: 3, Forward: 3 },
    maxPerClub: 2,
    minInSeason: 1,
    l15Cap: null,
    captainMultiplier: 1.2,
    allowCaptain: true,
    minPStart: 0.25,
  },
  "champion-rare": {
    name: "champion-rare",
    size: 5,
    rarities: ["rare"],
    positionsMin: { Goalkeeper: 1, Defender: 1, Midfielder: 1, Forward: 1 },
    positionsMax: { Goalkeeper: 2, Defender: 3, Midfielder: 3, Forward: 3 },
    maxPerClub: 2,
    minInSeason: 1,
    l15Cap: null,
    captainMultiplier: 1.2,
    allowCaptain: true,
    minPStart: 0.25,
  },
  "common-arena": {
    name: "common-arena",
    size: 5,
    rarities: ["common"],
    positionsMin: { Goalkeeper: 1, Defender: 1, Midfielder: 1, Forward: 1 },
    positionsMax: { Goalkeeper: 2, Defender: 3, Midfielder: 3, Forward: 3 },
    maxPerClub: 3,
    minInSeason: 0,
    l15Cap: null,
    captainMultiplier: 1.2,
    allowCaptain: true,
    minPStart: 0.1,
  },
};
