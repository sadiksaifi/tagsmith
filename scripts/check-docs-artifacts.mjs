import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const outputRoot = join(repositoryRoot, "docs/.vitepress/dist");
const sourceSkillPath = join(repositoryRoot, "skills/tagsmith/SKILL.md");
const publishedSkillPath = join(outputRoot, "skills/tagsmith/SKILL.md");
const generatedSetupPath = join(outputRoot, "docs/setup-with-ai.md");
const renderedSetupPath = join(outputRoot, "docs/setup-with-ai.html");
const generatedFullDocsPath = join(outputRoot, "llms-full.txt");

const sourceSkill = await readFile(sourceSkillPath, "utf8");
const publishedSkill = await readFile(publishedSkillPath, "utf8");
const generatedSetup = await readFile(generatedSetupPath, "utf8");
const renderedSetup = await readFile(renderedSetupPath, "utf8");
const generatedFullDocs = await readFile(generatedFullDocsPath, "utf8");

assert.equal(publishedSkill, sourceSkill, "published SKILL.md differs from its source");

const regionStart = "<!-- #region agent-guidance -->\n";
const regionEnd = "\n<!-- #endregion agent-guidance -->";
const startIndex = sourceSkill.indexOf(regionStart);
const endIndex = sourceSkill.indexOf(regionEnd, startIndex + regionStart.length);

assert.notEqual(startIndex, -1, "SKILL.md is missing the agent-guidance region start");
assert.notEqual(endIndex, -1, "SKILL.md is missing the agent-guidance region end");

const sourceGuidance = sourceSkill.slice(startIndex + regionStart.length, endIndex);
const generatedGuidance = sourceGuidance.replace(/^(\s*)- /gm, "$1* ");

assert.ok(
  generatedSetup.includes(generatedGuidance),
  "setup-with-ai.md does not contain the complete Agent Skill guidance",
);
assert.ok(
  generatedFullDocs.includes(generatedGuidance),
  "llms-full.txt does not contain the complete Agent Skill guidance",
);

const firstGuidanceParagraph = sourceGuidance.split("\n\n", 1)[0];
assert.ok(
  !renderedSetup.includes(firstGuidanceParagraph),
  "agent-only guidance leaked into the human setup page",
);
