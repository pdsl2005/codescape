import { supabase } from './supabase'

export async function importUserRepos(githubToken: string, userId: string) {
  // Fetch all repos from GitHub API
  const response = await fetch('https://api.github.com/user/repos?per_page=100', {
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: 'application/vnd.github.v3+json'
    }
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '')
    throw new Error(
      `Failed to fetch GitHub repositories: ${response.status} ${response.statusText}` +
        (errorBody ? ` - ${errorBody}` : '')
    )
  }

  const repos = await response.json()

  if (!Array.isArray(repos)) {
    throw new Error('Unexpected GitHub API response when listing repositories; expected an array.')
  }
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

      // Ensure we have a string `content` and strip whitespace/newlines before base64-decoding
      const rawContent = typeof fileData?.content === 'string' ? fileData.content.replace(/\s+/g, '') : null
      if (!rawContent) {
        console.warn('Missing or invalid .codescape content for repo', repo.full_name)
        continue
      }

      let cityState: unknown
      try {
        const decoded = atob(rawContent) // decode base64
        const parsed = JSON.parse(decoded)

        // Basic shape validation: must be a non-null object (and not an array)
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          console.warn('Invalid .codescape JSON shape for repo', repo.full_name)
          continue
        }

        cityState = parsed
      } catch (error) {
        console.error('Failed to decode/parse .codescape file for repo', repo.full_name, error)
        continue
      }
      const { error } = await supabase.from('linked_repos').upsert(
        {
          user_id: userId,
          repo_owner: repo.owner.login,
          repo_name: repo.name,
          is_public: !repo.private,
          city_state: cityState,
          last_synced_at: new Date().toISOString()
        },
        {
          onConflict: 'user_id, repo_owner, repo_name'
        }
      )

      if (error) {
        console.error('Failed to upsert linked_repos record', {
          userId,
          repoFullName: repo.full_name,
          error
        })
        throw error
      }
    }
  }
}