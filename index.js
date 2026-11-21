require("dotenv").config();

const { Telegraf, Markup } = require("telegraf");
const {
  initDb, getSettings, setSetting, addWarning, getWarnings, clearWarnings, pool
} = require("./db");

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN is missing. Add your Telegram bot token in Railway Variables.");

const bot = new Telegraf(token);
const OWNER_ID = process.env.OWNER_ID ? Number(process.env.OWNER_ID) : null;
const FLOOD_LIMIT = Number(process.env.FLOOD_LIMIT || 6);
const FLOOD_WINDOW_MS = Number(process.env.FLOOD_WINDOW_MS || 7000);
const floodMap = new Map();

const HELP = `🛡️ YAPPING CLUB — MANAGEMENT

Member commands:
/start — Open bot menu
/help — Show commands
/rules — Group rules
/id — Show IDs
/info — Your information

Admin commands (reply to a member):
/ban [reason]
/unban <user_id>
/kick [reason]
/mute [minutes] [reason]
/unmute
/warn [reason]
/warnings
/clearwarnings
/purge — Delete replied message and up to 50 previous messages
/lock — Stop members sending messages
/unlock — Allow members to send messages
/setrules <text>
/antilink on|off
/antiflood on|off

The bot must be an administrator with the required permissions.`;

function isGroup(ctx) {
  return ctx.chat && ["group", "supergroup"].includes(ctx.chat.type);
}

async function isAdmin(ctx) {
  if (!isGroup(ctx)) return false;
  const id = ctx.from?.id;
  if (OWNER_ID && id === OWNER_ID) return true;
  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, id);
    return ["creator", "administrator"].includes(member.status);
  } catch {
    return false;
  }
}

async function requireAdmin(ctx) {
  if (!await isAdmin(ctx)) {
    await ctx.reply("⛔ Ye command sirf group admins use kar sakte hain.");
    return false;
  }
  return true;
}

function targetFromReply(ctx) {
  return ctx.message?.reply_to_message?.from;
}

function reasonFrom(ctx, fallback = "No reason provided") {
  const text = ctx.message?.text || "";
  const args = text.split(/\s+/).slice(1);
  return args.join(" ").trim() || fallback;
}

async function botCan(ctx, permission) {
  try {
    const me = await ctx.telegram.getMe();
    const member = await ctx.telegram.getChatMember(ctx.chat.id, me.id);
    return member.status === "creator" || (member.status === "administrator" && member[permission] === true);
  } catch {
    return false;
  }
}

bot.start(async (ctx) => {
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback("📋 Help", "menu_help"), Markup.button.callback("📜 Rules", "menu_rules")],
    [Markup.button.callback("ℹ️ About", "menu_about")]
  ]);
  await ctx.reply(
    "୨ৎ Welcome to Yapping Club Management Bot! 🪩\n\nI help admins keep the group organized. Add me to your group and promote me to admin with the permissions I need.\n\nUse /help to see commands.",
    keyboard
  );
});

bot.action("menu_help", (ctx) => ctx.answerCbQuery().then(() => ctx.reply(HELP)));
bot.action("menu_rules", (ctx) => ctx.answerCbQuery().then(() => ctx.reply("📜 Rules are available inside your group. Open the group and send /rules.")));
bot.action("menu_about", (ctx) => ctx.answerCbQuery().then(() => ctx.reply("🛡️ Yapping Club Bot\nA lightweight Telegram group management bot.")));

bot.command("help", (ctx) => ctx.reply(HELP));
bot.command("id", (ctx) => ctx.reply(`Your ID: ${ctx.from.id}\nChat ID: ${ctx.chat.id}`));
bot.command("rules", async (ctx) => {
  if (!isGroup(ctx)) return ctx.reply("Use /rules inside your group.");
  const settings = await getSettings(ctx.chat.id);
  return ctx.reply(`📜 Group Rules\n\n${settings.rules}`);
});
bot.command("info", (ctx) => {
  const u = ctx.from;
  return ctx.reply(`👤 User Info\nName: ${[u.first_name, u.last_name].filter(Boolean).join(" ")}\nUsername: ${u.username ? "@" + u.username : "Not set"}\nID: ${u.id}`);
});
bot.command("admins", async (ctx) => {
  if (!isGroup(ctx)) return ctx.reply("Use this command in a group.");
  const admins = await ctx.telegram.getChatAdministrators(ctx.chat.id);
  return ctx.reply("👮 Group Admins\n" + admins.map(a => `• ${a.user.first_name}${a.user.username ? " (@" + a.user.username + ")" : ""}`).join("\n"));
});

