# Jira tracker sync

Google Apps Script that keeps the **Current Status** column of a Dev Capacity Tracker tab in sync with Jira.

Every 5 minutes it reads the Jira card links above the "PLEASE DO NOT EDIT ABOVE THIS LINE" row, looks up each card's status and flag, and updates only column I:

| Jira | Sheet |
|---|---|
| Flagged (not Done/Cancelled) | Flagged |
| Planning / Ready / In Progress / Internal Review / Acceptance / Done | same value |
| Cancelled | Removed |

Nothing else is touched: no pod, points, Final Status, Comments, or anything at/below the red line. Cells already marked **Removed** are left alone, and statuses not in the table are skipped.

## Setup
1. Create a Jira API token at https://id.atlassian.com/manage-profile/security/api-tokens.
2. At https://script.google.com, signed in with the Google account that can open the tracker, create a new project and paste in `Code.gs`.
3. Project Settings → Script Properties: add `SPREADSHEET_ID`, `SHEET_NAME`, `JIRA_BASE`, `JIRA_EMAIL`, `JIRA_TOKEN`.
4. Run `setup()` once and approve the permissions. It does a first sync and schedules one every 5 minutes.

Run `stopSync()` to turn it off. Errors show under **Executions** in the script editor.

Never commit your API token.
