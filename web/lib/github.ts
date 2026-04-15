import 'server-only'

const GITHUB_API_BASE_URL = 'https://api.github.com'

export class GitHubApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'GitHubApiError'
    this.status = status
  }
}

function getGitHubErrorMessage(status: number, fallback: string): string {
  if (status === 401) {
    return 'GitHub access token expired or invalid. Sign in again.'
  }

  if (status === 403) {
    return 'GitHub request was forbidden or rate-limited.'
  }

  return fallback
}

async function buildGitHubApiError(response: Response): Promise<GitHubApiError> {
  let fallback = response.statusText || 'GitHub API request failed'

  try {
    const payload = (await response.json()) as { message?: unknown }
    if (typeof payload.message === 'string' && payload.message.trim()) {
      fallback = payload.message.trim()
    }
  } catch {
    // Best effort only. Do not leak raw request details in errors.
  }

  return new GitHubApiError(
    response.status,
    getGitHubErrorMessage(response.status, fallback)
  )
}

export async function githubFetchJson<T>(
  githubToken: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${githubToken}`)
  headers.set('Accept', 'application/vnd.github+json')
  headers.set('X-GitHub-Api-Version', '2022-11-28')

  const response = await fetch(`${GITHUB_API_BASE_URL}${path}`, {
    ...init,
    headers,
  })

  if (!response.ok) {
    throw await buildGitHubApiError(response)
  }

  return (await response.json()) as T
}
