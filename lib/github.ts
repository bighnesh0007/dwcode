import { GitHubIntegration } from "@/models/GitHubIntegration";
import connectToDatabase from "@/lib/db";
import { Submission } from "@/models/Submission";
import { Problem } from "@/models/Problem";

const REPO_NAME = "dwcode-solutions";

type GitHubFile = {
  path: string;
  content: string;
};

type PlaygroundPublishInput = {
  script: string;
  files: Array<{ name: string; content: string }>;
  testCases?: Array<{
    name: string;
    expectedOutput?: string;
  }>;
  output?: string;
  message?: string;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "dataweave-run";
}

async function githubFetch(token: string, path: string, init?: RequestInit) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub request failed (${response.status}): ${detail}`);
  }
  return response;
}

async function ensureRepository(
  token: string,
  username: string,
  repoName: string,
  isPrivate: boolean
) {
  const existing = await fetch(`https://api.github.com/repos/${username}/${repoName}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (existing.ok) return existing.json();
  if (existing.status !== 404) {
    throw new Error(`Could not inspect GitHub repository (${existing.status}).`);
  }

  const created = await githubFetch(token, "/user/repos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: repoName,
      description: "DataWeave projects and solutions published from DWCode.",
      private: isPrivate,
      auto_init: true,
    }),
  });
  return created.json();
}

async function commitFiles(
  token: string,
  username: string,
  repoName: string,
  branch: string,
  files: GitHubFile[],
  message: string
) {
  const refResponse = await githubFetch(
    token,
    `/repos/${username}/${repoName}/git/ref/heads/${encodeURIComponent(branch)}`
  );
  const ref = await refResponse.json();
  const parentSha = ref.object.sha;

  const commitResponse = await githubFetch(
    token,
    `/repos/${username}/${repoName}/git/commits/${parentSha}`
  );
  const parentCommit = await commitResponse.json();

  const treeEntries = await Promise.all(
    files.map(async (file) => {
      const blobResponse = await githubFetch(
        token,
        `/repos/${username}/${repoName}/git/blobs`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: Buffer.from(file.content).toString("base64"),
            encoding: "base64",
          }),
        }
      );
      const blob = await blobResponse.json();
      return { path: file.path, mode: "100644", type: "blob", sha: blob.sha };
    })
  );

  const treeResponse = await githubFetch(
    token,
    `/repos/${username}/${repoName}/git/trees`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        base_tree: parentCommit.tree.sha,
        tree: treeEntries,
      }),
    }
  );
  const tree = await treeResponse.json();

  const newCommitResponse = await githubFetch(
    token,
    `/repos/${username}/${repoName}/git/commits`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        tree: tree.sha,
        parents: [parentSha],
      }),
    }
  );
  const newCommit = await newCommitResponse.json();

  await githubFetch(
    token,
    `/repos/${username}/${repoName}/git/refs/heads/${encodeURIComponent(branch)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sha: newCommit.sha }),
    }
  );

  return newCommit.sha as string;
}

export async function publishPlaygroundToGitHub(
  userId: string,
  input: PlaygroundPublishInput
) {
  await connectToDatabase();
  const integration = await GitHubIntegration.findOne({ userId });
  if (!integration) throw new Error("Connect GitHub before publishing.");

  const repoName = integration.repoName || "dwcode-workspace";
  const repository = await ensureRepository(
    integration.accessToken,
    integration.githubUsername,
    repoName,
    Boolean(integration.repoPrivate)
  );
  const branch = integration.defaultBranch || repository.default_branch || "main";
  const now = new Date();
  const datePath = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
  ].join("/");
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const title = input.message?.trim() || "DataWeave playground run";
  const projectPath = `playground/${datePath}/${timestamp}-${slugify(title)}`;

  const files: GitHubFile[] = [
    { path: `${projectPath}/transform.dwl`, content: input.script },
    ...input.files.map((file) => ({
      path: `${projectPath}/inputs/${file.name.replace(/[\\/]/g, "-")}`,
      content: file.content,
    })),
    {
      path: `${projectPath}/README.md`,
      content: `# ${title}\n\nPublished from DWCode on ${now.toISOString()}.\n\n## Structure\n\n- \`transform.dwl\`: DataWeave script\n- \`inputs/\`: input payloads and variables\n- \`tests.json\`: playground test expectations\n- \`output.txt\`: latest output when available\n`,
    },
    {
      path: `${projectPath}/tests.json`,
      content: JSON.stringify(input.testCases || [], null, 2),
    },
    {
      path: `${projectPath}/metadata.json`,
      content: JSON.stringify(
        {
          source: "DWCode Playground",
          publishedAt: now.toISOString(),
          inputCount: input.files.length,
          testCount: input.testCases?.length || 0,
        },
        null,
        2
      ),
    },
  ];

  if (input.output) {
    files.push({ path: `${projectPath}/output.txt`, content: input.output });
  }

  const commitSha = await commitFiles(
    integration.accessToken,
    integration.githubUsername,
    repoName,
    branch,
    files,
    `playground: ${title} (${now.toISOString()})`
  );

  return {
    repo: `${integration.githubUsername}/${repoName}`,
    branch,
    commitSha,
    url: `https://github.com/${integration.githubUsername}/${repoName}/tree/${branch}/${projectPath}`,
  };
}

