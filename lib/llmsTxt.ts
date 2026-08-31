/**
 * Builds /llms.txt from the same content the homepage uses.
 * Only lists projects, work, and links that already appear on the site.
 * Do not invent entries here (e.g. LionPlan is not on the homepage).
 */

import {
  education,
  experiences,
  hackathons,
  projects,
  socialLinks,
  youtubeChannel,
} from "@/lib/content";
import { SITE_URL } from "@/lib/seo";

/** Replace em dashes so crawler copy stays plain. */
function plain(text: string): string {
  return text
    .replace(/\s*[—–]\s*/g, ". ")
    .replace(/,\s*not\s+[^.]+\.?/gi, ".")
    .replace(/\.\s*\./g, ".")
    .replace(/\. ([a-z])/g, (_, letter: string) => `. ${letter.toUpperCase()}`)
    .trim();
}

function projectLine(name: string, description: string, link?: string): string {
  const desc = plain(description);
  if (link) return `- [${name}](${link}): ${desc}`;
  return `- ${name}: ${desc}`;
}

export function buildLlmsTxt(): string {
  const pages = [
    `- [Home](${SITE_URL}): bio, experience, projects, education, hackathons`,
    `- [Blog](${SITE_URL}/blog): essays`,
    `- [Notes](${SITE_URL}/notes): class notes and lecture write-ups`,
  ];

  const projectLines = projects.map((project) =>
    projectLine(project.name, project.description, project.link || undefined)
  );

  const hyphenDate = (date: string) => date.replace(/\s*[—–]\s*/g, " - ");

  const experienceLines = experiences.map((item) => {
    return `- ${item.title} at ${item.company} (${hyphenDate(item.date)})`;
  });

  const educationLines = education.map((item) => {
    return `- ${item.school}, ${item.degree} (${hyphenDate(item.date)})`;
  });

  const hackathonLines = hackathons.map((item) => {
    const awards =
      item.awards && item.awards.length > 0
        ? ` ${item.awards.map((award) => award.name).join(", ")}.`
        : "";
    const href = item.link
      ? `[${item.projectName}](${item.link})`
      : item.projectName;
    return `- ${href} at ${item.name}: ${plain(item.description)}${awards}`;
  });

  const elsewhere = socialLinks
    .filter((link) => link.url.startsWith("http"))
    .map((link) => `- [${link.name}](${link.url})`);
  elsewhere.push(`- [YouTube](${youtubeChannel})`);

  const email = socialLinks.find((link) => link.url.startsWith("mailto:"));
  if (email) {
    elsewhere.push(`- Email: ${email.url.replace("mailto:", "")}`);
  }

  return [
    "# Johnathan Mo",
    "",
    "Johnathan Mo (Jmo) is a CS student at Columbia University.",
    "This is his personal site.",
    "",
    "## Pages",
    "",
    ...pages,
    "",
    "## Projects",
    "",
    "Projects listed on the homepage.",
    "",
    ...projectLines,
    "",
    "## Experience",
    "",
    ...experienceLines,
    "",
    "## Education",
    "",
    ...educationLines,
    "",
    "## Hackathons",
    "",
    ...hackathonLines,
    "",
    "## Elsewhere",
    "",
    ...elsewhere,
    "",
  ].join("\n");
}
