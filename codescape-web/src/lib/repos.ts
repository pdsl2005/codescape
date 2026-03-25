import { supabase } from './supabase'

export async function importUserRepos(githubToken: string, userId: string) {
  // Fetch all repos from GitHub API
  const response = await fetch('https://api.github.com/user/repos?per_page=100', {
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: 'application/vnd.github.v3+json'
    }
  })

  const repos = await response.json()

  // For each repo, check if .codescape file exists
  for (const repo of repos) {
    const codescapeResponse = await fetch(
      `https://api.github.com/repos/${repo.full_name}/contents/.codescape`,
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }
    )

    if (codescapeResponse.ok) {
      // .codescape exists — parse it and save to Supabase
      const fileData = await codescapeResponse.json()
      const content = atob(fileData.content) // decode base64
      const cityState = JSON.parse(content)

      await supabase.from('linked_repos').upsert({
        user_id: userId,
        repo_owner: repo.owner.login,
        repo_name: repo.name,
        is_public: !repo.private,
        city_state: cityState,
        last_synced_at: new Date().toISOString()
      }, {
        onConflict: 'user_id, repo_owner, repo_name'
      })
    }
  }
}