bot.on("new_chat_members", async (ctx) => {
  for (const member of ctx.message.new_chat_members) {
    if (member.is_bot) continue;
    await ctx.reply(`୨ৎ Welcome ${member.first_name} to Yapping Club! 🪩\n\nRead the group rules with /rules and enjoy the yapping. ♡`);
  }
});

bot.on("left_chat_member", async (ctx) => {
  const member = ctx.message.left_chat_member;
  if (member && !member.is_bot) await ctx.reply(`👋 ${member.first_name} has left the group. Take care!`);
});

bot.command("ban", async (ctx) => {
  if (!await requireAdmin(ctx)) return;
  const target = targetFromReply(ctx);
  if (!target) return ctx.reply("Reply to the member's message with /ban [reason].");
  try {
    await ctx.telegram.banChatMember(ctx.chat.id, target.id);
    await ctx.reply(`🔨 ${target.first_name} has been banned.\nReason: ${reasonFrom(ctx)}`);
  } catch { await ctx.reply("Couldn't ban this member. Check my admin permissions and target's admin status."); }
});

bot.command("kick", async (ctx) => {
  if (!await requireAdmin(ctx)) return;
  const target = targetFromReply(ctx);
  if (!target) return ctx.reply("Reply to a member's message with /kick.");
  try {
    await ctx.telegram.banChatMember(ctx.chat.id, target.id);
    await ctx.telegram.unbanChatMember(ctx.chat.id, target.id);
    await ctx.reply(`👢 ${target.first_name} has been removed.`);
  } catch { await ctx.reply("Couldn't kick this member. Check bot permissions."); }
});

bot.command("unban", async (ctx) => {
  if (!await requireAdmin(ctx)) return;
  const id = Number(ctx.message.text.split(/\s+/)[1]);
  if (!Number.isSafeInteger(id)) return ctx.reply("Usage: /unban USER_ID");
  try {
    await ctx.telegram.unbanChatMember(ctx.chat.id, id);
    await ctx.reply("✅ User unbanned.");
  } catch { await ctx.reply("Couldn't unban this user."); }
});

bot.command("mute", async (ctx) => {
  if (!await requireAdmin(ctx)) return;
  const target = targetFromReply(ctx);
  if (!target) return ctx.reply("Reply to a member's message with /mute [minutes].");
  const minutes = Math.max(1, Math.min(10080, Number(ctx.message.text.split(/\s+/)[1]) || 60));
  try {
    await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, {
      permissions: { can_send_messages: false, can_send_audios: false, can_send_documents: false,
        can_send_photos: false, can_send_videos: false, can_send_video_notes: false,
        can_send_voice_notes: false, can_send_polls: false, can_send_other_messages: false,
        can_add_web_page_previews: false },
      until_date: Math.floor(Date.now() / 1000) + minutes * 60
    });
    await ctx.reply(`🔇 ${target.first_name} muted for ${minutes} minute(s).`);
  } catch { await ctx.reply("Couldn't mute this member. Check bot permissions."); }
});

bot.command("unmute", async (ctx) => {
  if (!await requireAdmin(ctx)) return;
  const target = targetFromReply(ctx);
  if (!target) return ctx.reply("Reply to a muted member's message with /unmute.");
  try {
    await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, {
      permissions: { can_send_messages: true, can_send_audios: true, can_send_documents: true,
        can_send_photos: true, can_send_videos: true, can_send_video_notes: true,
        can_send_voice_notes: true, can_send_polls: true, can_send_other_messages: true,
        can_add_web_page_previews: true }
    });
    await ctx.reply(`🔊 ${target.first_name} can speak again.`);
  } catch { await ctx.reply("Couldn't unmute this member."); }
});

bot.command("warn", async (ctx) => {
  if (!await requireAdmin(ctx)) return;
  const target = targetFromReply(ctx);
  if (!target || target.is_bot) return ctx.reply("Reply to a member's message with /warn [reason].");
  const count = await addWarning(ctx.chat.id, target.id, ctx.from.id, reasonFrom(ctx));
  if (count >= 3) {
    try {
      await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, {
        permissions: { can_send_messages: false }, until_date: Math.floor(Date.now() / 1000) + 3600
      });
      await ctx.reply(`⚠️ ${target.first_name} has ${count} warnings and was muted for 1 hour.`);
    } catch {
      await ctx.reply(`⚠️ ${target.first_name} now has ${count} warnings. Automatic mute failed; check bot permissions.`);
    }
  } else {
    await ctx.reply(`⚠️ Warning ${count}/3 for ${target.first_name}.\nReason: ${reasonFrom(ctx)}`);
  }
});

bot.command("warnings", async (ctx) => {
  const target = targetFromReply(ctx) || ctx.from;
  const count = await getWarnings(ctx.chat.id, target.id);
  return ctx.reply(`⚠️ ${target.first_name || "User"} has ${count} warning(s).`);
});

