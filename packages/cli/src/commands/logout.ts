/**
 * Logout command - clear local credentials
 */

import * as p from "@clack/prompts";
import { deleteCredentials, loadCredentials } from "../credentials.js";
import * as api from "../api.js";

/**
 * Run the logout command
 */
export const runLogout = async () => {
  const credentials = await loadCredentials();

  if (!credentials?.accessToken) {
    p.log.info("Not logged in.");
    return;
  }

  const confirm = await p.confirm({
    message: "Are you sure you want to logout?",
  });

  if (p.isCancel(confirm) || !confirm) {
    p.cancel("Logout cancelled.");
    return;
  }

  const spinner = p.spinner();
  spinner.start("Logging out...");

  // Invalidate server session
  await api.logout();

  // Delete local credentials
  await deleteCredentials();

  spinner.stop("Logged out");

  p.log.success("Successfully logged out.");
  p.log.info("Your encrypted skills remain on the server. Login again to access them.");
};
