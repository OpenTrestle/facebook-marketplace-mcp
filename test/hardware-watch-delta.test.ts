import test from "node:test";
import assert from "node:assert/strict";
import { detectPriceDrops, parseAskingPrice } from "../scripts/hardware-watch-delta.js";

const mac = (price: string, id = "mac-1") => ({
  id, title: "Mac mini M2 Pro 32GB", price, url: "https://www.facebook.com/marketplace/item/1234/",
  kind: "mac", location: "Baltimore, Maryland", distanceStatus: "in_radius",
});

test("distinguishes an unavailable previous snapshot from no price decreases", () => {
  assert.equal(detectPriceDrops(null, [mac("$700")]), null);
  assert.deepEqual(detectPriceDrops([], [mac("$700")]), []);
});

test("detects a price decrease on a previously seen ID", () => {
  assert.deepEqual(detectPriceDrops([mac("$900")], [mac("$700")]), [{
    id: "mac-1", title: "Mac mini M2 Pro 32GB", oldPrice: "$900",
    newPrice: "$700", oldPriceValue: 900, newPriceValue: 700,
    decrease: 200, percentDecrease: 22.2,
    url: "https://www.facebook.com/marketplace/item/1234/",
    kind: "mac", location: "Baltimore, Maryland", distanceStatus: "in_radius",
  }]);
});

test("does not treat a returning listing, changed title, or placeholder price as a price drop", () => {
  assert.deepEqual(detectPriceDrops([mac("$900")], [mac("$900"), mac("$450", "different")]), []);
  assert.deepEqual(detectPriceDrops([mac("$900")], [mac("$1")]), []);
  assert.deepEqual(detectPriceDrops([mac("$1")], [mac("$500")]), []);
  assert.deepEqual(detectPriceDrops([mac("$900")], [mac("$950")]), []);
  assert.equal(parseAskingPrice("$1,050.50"), 1050.5);
  assert.equal(parseAskingPrice("Contact seller"), null);
  assert.equal(parseAskingPrice("$850 OBO"), null);
});
