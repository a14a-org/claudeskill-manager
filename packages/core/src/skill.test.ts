import assert from "node:assert/strict";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	computeSkillHash,
	getSkillDescription,
	getSkillKey,
	getSkillTriggers,
	isHiddenSkillKey,
	listDirectorySkills,
	listSkills,
	parseFrontmatter,
	readDirectorySkill,
	readSkill,
	serializeFrontmatter,
} from "./skill.ts";

const createTempDir = async (prefix: string): Promise<string> => {
	const dir = join(tmpdir(), `skill-test-${prefix}-${Date.now()}`);
	await mkdir(dir, { recursive: true });
	return dir;
};

// =============================================================================
// Frontmatter parsing
// =============================================================================

test("parseFrontmatter extracts metadata and body", () => {
	const content = `---
description: A test skill
author: test
---
# My Skill

Content here.`;

	const { metadata, body } = parseFrontmatter(content);
	assert.equal(metadata.description, "A test skill");
	assert.equal(metadata.author, "test");
	assert.ok(body.includes("# My Skill"));
});

test("parseFrontmatter handles missing frontmatter", () => {
	const content = "# Just markdown\n\nNo frontmatter.";
	const { metadata, body } = parseFrontmatter(content);
	assert.equal(metadata.description, null);
	assert.equal(body, content);
});

test("parseFrontmatter handles array values", () => {
	const content = `---
triggers: ["/deploy", "/ship"]
tags: ["ci", "deploy"]
---
Body`;

	const { metadata } = parseFrontmatter(content);
	assert.deepEqual(metadata.triggers, ["/deploy", "/ship"]);
	assert.deepEqual(metadata.tags, ["ci", "deploy"]);
});

test("serializeFrontmatter roundtrips", () => {
	const content = `---
description: A test
author: me
---
# Body`;

	const { metadata, body } = parseFrontmatter(content);
	const serialized = serializeFrontmatter(metadata, body);
	const { metadata: meta2, body: body2 } = parseFrontmatter(serialized);
	assert.equal(meta2.description, "A test");
	assert.equal(meta2.author, "me");
	assert.ok(body2.includes("# Body"));
});

// =============================================================================
// File-based skill reading
// =============================================================================

test("readSkill reads a markdown file", async () => {
	const dir = await createTempDir("read-skill");
	try {
		await writeFile(join(dir, "test.md"), "---\ndescription: test\n---\n# Test\nContent.", "utf-8");
		const skill = await readSkill(join(dir, "test.md"), "command");
		assert.equal(skill.name, "test");
		assert.equal(skill.type, "command");
		assert.ok(skill.content.includes("# Test"));
	} finally {
		await rm(dir, { recursive: true });
	}
});

test("listSkills discovers all .md files in a directory", async () => {
	const dir = await createTempDir("list-skills");
	try {
		await writeFile(join(dir, "alpha.md"), "# Alpha", "utf-8");
		await writeFile(join(dir, "beta.md"), "# Beta", "utf-8");
		await writeFile(join(dir, "gamma.txt"), "# Gamma", "utf-8");
		await writeFile(join(dir, "hidden.json"), "{}", "utf-8"); // should be ignored

		const skills = await listSkills(dir, "command");
		const names = skills.map((s) => s.name);
		assert.ok(names.includes("alpha"), "should find alpha.md");
		assert.ok(names.includes("beta"), "should find beta.md");
		assert.ok(names.includes("gamma"), "should find gamma.txt");
		assert.ok(!names.includes("hidden"), "should not find .json files");
	} finally {
		await rm(dir, { recursive: true });
	}
});

// =============================================================================
// Directory-based skill reading
// =============================================================================

test("readDirectorySkill reads SKILL.md as main file", async () => {
	const dir = await createTempDir("dir-skill");
	const skillDir = join(dir, "my-skill");
	try {
		await mkdir(skillDir, { recursive: true });
		await writeFile(
			join(skillDir, "SKILL.md"),
			"---\ndescription: dir skill\n---\n# Dir Skill",
			"utf-8",
		);
		await writeFile(join(skillDir, "helper.js"), "export const x = 1;", "utf-8");

		const skill = await readDirectorySkill(skillDir, "skill");
		assert.ok(skill !== null, "should find the skill");
		assert.equal(skill!.name, "my-skill");
		assert.equal(skill!.type, "skill");
		assert.ok(skill!.content.includes("# Dir Skill"));
		assert.equal(skill!.files?.length, 1);
		assert.equal(skill!.files?.[0]?.name, "helper.js");
	} finally {
		await rm(dir, { recursive: true });
	}
});

test("readDirectorySkill returns null when no main file exists", async () => {
	const dir = await createTempDir("no-main");
	const skillDir = join(dir, "broken-skill");
	try {
		await mkdir(skillDir, { recursive: true });
		await writeFile(join(skillDir, "random.txt"), "no main file", "utf-8");

		const skill = await readDirectorySkill(skillDir, "skill");
		assert.equal(skill, null);
	} finally {
		await rm(dir, { recursive: true });
	}
});

// =============================================================================
// Symlink handling (the main bug fix)
// =============================================================================

