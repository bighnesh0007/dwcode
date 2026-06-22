import { GitHubIntegration } from "@/models/GitHubIntegration";
import connectToDatabase from "@/lib/db";
import { Submission } from "@/models/Submission";
import { Problem } from "@/models/Problem";

const REPO_NAME = "dwcode-solutions";

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