bot.command("clearwarnings", async (ctx) => {
  if (!await requireAdmin(ctx)) return;
  const target = targetFromReply(ctx);
  if (!target) return ctx.reply("Reply to a member's message with /clearwarnings.");
  await clearWarnings(ctx.chat.id, target.id);
  return ctx.reply(`✅ Warnings cleared for ${target.first_name}.`);
});

bot.command("setrules", async (ctx) => {
  if (!await requireAdmin(ctx)) return;
  const rules = ctx.message.text.split(/\s+/).slice(1).join(" ").trim();
  if (!rules) return ctx.reply("Usage: /setrules Write your group rules here");
  await setSetting(ctx.chat.id, "rules", rules);
  return ctx.reply("✅ Group rules updated.");
});

bot.command("antilink", async (ctx) => {
  if (!await requireAdmin(ctx)) return;
  const value = ctx.message.text.split(/\s+/)[1]?.toLowerCase();
  if (!["on", "off"].includes(value)) return ctx.reply("Usage: /antilink on OR /antilink off");
  await setSetting(ctx.chat.id, "antilink", value === "on");
  return ctx.reply(`✅ Anti-link ${value}.`);
});

bot.command("antiflood", async (ctx) => {
  if (!await requireAdmin(ctx)) return;
  const value = ctx.message.text.split(/\s+/)[1]?.toLowerCase();
  if (!["on", "off"].includes(value)) return ctx.reply("Usage: /antiflood on OR /antiflood off");
  await setSetting(ctx.chat.id, "antiflood", value === "on");
  return ctx.reply(`✅ Anti-flood ${value}.`);
});

bot.command("lock", async (ctx) => {
  if (!await requireAdmin(ctx)) return;
  try {
    await ctx.telegram.setChatPermissions(ctx.chat.id, { can_send_messages: false });
    return ctx.reply("🔒 Group locked for regular members.");
  } catch { return ctx.reply("Couldn't lock the group. Check my admin permissions."); }
});

bot.command("unlock", async (ctx) => {
  if (!await requireAdmin(ctx)) return;
  try {
    await ctx.telegram.setChatPermissions(ctx.chat.id, {
      can_send_messages: true, can_send_audios: true, can_send_documents: true,
      can_send_photos: true, can_send_videos: true, can_send_video_notes: true,
      can_send_voice_notes: true, can_send_polls: true, can_send_other_messages: true,
      can_add_web_page_previews: true
    });
    return ctx.reply("🔓 Group unlocked.");
  } catch { return ctx.reply("Couldn't unlock the group. Check my admin permissions."); }
});

bot.command("purge", async (ctx) => {
  if (!await requireAdmin(ctx)) return;
  const replied = ctx.message.reply_to_message;
  if (!replied) return ctx.reply("Reply to the first message to delete, then send /purge. Deletes up to 50 messages.");
  const start = replied.message_id;
  const end = ctx.message.message_id;
  let deleted = 0;
  for (let id = start; id <= end && deleted < 50; id++) {
    try { await ctx.telegram.deleteMessage(ctx.chat.id, id); deleted++; } catch {}
  }
  return ctx.reply(`🧹 Purge finished. Deleted ${deleted} message(s).`);
});

// Lightweight anti-flood and optional anti-link checks.
bot.on("text", async (ctx, next) => {
  if (!isGroup(ctx) || ctx.from?.is_bot || await isAdmin(ctx)) return next();
  const settings = await getSettings(ctx.chat.id);
  const text = ctx.message.text || "";

  if (settings.antilink && /(https?:\/\/|t\.me\/|www\.)/i.test(text)) {
    try { await ctx.deleteMessage(); } catch {}
    return;
  }

  if (settings.antiflood) {
    const key = `${ctx.chat.id}:${ctx.from.id}`;
    const now = Date.now();
    const recent = (floodMap.get(key) || []).filter(t => now - t < FLOOD_WINDOW_MS);
    recent.push(now);
    floodMap.set(key, recent);
    if (recent.length > FLOOD_LIMIT) {
      try { await ctx.deleteMessage(); } catch {}
      return;
    }
  }
  return next();
});

bot.catch((err, ctx) => {
  console.error("Bot error:", err);
});

(async () => {
  await initDb();
  await bot.launch();
  console.log("Yapping Club Bot is running.");
})().catch(err => {
  console.error("Startup failed:", err);
  process.exit(1);
});

process.once("SIGINT", () => { bot.stop("SIGINT"); pool.end(); });
process.once("SIGTERM", () => { bot.stop("SIGTERM"); pool.end(); });
