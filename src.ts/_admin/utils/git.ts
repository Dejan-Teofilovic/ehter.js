import { run } from "./run.js";

// Returns the most recent git commit hash for a given filename
export async function getGitTag(filename: string): Promise<null | string> {
    const result = await run("git", [ "log", "-n", "1", "--", filename ]);
    if (!result.ok) { throw new Error(`git log error`); }

    let log = result.stdout.trim();
    if (!log) { return null; }

    const hashMatch = log.match(/^commit\s+([0-9a-f]{40})\n/i);
    if (!hashMatch) { return null; }
    return hashMatch[1];
}
