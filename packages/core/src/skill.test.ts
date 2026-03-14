import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { listSkills } from "./skill.ts";

test("listSkills excludes hidden files like .DS_Store and .gitignore", async () => {
  const dir = await mkdtemp(join(tmpdir(), "skill-test-"));

  try {
    // Valid skill files
    await writeFile(join(dir, "my-skill.md"), "# My Skill\nDoes something.");
    await writeFile(join(dir, "another.txt"), "Another skill.");

    // Hidden files that should be ignored
    await writeFile(join(dir, ".DS_Store"), "bplist garbage");
    await writeFile(join(dir, ".gitignore"), "node_modules/");

    const skills = await listSkills(dir);

    const names = skills.map((s) => s.name);
    assert.ok(names.includes("my-skill"), "should include my-skill.md");
    assert.ok(names.includes("another"), "should include another.txt");
    assert.ok(!names.includes(".DS_Store"), "should exclude .DS_Store");
    assert.ok(!names.includes(".gitignore"), "should exclude .gitignore");
    assert.equal(skills.length, 2, "should only return 2 skills");
  } finally {
    await rm(dir, { recursive: true });
  }
});
