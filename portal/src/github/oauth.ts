import { config } from "../config.js";

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface OAuthState {
  nonce: string;
  createdAt: number;
}

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://api.github.com/user";

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.githubClientId,
    redirect_uri: `${config.portalPublicUrl}/auth/callback`,
    scope: "read:user",
    state,
  });
  return `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const response = await fetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: config.githubClientId,
      client_secret: config.githubClientSecret,
      code,
      redirect_uri: `${config.portalPublicUrl}/auth/callback`,
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub token exchange failed (${response.status})`);
  }

  const payload = (await response.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!payload.access_token) {
    throw new Error(payload.error_description || payload.error || "GitHub token exchange returned no access token");
  }

  return payload.access_token;
}

export async function fetchGitHubUser(accessToken: string): Promise<GitHubUser> {
  const response = await fetch(GITHUB_USER_URL, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "OpenNOW-Proxy-Portal",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub user request failed (${response.status})`);
  }

  const payload = (await response.json()) as {
    id: number;
    login: string;
    name: string | null;
    avatar_url: string | null;
  };

  return {
    id: payload.id,
    login: payload.login,
    name: payload.name,
    avatarUrl: payload.avatar_url,
  };
}

export interface SponsorCheckResult {
  isActive: boolean;
  tierName: string | null;
}

export async function checkActiveSponsorship(
  accessToken: string,
  maintainerLogin: string = config.githubSponsorLogin,
): Promise<SponsorCheckResult> {
  const query = `
    query($login: String!) {
      viewer {
        sponsorshipForAccountMaintainer(login: $login) {
          isActive
          tier {
            name
          }
        }
      }
    }
  `;

  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "OpenNOW-Proxy-Portal",
    },
    body: JSON.stringify({
      query,
      variables: { login: maintainerLogin },
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub GraphQL sponsor check failed (${response.status})`);
  }

  const payload = (await response.json()) as {
    data?: {
      viewer?: {
        sponsorshipForAccountMaintainer?: {
          isActive?: boolean;
          tier?: { name?: string | null } | null;
        } | null;
      };
    };
    errors?: Array<{ message: string }>;
  };

  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join("; "));
  }

  const sponsorship = payload.data?.viewer?.sponsorshipForAccountMaintainer;
  return {
    isActive: sponsorship?.isActive === true,
    tierName: sponsorship?.tier?.name ?? null,
  };
}

export interface MaintainerSponsor {
  githubId: number;
  login: string;
}

export async function listActiveMaintainerSponsors(): Promise<MaintainerSponsor[]> {
  if (!config.githubToken) {
    return [];
  }

  const sponsors: MaintainerSponsor[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const query = `
      query($login: String!, $after: String) {
        user(login: $login) {
          sponsorshipsAsMaintainer(first: 100, after: $after, includePrivate: true) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              isActive
              sponsorEntity {
                ... on User {
                  id
                  databaseId
                  login
                }
                ... on Organization {
                  id
                  databaseId
                  login
                }
              }
            }
          }
        }
      }
    `;

    const response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${config.githubToken}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "OpenNOW-Proxy-Portal",
      },
      body: JSON.stringify({
        query,
        variables: {
          login: config.githubSponsorLogin,
          after: cursor,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`GitHub maintainer sponsor sync failed (${response.status})`);
    }

    const payload = (await response.json()) as {
      data?: {
        user?: {
          sponsorshipsAsMaintainer?: {
            pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
            nodes?: Array<{
              isActive?: boolean;
              sponsorEntity?: {
                databaseId?: number | null;
                login?: string | null;
              } | null;
            }>;
          };
        };
      };
      errors?: Array<{ message: string }>;
    };

    if (payload.errors?.length) {
      throw new Error(payload.errors.map((error) => error.message).join("; "));
    }

    const connection = payload.data?.user?.sponsorshipsAsMaintainer;
    const nodes = connection?.nodes ?? [];

    for (const node of nodes) {
      if (node.isActive !== true) continue;
      const entity = node.sponsorEntity;
      if (!entity?.databaseId || !entity.login) continue;
      sponsors.push({
        githubId: entity.databaseId,
        login: entity.login,
      });
    }

    hasNextPage = connection?.pageInfo?.hasNextPage === true;
    cursor = connection?.pageInfo?.endCursor ?? null;
  }

  return sponsors;
}
