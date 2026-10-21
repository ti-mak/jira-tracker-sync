# Jira tracker sync

Google Apps Script that keeps the **Current Status** column of a Dev Capacity Tracker tab in sync with Jira.

Every 5 minutes it reads the Jira card links above the "PLEASE DO NOT EDIT ABOVE THIS LINE" row, looks up each card's status and flag, and updates only column I:

| Jira | Sheet |
|---|---|
| Flagged (not Done/Cancelled) | Flagged |
| Planning / Ready / In Progress / Internal Review / Acceptance / Done | same value |
| Cancelled | Removed |

Nothing else is touched: no pod, points, Final Status, Comments, or anything at/below the red line. Cells already marked **Removed** are left alone, and statuses not in the table are skipped.

## WLD screenshot queue
On the same 5-minute run, the script checks a **WLD Queue** tab in the tracker spreadsheet (it can be hidden). Columns: Card, Jira attachment ID, File name, Screenshots folder ID, WLD spreadsheet ID, WLD tab, WLD row, Status, Drive link, Updated.

For each row with Status `Pending`, it downloads the attachment from Jira, saves it in the screenshots folder, appends the Drive link to column F (Expanded Explanation) of that WLD row, and sets Status to `Done` (or `Error: ...`). Run `processScreenshotQueue()` to process it immediately.

## Setup
1. Create a Jira API token at https://id.atlassian.com/manage-profile/security/api-tokens.
2. At https://script.google.com, signed in with the Google account that can open the tracker, create a new project and paste in `Code.gs`.
3. Project Settings → Script Properties: add `SPREADSHEET_ID`, `SHEET_NAME`, `JIRA_BASE`, `JIRA_EMAIL`, `JIRA_TOKEN`.
4. Run `setup()` once and approve the permissions. It does a first sync and schedules one every 5 minutes.

Run `stopSync()` to turn it off. Errors show under **Executions** in the script editor.

Never commit your API token.
