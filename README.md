# Yapping Club Management Bot

A lightweight Telegram group-management bot using Node.js, Telegraf and PostgreSQL.

## Features
- Welcome and goodbye messages
- Ban, unban, kick, mute, unmute
- Warning system (3 warnings attempts a 1-hour mute)
- Rules and group settings stored in PostgreSQL
- Anti-link toggle and anti-flood protection
- Lock/unlock, purge, user info and admin list
- Private `/start` menu with Help, Rules and About buttons
- Admin checks for moderation commands

## Deploy on Railway
1. Create a Telegram bot with `@BotFather` and copy its token.
2. Create a GitHub repository and upload all files in this project.
3. In Railway, create a project and deploy from your GitHub repository.
4. Add a PostgreSQL database to the Railway project.
5. In the bot service's Variables, add:
   - `BOT_TOKEN` = your BotFather token
   - `OWNER_ID` = your numeric Telegram user ID (optional)
6. Railway should detect `npm start` from `package.json`. If needed, set the start command to `npm start`.
7. Redeploy after adding variables.

Do not put your bot token in source code or upload it to GitHub.

## Telegram setup
1. Add the bot to your group.
2. Promote it to admin.
3. Give it permission to delete messages, ban/restrict users and manage chat permissions.
4. For group commands, send `/setprivacy` to `@BotFather`, select your bot and disable privacy if you want it to see ordinary group messages. Re-add the bot to the group if Telegram asks.
5. Test `/start` in DM, then `/help` in the group.

## Commands
Member: `/start`, `/help`, `/rules`, `/id`, `/info`, `/admins`

Admin commands (reply to a member's message unless noted):
- `/ban [reason]`
- `/kick`
- `/mute [minutes]`
- `/unmute`
- `/warn [reason]`
- `/warnings`
- `/clearwarnings`
- `/purge` (reply to the first message to delete)
- `/lock`, `/unlock`
- `/setrules <text>`
- `/antilink on|off`
- `/antiflood on|off`
- `/unban <user_id>`

## Notes
- Anti-flood uses in-memory counters, so counters reset when the service restarts.
- Anti-link and anti-flood settings are saved per group.
- The bot cannot moderate group owners or administrators; Telegram will reject many such actions.
- `/warnings` checks the sender by default; reply to a member to check theirs.
- `/unban` requires the numeric Telegram user ID.
- If Railway PostgreSQL connection needs non-SSL, set `DATABASE_SSL=false` in Variables.
