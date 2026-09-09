import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import type { CollectionConfig } from "../config/index.js";
import type { ContentItem } from "../types/index.js";

/**
 * Parse frontmatter from markdown content.
 * Expects YAML frontmatter between --- delimiters.
 */
function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const frontmatterStr = match[1];
  const body = content.slice(match[0].length);

  // Simple YAML parser for common cases
  const frontmatter: Record<string, unknown> = {};

  for (const line of frontmatterStr.split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value: unknown = line.slice(colonIndex + 1).trim();

    // Parse common value types
    if (value === "true") value = true;
    else if (value === "false") value = false;
    else if (value === "null" || value === "") value = null;
    else if (/^-?\d+$/.test(value as string)) value = Number.parseInt(value as string, 10);
    else if (/^-?\d+\.\d+$/.test(value as string)) value = Number.parseFloat(value as string);
    else if ((value as string).startsWith('"') && (value as string).endsWith('"')) {
      value = (value as string).slice(1, -1);
    } else if ((value as string).startsWith("'") && (value as string).endsWith("'")) {
      value = (value as string).slice(1, -1);
    }

    frontmatter[key] = value;
  }

  return { frontmatter, body };
}

/**
 * Extract slug from file path or frontmatter.
 */
function extractSlug(
  filePath: string,
  frontmatter: Record<string, unknown>,
  slugField: string
): string {
  // First check frontmatter
  if (slugField in frontmatter && typeof frontmatter[slugField] === "string") {
    return frontmatter[slugField] as string;
  }

  // Fall back to filename without extension
  const filename = basename(filePath);
  const ext = extname(filename);
  return filename.slice(0, -ext.length);
}

/**
 * Check if a file is a markdown/MDX file.
 */
function isContentFile(filename: string): boolean {
  const ext = extname(filename).toLowerCase();
  return [".md", ".mdx", ".markdown"].includes(ext);
}

/**
 * Recursively collect all content files from a directory.
 */
async function collectFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip hidden directories
        if (entry.name.startsWith(".")) continue;
        const subFiles = await collectFiles(fullPath);
        files.push(...subFiles);
      } else if (entry.isFile() && isContentFile(entry.name)) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  return files;
}

/**
 * Load all content items from a collection.
 *
 * @param config - Collection configuration
 * @param frontmatterField - Optional field to filter by (items with false are skipped)
 */
export async function loadContent(
  config: CollectionConfig,
  frontmatterField?: string
): Promise<ContentItem[]> {
  const contentDir = config.path;

  // Check if directory exists
  try {
    await stat(contentDir);
  } catch {
    throw new Error(`Content directory not found: ${contentDir}`);
  }

  // Collect all markdown files
  const files = await collectFiles(contentDir);
  const items: ContentItem[] = [];

  for (const filePath of files) {
    const rawContent = await readFile(filePath, "utf-8");
    const { frontmatter, body } = parseFrontmatter(rawContent);

    // Skip if frontmatter field is set and value is false
    if (frontmatterField && frontmatter[frontmatterField] === false) {
      continue;
    }

    // Skip drafts by default
    if (frontmatter.draft === true) {
      continue;
    }

    const slug = extractSlug(filePath, frontmatter, config.slugField);

    items.push({
      slug,
      content: body,
      frontmatter,
      filePath: relative(process.cwd(), filePath),
    });
  }

  return items;
}

/**
 * Load a single content item by slug.
 *
 * @param config - Collection configuration
 * @param targetSlug - The slug to find
 */
export async function loadContentBySlug(
  config: CollectionConfig,
  targetSlug: string
): Promise<ContentItem | undefined> {
  const items = await loadContent(config);
  return items.find((item) => item.slug === targetSlug);
}
