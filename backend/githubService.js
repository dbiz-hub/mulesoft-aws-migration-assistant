import fs from "fs";
import path from "path";

// Helper to extract owner and repo from Github URL
export function parseGithubUrl(url) {
  try {
    // Expected format: https://github.com/owner/repo or github.com/owner/repo
    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith("http")) {
      cleanUrl = "https://" + cleanUrl;
    }
    const parsed = new URL(cleanUrl);
    const paths = parsed.pathname.split("/").filter(p => p);
    if (paths.length >= 2) {
      return {
        owner: paths[0],
        repo: paths[1].replace(".git", "")
      };
    }
  } catch (e) {
    console.error("Failed to parse Github URL:", e);
  }
  return null;
}

export async function checkGithubConnection(token) {
  try {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "MuleSoft-AWS-Migration-Assistant-Prototype"
      }
    });
    if (response.ok) {
      const data = await response.json();
      return { success: true, user: data.login };
    }
    return { success: false, status: response.status };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function fetchGithubRepoTree(token, owner, repo) {
  try {
    // 1. Get the default branch
    const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "MuleSoft-AWS-Migration-Assistant-Prototype"
      }
    });
    if (!repoResponse.ok) {
      throw new Error(`Failed to fetch repo info: ${repoResponse.statusText}`);
    }
    const repoInfo = await repoResponse.json();
    const defaultBranch = repoInfo.default_branch || "main";

    // 2. Fetch recursive git tree
    const treeResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "MuleSoft-AWS-Migration-Assistant-Prototype"
      }
    });
    if (!treeResponse.ok) {
      throw new Error(`Failed to fetch repo tree: ${treeResponse.statusText}`);
    }
    const treeData = await treeResponse.json();
    
    // Filter tree to return file info
    return treeData.tree.map(node => ({
      path: node.path,
      type: node.type === "tree" ? "dir" : "file",
      sha: node.sha,
      size: node.size
    }));
  } catch (error) {
    console.error("Error fetching repo tree:", error);
    throw error;
  }
}

export async function fetchGithubFileContent(token, owner, repo, filePath) {
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "MuleSoft-AWS-Migration-Assistant-Prototype"
      }
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch file ${filePath}: ${response.statusText}`);
    }
    const data = await response.json();
    if (data.encoding === "base64") {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }
    return data.content;
  } catch (error) {
    console.error(`Error fetching file ${filePath}:`, error);
    throw error;
  }
}

// Function to recursively scan a local directory to list files for the mock fallback
function getLocalFilesRecursive(dir, baseDir = "") {
  let results = [];
  const list = fs.readdirSync(dir);
  
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const relPath = path.join(baseDir, file).replace(/\\/g, "/");
    const stat = fs.statSync(filePath);
    
    if (stat && stat.isDirectory()) {
      results.push({
        path: relPath,
        type: "dir"
      });
      results = results.concat(getLocalFilesRecursive(filePath, relPath));
    } else {
      results.push({
        path: relPath,
        type: "file",
        size: stat.size
      });
    }
  });
  return results;
}

export async function loadMockLocalRepo(repoName) {
  const samplesDir = path.resolve("samples", repoName);
  if (!fs.existsSync(samplesDir)) {
    throw new Error(`Mock repository ${repoName} not found at ${samplesDir}`);
  }
  
  const files = getLocalFilesRecursive(samplesDir);
  
  // Create object with file paths and contents
  const repoFiles = {};
  for (const f of files) {
    if (f.type === "file") {
      const fullPath = path.join(samplesDir, f.path);
      const content = fs.readFileSync(fullPath, "utf-8");
      repoFiles[f.path] = content;
    }
  }
  
  return {
    name: repoName,
    files: files,
    contents: repoFiles
  };
}
