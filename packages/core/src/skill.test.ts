import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isHiddenSkillKey } from "./skill.js";

describe("isHiddenSkillKey", () => {
  it("returns true for hidden skill keys", () => {
    assert.equal(isHiddenSkillKey("md:.DS_Store"), true);
    assert.equal(isHiddenSkillKey("md:.gitignore"), true);
    assert.equal(isHiddenSkillKey("md:.env"), true);
  });

  it("returns false for normal skill keys", () => {
    assert.equal(isHiddenSkillKey("md:my-skill"), false);
    assert.equal(isHiddenSkillKey("md:another-skill"), false);
  });

  it("handles keys with multiple colons", () => {
    assert.equal(isHiddenSkillKey("md:some:skill"), false);
    assert.equal(isHiddenSkillKey("md:.hidden:file"), true);
  });
});