test("listDirectorySkills follows symlinks to directories", async () => {
	const dir = await createTempDir("symlink-test");
	const realDir = join(dir, "real-skill");
	const symlinkPath = join(dir, "linked-skill");

	try {
		// Create a real skill directory
		await mkdir(realDir, { recursive: true });
		await writeFile(join(realDir, "SKILL.md"), "# Real Skill", "utf-8");

		// Create a symlink to it
		await symlink(realDir, symlinkPath);

		const skills = await listDirectorySkills(dir, "skill");
		const names = skills.map((s) => s.name);
		assert.ok(names.includes("real-skill"), "should find real directory");
		assert.ok(names.includes("linked-skill"), "should find symlinked directory");
		assert.equal(skills.length, 2, "should find both real and symlinked skills");
	} finally {
		await rm(dir, { recursive: true });
	}
});

test("listDirectorySkills handles broken symlinks gracefully", async () => {
	const dir = await createTempDir("broken-symlink");
	const realDir = join(dir, "real-skill");
	const brokenLink = join(dir, "broken-link");

	try {
		await mkdir(realDir, { recursive: true });
		await writeFile(join(realDir, "SKILL.md"), "# Real", "utf-8");

		// Create a broken symlink
		await symlink(join(dir, "nonexistent"), brokenLink);

		const skills = await listDirectorySkills(dir, "skill");
		assert.equal(skills.length, 1, "should only find the real skill");
		assert.equal(skills[0]!.name, "real-skill");
	} finally {
		await rm(dir, { recursive: true });
	}
});

test("listDirectorySkills ignores dot-prefixed entries", async () => {
	const dir = await createTempDir("dot-test");

	try {
		await mkdir(join(dir, ".hidden-skill"), { recursive: true });
		await writeFile(join(dir, ".hidden-skill", "SKILL.md"), "# Hidden", "utf-8");
		await mkdir(join(dir, "visible-skill"), { recursive: true });
		await writeFile(join(dir, "visible-skill", "SKILL.md"), "# Visible", "utf-8");

		const skills = await listDirectorySkills(dir, "skill");
		assert.equal(skills.length, 1);
		assert.equal(skills[0]!.name, "visible-skill");
	} finally {
		await rm(dir, { recursive: true });
	}
});

// =============================================================================
// Hash and key utilities
// =============================================================================

test("computeSkillHash is deterministic", async () => {
	const dir = await createTempDir("hash-test");
	try {
		await writeFile(join(dir, "test.md"), "# Test\nSame content.", "utf-8");

		const skill1 = await readSkill(join(dir, "test.md"), "command");
		const skill2 = await readSkill(join(dir, "test.md"), "command");

		assert.equal(computeSkillHash(skill1), computeSkillHash(skill2));
	} finally {
		await rm(dir, { recursive: true });
	}
});

test("computeSkillHash changes when content changes", async () => {
	const dir = await createTempDir("hash-change");
	try {
		await writeFile(join(dir, "test.md"), "# Version 1", "utf-8");
		const skill1 = await readSkill(join(dir, "test.md"), "command");
		const hash1 = computeSkillHash(skill1);

		await writeFile(join(dir, "test.md"), "# Version 2", "utf-8");
		const skill2 = await readSkill(join(dir, "test.md"), "command");
		const hash2 = computeSkillHash(skill2);

		assert.notEqual(hash1, hash2);
	} finally {
		await rm(dir, { recursive: true });
	}
});

test("getSkillKey formats as type:name", async () => {
	const dir = await createTempDir("key-test");
	try {
		await writeFile(join(dir, "deploy.md"), "# Deploy", "utf-8");
		const skill = await readSkill(join(dir, "deploy.md"), "command");
		assert.equal(getSkillKey(skill), "command:deploy");
	} finally {
		await rm(dir, { recursive: true });
	}
});

test("getSkillDescription extracts from metadata", () => {
	const skill = {
		name: "test",
		content: "---\ndescription: My description\n---\n# Body",
		metadata: { description: "My description" } as any,
		path: "/tmp/test.md",
		modifiedAt: new Date(),
		type: "command" as const,
	};
	assert.equal(getSkillDescription(skill), "My description");
});

test("getSkillTriggers includes skill name as trigger", () => {
	const skill = {
		name: "deploy",
		content: "# Deploy",
		metadata: {} as any,
		path: "/tmp/deploy.md",
		modifiedAt: new Date(),
		type: "command" as const,
	};
	const triggers = getSkillTriggers(skill);
	assert.ok(triggers.includes("/deploy"));
});

// =============================================================================
// isHiddenSkillKey
// =============================================================================

test("isHiddenSkillKey returns true for hidden skill keys", () => {
	assert.equal(isHiddenSkillKey("md:.DS_Store"), true);
	assert.equal(isHiddenSkillKey("md:.gitignore"), true);
	assert.equal(isHiddenSkillKey("md:.env"), true);
});

test("isHiddenSkillKey returns false for normal skill keys", () => {
	assert.equal(isHiddenSkillKey("md:my-skill"), false);
	assert.equal(isHiddenSkillKey("md:another-skill"), false);
});

test("isHiddenSkillKey handles keys with multiple colons", () => {
	assert.equal(isHiddenSkillKey("md:some:skill"), false);
	assert.equal(isHiddenSkillKey("md:.hidden:file"), true);
});
