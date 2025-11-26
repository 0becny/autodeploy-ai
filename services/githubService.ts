import { FileEntry } from '../types';

const GITHUB_API_BASE = 'https://api.github.com';

interface GithubUser {
  login: string;
  email?: string;
}

export const validateToken = async (token: string): Promise<GithubUser> => {
  const res = await fetch(`${GITHUB_API_BASE}/user`, {
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!res.ok) {
    throw new Error('Invalid GitHub Token');
  }

  return res.json();
};

export const createRepository = async (token: string, name: string, description: string, isPrivate: boolean) => {
  const res = await fetch(`${GITHUB_API_BASE}/user/repos`, {
    method: 'POST',
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      description,
      private: isPrivate,
      auto_init: true, // Create with README so we have a base branch to commit to
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to create repository');
  }

  return res.json();
};

// Create a blob for a single file
const createBlob = async (token: string, owner: string, repo: string, content: string, encoding: 'utf-8' | 'base64' = 'utf-8') => {
  const res = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/git/blobs`, {
    method: 'POST',
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content,
      encoding,
    }),
  });

  if (!res.ok) throw new Error(`Failed to create blob`);
  return res.json();
};

// Main function to push all files
export const pushFilesToRepo = async (
  token: string,
  owner: string,
  repo: string,
  files: FileEntry[],
  dockerfile: string,
  dockerCompose: string,
  message: string,
  onProgress: (progress: number, status: string) => void
) => {
  // 1. Get the reference to HEAD
  onProgress(10, 'Getting repo info...');
  const refRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/git/refs/heads/main`, {
    headers: { Authorization: `token ${token}` },
  });
  
  // Handling cases where main might be master or empty
  let baseTreeSha = null;
  let parentCommitSha = null;

  if (refRes.ok) {
    const refData = await refRes.json();
    parentCommitSha = refData.object.sha;
    
    // Get the commit to get the tree
    const commitRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/git/commits/${parentCommitSha}`, {
      headers: { Authorization: `token ${token}` },
    });
    const commitData = await commitRes.json();
    baseTreeSha = commitData.tree.sha;
  }

  // 2. Create Blobs for all files
  const treeItems: Array<{ path: string; mode: string; type: string; sha: string }> = [];
  
  // Add generated Dockerfile
  onProgress(20, 'Uploading Dockerfile...');
  const dockerBlob = await createBlob(token, owner, repo, dockerfile);
  treeItems.push({
    path: 'Dockerfile',
    mode: '100644',
    type: 'blob',
    sha: dockerBlob.sha,
  });

  // Add generated docker-compose.yaml (using .yaml to satisfy Coolify defaults)
  onProgress(25, 'Uploading docker-compose.yaml...');
  const composeBlob = await createBlob(token, owner, repo, dockerCompose);
  treeItems.push({
    path: 'docker-compose.yaml',
    mode: '100644',
    type: 'blob',
    sha: composeBlob.sha,
  });

  // Process user files
  const totalFiles = files.length;
  let processed = 0;

  for (const file of files) {
    // Skip huge files or node_modules/git folders
    if (file.path.includes('node_modules/') || file.path.includes('.git/') || file.path.includes('.next/')) continue;
    
    // Safety check for size (skip > 1MB for this frontend demo)
    if (file.fileObject.size > 1024 * 1024) continue;

    processed++;
    const progressPercent = 30 + Math.floor((processed / totalFiles) * 40);
    onProgress(progressPercent, `Uploading ${file.path}...`);

    try {
      // Read file content as base64 to handle binary safe
      const content = await fileToMap(file.fileObject);
      const blob = await createBlob(token, owner, repo, content, 'base64');
      
      treeItems.push({
        path: file.path,
        mode: '100644', // 100644 for file, 100755 for executable
        type: 'blob',
        sha: blob.sha,
      });
    } catch (e) {
      console.warn(`Failed to upload ${file.path}`, e);
    }
  }

  // 3. Create a new Tree
  onProgress(80, 'Creating file tree...');
  const treeRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    headers: { Authorization: `token ${token}` },
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: treeItems,
    }),
  });
  
  if(!treeRes.ok) throw new Error("Failed to create tree");
  const treeData = await treeRes.json();

  // 4. Create Commit
  onProgress(90, 'Committing changes...');
  const commitPayload: any = {
    message,
    tree: treeData.sha,
  };
  if (parentCommitSha) {
    commitPayload.parents = [parentCommitSha];
  }

  const newCommitRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    headers: { Authorization: `token ${token}` },
    body: JSON.stringify(commitPayload),
  });
  
  if(!newCommitRes.ok) throw new Error("Failed to create commit");
  const newCommitData = await newCommitRes.json();

  // 5. Update Ref
  onProgress(95, 'Updating repository...');
  const updateRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/git/refs/heads/main`, {
    method: 'PATCH',
    headers: { Authorization: `token ${token}` },
    body: JSON.stringify({
      sha: newCommitData.sha,
      force: true,
    }),
  });

  if(!updateRes.ok) throw new Error("Failed to update ref");
  onProgress(100, 'Done!');
};

const fileToMap = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // remove data:.*;base64, prefix
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};