export async function pushSolutionToGithub(userId: string, problem: any, code: string) {
  try {
    await connectToDatabase();
    const integration = await GitHubIntegration.findOne({ userId });
    if (!integration) return;

    const token = integration.accessToken;
    const username = integration.githubUsername;

    // 1. Ensure Repo Exists
    const repoRes = await fetch(`https://api.github.com/repos/${username}/${REPO_NAME}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (repoRes.status === 404) {
      const createRes = await fetch(`https://api.github.com/user/repos`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/vnd.github.v3+json",
        },
        body: JSON.stringify({
          name: REPO_NAME,
          description: "DataWeave solutions generated automatically by DWCode.",
          private: false,
          auto_init: true
        })
      });
      if (!createRes.ok) {
        console.error("Failed to create repo", await createRes.text());
        return;
      }
      // wait a bit for repo creation to propagate
      await new Promise(r => setTimeout(r, 2000));
    }

    // 2. Prepare file
    const fileContent = `%dw 2.0\n// Solved: ${problem.title || problem.slug}\n// Difficulty: ${problem.difficulty}\n// Solved via DWCode\n\n${code}`;
    const base64Content = Buffer.from(fileContent).toString("base64");
    const filePath = `${problem.difficulty || "Uncategorized"}/${problem.slug}.dwl`;

    // 3. Check if file exists to get SHA
    const fileRes = await fetch(`https://api.github.com/repos/${username}/${REPO_NAME}/contents/${filePath}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    let sha = undefined;
    if (fileRes.ok) {
      const fileData = await fileRes.json();
      sha = fileData.sha;
    }

    // 4. Update or create file
    const pushRes = await fetch(`https://api.github.com/repos/${username}/${REPO_NAME}/contents/${filePath}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `Solved: ${problem.title || problem.slug} (#${problem.difficulty})`,
        content: base64Content,
        sha
      })
    });

    if (!pushRes.ok) {
      console.error("Failed to push file", await pushRes.text());
    }

    // 5. Update README
    await updateReadme(userId, token, username);

  } catch (err) {
    console.error("pushSolutionToGithub error", err);
  }
}

async function updateReadme(userId: string, token: string, username: string) {
  try {
    const allSubmissions = await Submission.find({ userId }).lean();
    const acceptedSlugs = new Set(
      allSubmissions.filter((s: any) => s.status === "Accepted").map((s: any) => s.problemSlug)
    );
    
    const solvedProblems = await Problem.find({ slug: { $in: Array.from(acceptedSlugs) } }).select("title slug difficulty").lean();
    
    const easyCount = solvedProblems.filter((p: any) => p.difficulty === "Easy").length;
    const mediumCount = solvedProblems.filter((p: any) => p.difficulty === "Medium").length;
    const hardCount = solvedProblems.filter((p: any) => p.difficulty === "Hard").length;

    let readmeContent = `# DWCode Solutions\n\nGenerated automatically by DWCode.\n\n## Stats\n\n- Total Solved: ${solvedProblems.length}\n- Easy: ${easyCount}\n- Medium: ${mediumCount}\n- Hard: ${hardCount}\n\n## Latest Solved\n\n`;

    // get last 5 solved
    const latestSlugs = Array.from(acceptedSlugs).slice(-5);
    const latestProblems = solvedProblems.filter((p: any) => latestSlugs.includes(p.slug));

    latestProblems.forEach((p: any) => {
      readmeContent += `- ${p.title || p.slug}\n`;
    });

    const base64Content = Buffer.from(readmeContent).toString("base64");
    
    const fileRes = await fetch(`https://api.github.com/repos/${username}/${REPO_NAME}/contents/README.md`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    let sha = undefined;
    if (fileRes.ok) {
      const fileData = await fileRes.json();
      sha = fileData.sha;
    }

    const pushRes = await fetch(`https://api.github.com/repos/${username}/${REPO_NAME}/contents/README.md`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `Update stats in README.md`,
        content: base64Content,
        sha
      })
    });
    
    if (!pushRes.ok) {
      console.error("Failed to push README", await pushRes.text());
    }
  } catch (err) {
    console.error("updateReadme error", err);
  }
}
