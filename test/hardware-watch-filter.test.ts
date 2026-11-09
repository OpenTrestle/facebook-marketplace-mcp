import test from "node:test";
import assert from "node:assert/strict";
import { candidateScore, classifyDistance, qualifiesAsLocalCandidate } from "../scripts/hardware-watch-filter.js";

const listing = (overrides: Record<string, unknown> = {}) => ({
  id: "test",
  title: "M2 Max Mac Studio 96GB 1TB",
  price: "$1,600",
  location: "Baltimore, MD",
  url: "https://www.facebook.com/marketplace/item/test/",
  is_pending: false,
  ...overrides,
});

test("excludes a clearly distant California listing from local candidates", () => {
  const result = classifyDistance(listing({ location: "Los Angeles, CA" }));
  assert.equal(result.status, "out_of_radius");
  assert.equal(qualifiesAsLocalCandidate(listing({ location: "Los Angeles, CA" }), "mac"), false);
});

test("accepts an in-radius listing with a documented Mac target", () => {
  const result = classifyDistance(listing());
  assert.equal(result.status, "in_radius");
  assert.ok(result.distanceKm !== null && result.distanceKm < 80);
  assert.equal(qualifiesAsLocalCandidate(listing(), "mac"), true);
});

test("normalizes the full state names used by saved Marketplace reports", () => {
  const inRadius = listing({
    id: "report-shaped-md",
    location: "Baltimore, Maryland",
    image_url: "https://image.example/report-shaped",
    seller_name: "Example seller",
  });
  const outOfRadius = listing({
    id: "report-shaped-ca",
    location: "Citrus Heights, California",
    image_url: "https://image.example/report-shaped-ca",
    seller_name: "Example seller",
  });
  assert.equal(classifyDistance(inRadius).status, "in_radius");
  assert.equal(classifyDistance(outOfRadius).status, "out_of_radius");
});

test("prefers returned coordinates over ambiguous location text", () => {
  const listingWithCoordinates = listing({
    location: "Baltimore, MD",
    latitude: 34.0522,
    longitude: -118.2437,
  });
  const result = classifyDistance(listingWithCoordinates);
  assert.equal(result.method, "coordinates");
  assert.equal(result.status, "out_of_radius");
  assert.equal(qualifiesAsLocalCandidate(listingWithCoordinates, "mac"), false);
});

test("keeps missing or unknown location unverified and out of the alert set", () => {
  const unknown = listing({ location: "Somewhere, ZZ" });
  assert.equal(classifyDistance(unknown).status, "unverified");
  assert.equal(qualifiesAsLocalCandidate(unknown, "mac"), false);
});

test("does not qualify a Florida result even when its hardware and price look attractive", () => {
  const florida = listing({ location: "Miami, FL", title: "M2 Max Mac Studio 96GB 1TB", price: "$1,500" });
  assert.ok(candidateScore(florida, "mac") >= 10);
  assert.equal(classifyDistance(florida).status, "out_of_radius");
  assert.equal(qualifiesAsLocalCandidate(florida, "mac"), false);
});

test("does not throw away a good Mac mini or Mac Studio for being too inexpensive", () => {
  const mini = listing({ title: "Apple Mac mini M2 Pro 32GB RAM 512GB SSD", price: "$450" });
  const studio = listing({ title: "Mac Studio M1 Max 32GB 512GB", price: "$750" });
  assert.ok(candidateScore(mini, "mac") >= 0);
  assert.ok(candidateScore(studio, "mac") >= 0);
  assert.equal(qualifiesAsLocalCandidate(mini, "mac"), true);
  assert.equal(qualifiesAsLocalCandidate(studio, "mac"), true);
});

test("retains unverified Mac bargains for review without falsely confirming locality", () => {
  const unknownCity = listing({ title: "Mac mini M4 Pro 24GB", price: "$699", location: "Hershey, Pennsylvania" });
  assert.ok(candidateScore(unknownCity, "mac") >= 0);
  assert.equal(classifyDistance(unknownCity).status, "unverified");
  assert.equal(qualifiesAsLocalCandidate(unknownCity, "mac"), false);
});

test("does not mistake Mac accessories for complete Macs", () => {
  const accessory = listing({ title: "Satechi Stand Hub for Mac mini or Mac Studio", price: "$25" });
  assert.equal(candidateScore(accessory, "mac"), -10);
});

test("uses the active radius and center, not the default location constants", () => {
  const baltimore = listing({ location: "Baltimore, Maryland" });
  assert.equal(classifyDistance(baltimore).status, "in_radius");
  assert.equal(classifyDistance(baltimore, { latitude: 39.56, longitude: -76.25 }, 10).status, "out_of_radius");
  assert.equal(qualifiesAsLocalCandidate(baltimore, "mac", { latitude: 39.56, longitude: -76.25 }, 10), false);
  assert.equal(classifyDistance(baltimore, { latitude: 39.2904, longitude: -76.6122 }, 10).status, "in_radius");
});
