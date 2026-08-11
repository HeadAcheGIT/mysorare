import { describe, it, expect } from "vitest";
import { parseScores } from "./squadView";

describe("parseScores", () => {
  it("returns [] for null", () => {
    expect(parseScores(null)).toEqual([]);
  });

  it("parses a JSON array of numbers", () => {
    expect(parseScores("[65.5, 42, 0]")).toEqual([65.5, 42, 0]);
  });

  it("filters out non-number entries from a malformed array", () => {
    expect(parseScores('[65.5, "oops", null, 42]')).toEqual([65.5, 42]);
  });

  it("returns [] for a JSON value that isn't an array", () => {
    expect(parseScores('{"not": "an array"}')).toEqual([]);
    expect(parseScores("42")).toEqual([]);
  });

  it("returns [] for unparsable JSON rather than throwing", () => {
    expect(parseScores("not json")).toEqual([]);
  });

  it("returns [] for an empty array", () => {
    expect(parseScores("[]")).toEqual([]);
  });
});
