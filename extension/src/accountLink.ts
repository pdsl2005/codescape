import * as vscode from "vscode";

const LINKED_STATE_KEY = "codescape.linkedAccount.v1";

export interface LinkedCodescapeAccount {
  supabaseUserId: string;
  githubId: string;
  githubLogin: string;
  avatarUrl?: string;
  linkedAt: string;
}

export function getLinkedAccount(
  context: vscode.ExtensionContext,
): LinkedCodescapeAccount | undefined {
  return context.globalState.get(LINKED_STATE_KEY);
}

export async function linkCodescapeAccount(
  context: vscode.ExtensionContext,
): Promise<void> {
  const config = vscode.workspace.getConfiguration("codescape");
  const supabaseUrl = config.get<string>("supabaseUrl")?.trim();
  const anonKey = config.get<string>("functionsAnonKey")?.trim();
  if (!supabaseUrl || !anonKey) {
    void vscode.window.showErrorMessage(
      "Codescape: Set codescape.supabaseUrl and codescape.functionsAnonKey in Settings.",
    );
    return;
  }

  const session = await vscode.authentication.getSession(
    "github",
    ["read:user", "user:email"],
    { createIfNone: true },
  );
  if (!session?.accessToken) {
    void vscode.window.showErrorMessage("Codescape: GitHub sign-in was cancelled.");
    return;
  }

  const base = supabaseUrl.replace(/\/$/, "");
  const url = `${base}/functions/v1/codescape-api/extension/link`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-GitHub-Access-Token": session.accessToken,
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
  });

  let body: { error?: string; code?: string } & Record<string, unknown> = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    /* ignore */
  }

  if (!res.ok) {
    if (res.status === 404 && body?.code === "ACCOUNT_NOT_LINKED") {
      const website =
        config.get<string>("websiteUrl")?.trim() || "http://localhost:3000";
      const open = "Open Codescape website";
      const pick = await vscode.window.showErrorMessage(
        body.error ??
          "Sign in with GitHub on the Codescape website first, then try again.",
        open,
      );
      if (pick === open) {
        await vscode.env.openExternal(vscode.Uri.parse(website));
      }
      return;
    }
    void vscode.window.showErrorMessage(
      `Codescape: Could not link account (${res.status}): ${body.error ?? res.statusText}`,
    );
    return;
  }

  const payload = body as {
    supabase_user_id: string;
    github_id: string;
    github_login: string;
    avatar_url?: string;
  };

  const linked: LinkedCodescapeAccount = {
    supabaseUserId: payload.supabase_user_id,
    githubId: payload.github_id,
    githubLogin: payload.github_login,
    avatarUrl: payload.avatar_url,
    linkedAt: new Date().toISOString(),
  };
  await context.globalState.update(LINKED_STATE_KEY, linked);
  void vscode.window.showInformationMessage(
    `Codescape: Linked to @${linked.githubLogin} (same account as the website).`,
  );
}

export async function unlinkCodescapeAccount(
  context: vscode.ExtensionContext,
): Promise<void> {
  await context.globalState.update(LINKED_STATE_KEY, undefined);
  void vscode.window.showInformationMessage("Codescape: Website account link cleared.");
}

export async function showLinkedAccountStatus(
  context: vscode.ExtensionContext,
): Promise<void> {
  const linked = getLinkedAccount(context);
  if (!linked) {
    void vscode.window.showInformationMessage(
      "Codescape: No website account linked. Run “Codescape: Link website account (GitHub)”.",
    );
    return;
  }
  void vscode.window.showInformationMessage(
    `Codescape: Linked as @${linked.githubLogin} (user id ${linked.supabaseUserId}).`,
  );
}
