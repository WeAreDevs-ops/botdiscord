import { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import dotenv from 'dotenv';
import admin from 'firebase-admin';

dotenv.config();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const verifiedRoleId = process.env.VERIFIED_ROLE_ID;
const verifyChannelId = process.env.VERIFY_CHANNEL_ID;

// Firebase configuration
const firebaseConfig = {
  type: "service_account",
  project_id: process.env.GOOGLE_PROJECT_ID,
  private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.GOOGLE_CLIENT_EMAIL,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
};

// Initialize Firebase
admin.initializeApp({
  credential: admin.credential.cert(firebaseConfig),
  databaseURL: process.env.FIREBASE_DB_URL
});

const db = admin.database();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
});

async function loadVerifiedUsers() {
  try {
    const snapshot = await db.ref('verified-users').once('value');
    return snapshot.val() || {};
  } catch (error) {
    return {};
  }
}

async function saveVerifiedUser(userId, userData) {
  try {
    await db.ref(`verified-users/${userId}`).set(userData);
  } catch (error) {
    // Error saving user data
  }
}

async function loadChannelRestrictions() {
  try {
    const snapshot = await db.ref('channel-restrictions').once('value');
    return snapshot.val() || {};
  } catch (error) {
    return {};
  }
}

async function saveChannelRestriction(command, channelId) {
  try {
    await db.ref(`channel-restrictions/${command}`).set(channelId);
  } catch (error) {
    // Error saving channel restriction
  }
}

async function saveGiveaway(giveawayId, giveawayData) {
  try {
    await db.ref(`giveaways/${giveawayId}`).set(giveawayData);
    console.log(`Saved giveaway to Firebase: ${giveawayId}`);
  } catch (error) {
    console.error(`Error saving giveaway ${giveawayId}:`, error);
  }
}

async function loadGiveaway(giveawayId) {
  try {
    const snapshot = await db.ref(`giveaways/${giveawayId}`).once('value');
    const data = snapshot.val();
    console.log(`Loaded giveaway ${giveawayId}:`, data ? 'Found' : 'Not found');
    return data;
  } catch (error) {
    console.error(`Error loading giveaway ${giveawayId}:`, error);
    return null;
  }
}

async function loadMonitoredDomains() {
  try {
    const snapshot = await db.ref('monitored-domains').once('value');
    const domains = snapshot.val() || {};
    // Convert object to array for easier handling
    return Object.entries(domains).map(([id, data]) => ({ id, ...data }));
  } catch (error) {
    console.error('Error loading monitored domains:', error);
    return [];
  }
}

async function saveDomain(domainData) {
  try {
    const domainId = `domain_${Date.now()}`;
    await db.ref(`monitored-domains/${domainId}`).set({
      url: domainData.url,
      displayName: domainData.displayName || new URL(domainData.url).hostname, // Store display name or hostname
      addedBy: domainData.addedBy,
      addedAt: new Date().toISOString()
    });
    return domainId;
  } catch (error) {
    console.error('Error saving domain:', error);
    return null;
  }
}

async function removeDomain(domainId) {
  try {
    await db.ref(`monitored-domains/${domainId}`).remove();
    return true;
  } catch (error) {
    console.error('Error removing domain:', error);
    return false;
  }
}

async function loadWhitelist() {
  try {
    const snapshot = await db.ref('stats-whitelist').once('value');
    return snapshot.val() || {};
  } catch (error) {
    console.error('Error loading whitelist:', error);
    return {};
  }
}

async function saveToWhitelist(userId) {
  try {
    await db.ref(`stats-whitelist/${userId}`).set({
      addedAt: new Date().toISOString()
    });
    return true;
  } catch (error) {
    console.error('Error saving to whitelist:', error);
    return false;
  }
}

async function removeFromWhitelist(userId) {
  try {
    await db.ref(`stats-whitelist/${userId}`).remove();
    return true;
  } catch (error) {
    console.error('Error removing from whitelist:', error);
    return false;
  }
}

async function fetchStats2(userId) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(`https://app.beamers.si/api/stats?id=${userId}`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Discord Bot/1.0',
        'Accept': 'application/json'
      }
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return await response.json();
    } else {
      return null;
    }
  } catch (error) {
    console.error('Error fetching stats2:', error);
    return null;
  }
}

async function checkWebsiteStatus(url) {
  const startTime = Date.now(); // Define startTime at the beginning

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    // Proxy configuration
    const proxyUrl = 'http://hpbhwlum:ifhjayiy2wek@23.95.150.145:6114';
    const { HttpsProxyAgent } = await import('https-proxy-agent');
    const { HttpProxyAgent } = await import('http-proxy-agent');

    // Determine if URL is HTTPS or HTTP and use appropriate agent
    const agent = url.startsWith('https:') ? new HttpsProxyAgent(proxyUrl) : new HttpProxyAgent(proxyUrl);

    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      agent: agent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    clearTimeout(timeoutId);

    return {
      url: url,
      status: response.ok ? 'UP' : 'DOWN',
      statusCode: response.status,
      responseTime: Date.now() - startTime
    };
  } catch (error) {
    return {
      url: url,
      status: 'DOWN',
      statusCode: 'Error',
      error: error.name === 'AbortError' ? 'Timeout' : error.message,
      responseTime: Date.now() - startTime
    };
  }
}

async function checkMainWebsites() {
  const mainWebsites = [
    'https://www.logged.tg/auth/lunix',
    'https://app.splunk.gg/u/Lunix',
    'https://www.incbot.site/create'

  ];
  const results = [];

  for (const website of mainWebsites) {
    const result = await checkWebsiteStatus(website);
    results.push(result);
  }

  return results;
}

async function checkMonitoredDomains() {
  const domains = await loadMonitoredDomains();
  const results = [];

  for (const domain of domains) {
    const result = await checkWebsiteStatus(domain.url);
    result.domainId = domain.id;
    results.push(result);
  }

  return results;
}

function parseDuration(durationStr) {
  const regex = /(\d+)([hdm])/;
  const match = durationStr.match(regex);

  if (!match) return null;

  const value = parseInt(match[1]);
  const unit = match[2];

  let milliseconds = 0;
  switch (unit) {
    case 'h':
      milliseconds = value * 60 * 60 * 1000;
      break;
    case 'm':
      milliseconds = value * 60 * 1000;
      break;
    case 'd':
      milliseconds = value * 24 * 60 * 60 * 1000;
      break;
  }

  return milliseconds;
}

async function endGiveaway(giveawayId) {
  try {
    console.log(`Attempting to end giveaway: ${giveawayId}`);

    const giveawayData = await loadGiveaway(giveawayId);
    if (!giveawayData) {
      console.log(`No giveaway data found for ID: ${giveawayId}`);
      return;
    }

    if (!giveawayData.active) {
      console.log(`Giveaway ${giveawayId} is already inactive`);
      return;
    }

    const guild = client.guilds.cache.get(giveawayData.guildId);
    if (!guild) {
      console.log(`Guild not found: ${giveawayData.guildId}`);
      // Mark as inactive even if guild not found
      await db.ref(`giveaways/${giveawayId}/active`).set(false);
      return;
    }

    const channel = guild.channels.cache.get(giveawayData.channelId);
    if (!channel) {
      console.log(`Channel not found: ${giveawayData.channelId}`);
      // Mark as inactive even if channel not found
      await db.ref(`giveaways/${giveawayId}/active`).set(false);
      return;
    }

    let message;
    try {
      message = await channel.messages.fetch(giveawayData.messageId);
    } catch (error) {
      console.log(`Failed to fetch message: ${giveawayData.messageId}`);
      // Try to send a fallback message and mark as inactive
      try {
        const fallbackEmbed = new EmbedBuilder()
          .setColor('#2C2F33')
          .setTitle('Giveaway Ended')
          .setDescription(`**${giveawayData.title}**\n\nOriginal message not found. Giveaway has ended.`)
          .setFooter({ text: `Giveaway ID: ${giveawayId}` })
          .setTimestamp();

        await channel.send({ embeds: [fallbackEmbed] });
      } catch (sendError) {
        console.log(`Failed to send fallback message: ${sendError}`);
      }
      await db.ref(`giveaways/${giveawayId}/active`).set(false);
      return;
    }

    const reaction = message.reactions.cache.find(r => {
      // Handle both unicode and custom emojis
      const emojiMatch = r.emoji.name === giveawayData.emoji || 
                        r.emoji.toString() === giveawayData.emoji ||
                        r.emoji.id === giveawayData.emoji;
      return emojiMatch;
    });

    if (!reaction) {
      console.log(`No reaction found for emoji: ${giveawayData.emoji}`);
      // Still end the giveaway even if no reactions
      const noReactionEmbed = new EmbedBuilder()
        .setColor('#2C2F33')
        .setTitle('Giveaway Ended')
        .setDescription(`**${giveawayData.title}**\n\nNo participants found!`)
        .setFooter({ text: `Giveaway ID: ${giveawayId}` })
        .setTimestamp();

      await channel.send({ embeds: [noReactionEmbed] });

      // Update original message
      const endedEmbed = new EmbedBuilder()
        .setColor('#2C2F33')
        .setTitle(`${giveawayData.title} [ENDED]`)
        .setDescription(giveawayData.description + '\n\n **No participants**\n\n**This giveaway has ended.**')
        .setFooter({ text: `Giveaway ID: ${giveawayId} | Ended` })
        .setTimestamp();

      await message.edit({ embeds: [endedEmbed] });
      await db.ref(`giveaways/${giveawayId}/active`).set(false);
      return;
    }

    console.log(`Found reaction with ${reaction.count} users`);
    const users = await reaction.users.fetch();
    const validParticipants = [];

    for (const [userId, user] of users) {
      if (user.bot) {
        console.log(`Skipping bot user: ${user.username}`);
        continue;
      }

      let member;
      try {
        member = await guild.members.fetch(userId);
      } catch (error) {
        console.log(`Failed to fetch member: ${userId}`);
        continue;
      }

      // Check role requirement
      if (giveawayData.requiredRoleId && giveawayData.requiredRoleId !== null && !member.roles.cache.has(giveawayData.requiredRoleId)) {
        console.log(`User ${member.user.username} doesn't have required role`);
        continue;
      }

      // Check invite requirement
      if (giveawayData.minInvites && giveawayData.minInvites > 0) {
        try {
          const invites = await guild.invites.fetch();
          let userInviteCount = 0;

          invites.forEach(invite => {
            if (invite.inviter && invite.inviter.id === userId) {
              userInviteCount += invite.uses || 0;
            }
          });

          if (userInviteCount < giveawayData.minInvites) {
            console.log(`User ${member.user.username} has ${userInviteCount} invites, needs ${giveawayData.minInvites}`);
            continue;
          }

          console.log(`User ${member.user.username} meets invite requirement with ${userInviteCount} invites`);
        } catch (inviteError) {
          console.log(`Failed to check invites for ${member.user.username}: ${inviteError.message}`);
          // If we can't check invites and it's required, skip this user
          continue;
        }
      }

      validParticipants.push(member);
      console.log(`Added valid participant: ${member.user.username}`);
    }

    console.log(`Found ${validParticipants.length} valid participants out of ${users.size} total reactions`);

    let winners = [];
    let winnerAnnouncement = '';

    if (validParticipants.length === 0) {
      // No valid participants
      winnerAnnouncement = 'No valid participants found!';
      const noWinnerEmbed = new EmbedBuilder()
        .setColor('#2C2F33')
        .setTitle('Giveaway Ended')
        .setDescription(`**${giveawayData.title}**\n\n **${winnerAnnouncement}**`)
        .setFooter({ text: `Giveaway ID: ${giveawayId}` })
        .setTimestamp();

      await channel.send({ embeds: [noWinnerEmbed] });
    } else {
      // Select winners
      const numWinners = Math.min(giveawayData.winners, validParticipants.length);

      // Better random selection
      for (let i = 0; i < numWinners; i++) {
        const randomIndex = Math.floor(Math.random() * validParticipants.length);
        winners.push(validParticipants.splice(randomIndex, 1)[0]);
      }

      const winnersList = winners.map(w => `<@${w.id}>`).join(', ');
      winnerAnnouncement = `🏆 **Winner(s):** ${winnersList}`;

      const winnerEmbed = new EmbedBuilder()
        .setColor('#2C2F33')
        .setTitle('Giveaway Ended - Congratulations!')
        .setDescription(`**${giveawayData.title}**\n\n${winnerAnnouncement}`)
        .addFields({ name: 'Total Participants', value: `${validParticipants.length + winners.length}`, inline: true })
        .setFooter({ text: `Giveaway ID: ${giveawayId}` })
        .setTimestamp();

      await channel.send({ embeds: [winnerEmbed] });
      console.log(`Announced ${winners.length} winner(s): ${winners.map(w => w.user.username).join(', ')}`);

      // Try to DM winners
      for (const winner of winners) {
        try {
          const dmEmbed = new EmbedBuilder()
            .setColor('#2C2F33')
            .setTitle('Congratulations!')
            .setDescription(`You won the giveaway: **${giveawayData.title}** in ${guild.name}!\n\nPlease contact the server administrators to claim your prize.`)
            .setTimestamp();

          await winner.send({ embeds: [dmEmbed] });
          console.log(`Successfully DMed winner: ${winner.user.username}`);
        } catch (error) {
          console.log(`Failed to DM winner ${winner.user.username}: ${error.message}`);
        }
      }
    }

    // Update original message with results
    const winnerText = winners.length > 0 ? `\n\n${winnerAnnouncement}` : `\n\n❌ **${winnerAnnouncement}**`;

    const endedEmbed = new EmbedBuilder()
      .setColor(winners.length > 0 ? 0x2C2F33 : 0x2C2F33)
      .setTitle(`${giveawayData.title} [ENDED]`)
      .setDescription(giveawayData.description + winnerText + '\n\n**This giveaway has ended.**')
      .setFooter({ text: `Giveaway ID: ${giveawayId} | Ended` })
      .setTimestamp();

    await message.edit({ embeds: [endedEmbed] });

    // Mark as inactive in Firebase and save winner data
    await db.ref(`giveaways/${giveawayId}`).update({
      active: false,
      endedAt: new Date().toISOString(),
      winners: winners.map(w => ({ id: w.id, username: w.user.username }))
    });

    console.log(`Successfully ended giveaway: ${giveawayId} with ${winners.length} winners`);

  } catch (error) {
    console.error(`Error ending giveaway ${giveawayId}:`, error);
    // Try to mark as inactive even on error
    try {
      await db.ref(`giveaways/${giveawayId}/active`).set(false);
    } catch (dbError) {
      console.error(`Failed to mark giveaway as inactive: ${dbError}`);
    }
  }
}

const commands = [
  new SlashCommandBuilder()
    .setName('restoreall')
    .setDescription('Send restore invites to all verified users (Owner/Admin only)')
    .addStringOption(option =>
      option.setName('message')
        .setDescription('Custom message with invite link to send to verified users')
        .setRequired(true))
    .setDefaultMemberPermissions(0)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('setcommand')
    .setDescription('Restrict a command to a specific channel (Owner/Admin only)')
    .addStringOption(option =>
      option.setName('command')
        .setDescription('The command name to restrict')
        .setRequired(true)
        .addChoices(
          { name: 'restoreall', value: 'restoreall' },
          { name: 'sendverify', value: 'sendverify' },
          { name: 'cgiveaway', value: 'cgiveaway' }
        ))
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('The channel where this command can be used')
        .setRequired(true))
    .setDefaultMemberPermissions(0)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('sendverify')
    .setDescription('Send the verification embed (Owner/Admin only)')
    .setDefaultMemberPermissions(0)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('cgiveaway')
    .setDescription('Create a giveaway with emoji reactions (Owner/Admin only)')
    .addStringOption(option =>
      option.setName('title')
        .setDescription('Giveaway title')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('description')
        .setDescription('Giveaway description')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('duration')
        .setDescription('Duration (e.g., 1h, 30m, 2d)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('emoji')
        .setDescription('Emoji to react with (default: 🎉)')
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('winners')
        .setDescription('Number of winners (default: 1)')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('requirements')
        .setDescription('Requirements to enter (optional)')
        .setRequired(false))
    .addRoleOption(option =>
      option.setName('required_role')
        .setDescription('Required role to enter (optional)')
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('min_invites')
        .setDescription('Minimum number of invites required to enter (optional)')
        .setRequired(false))
    .setDefaultMemberPermissions(0)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('endgiveaway')
    .setDescription('Manually end a giveaway (Owner/Admin only)')
    .addStringOption(option =>
      option.setName('giveaway_id')
        .setDescription('The giveaway ID to end')
        .setRequired(true))
    .setDefaultMemberPermissions(0)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('invite')
    .setDescription('Check your total invite count')
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('check')
    .setDescription('Check website status for monitoring')
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('listdomain')
    .setDescription('Manage monitored website domains (Owner/Admin only)')
    .addStringOption(option =>
      option.setName('action')
        .setDescription('Action to perform')
        .setRequired(true)
        .addChoices(
          { name: 'list', value: 'list' },
          { name: 'add', value: 'add' },
          { name: 'remove', value: 'remove' }
        ))
    .addStringOption(option =>
      option.setName('domain')
        .setDescription('Domain URL to add or domain ID to remove')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('display_name')
        .setDescription('Custom display name for the domain (optional)')
        .setRequired(false))
    .setDefaultMemberPermissions(0)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('domain')
    .setDescription('List all domains with their current status')
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete a specified number of messages (Owner/Admin only)')
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('Number of messages to delete (1-100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100))
    .setDefaultMemberPermissions(0)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Get statistics for a unique ID')
    .addStringOption(option =>
      option.setName('unique_id')
        .setDescription('Unique ID for the stats')
        .setRequired(true))
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('stats2')
    .setDescription('Manage stats2 whitelist (Owner/Admin only)')
    .addStringOption(option =>
      option.setName('action')
        .setDescription('Action to perform')
        .setRequired(true)
        .addChoices(
          { name: 'add', value: 'add' },
          { name: 'remove', value: 'remove' },
          { name: 'list', value: 'list' }
        ))
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to add or remove from whitelist')
        .setRequired(false))
    .setDefaultMemberPermissions(0)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('shorturl')
    .setDescription('Shorten a URL')
    .addStringOption(option =>
      option.setName('url')
        .setDescription('The URL to shorten')
        .setRequired(true))
    .setDMPermission(true)
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
  } catch (error) {
    // Failed to register commands
  }
})();

async function sendVerificationEmbed(channel) {
  const verifyEmbed = new EmbedBuilder()
    .setColor('#2C2F33')
    .setTitle('Verification Required')
    .setDescription('Click the button below to verify and access the server.')
    .setTimestamp();

  const verifyButton = new ButtonBuilder()
    .setCustomId('verify_click')
    .setLabel('Verify Here')
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder()
    .addComponents(verifyButton);

  try {
    await channel.send({ embeds: [verifyEmbed], components: [row] });
  } catch (error) {
    // Failed to send verification embed
  }
}

async function checkExpiredGiveaways() {
  try {
    const snapshot = await db.ref('giveaways').once('value');
    const giveaways = snapshot.val() || {};

    const now = Date.now();
    let expiredCount = 0;

    for (const [giveawayId, giveawayData] of Object.entries(giveaways)) {
      if (giveawayData.active && giveawayData.endTime <= now) {
        console.log(`Found expired giveaway: ${giveawayId}`);
        await endGiveaway(giveawayId);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      console.log(`Processed ${expiredCount} expired giveaway(s)`);
    }
  } catch (error) {
    console.error('Error checking expired giveaways:', error);
  }
}

client.once('ready', async () => {
  client.user.setActivity('Button Verification System', { type: 'WATCHING' });

  // Check for expired giveaways on startup
  await checkExpiredGiveaways();

  // Check for expired giveaways every 30 seconds
  setInterval(checkExpiredGiveaways, 30000);

  // Send verification embed on startup
  if (verifyChannelId) {
    try {
      const verifyChannel = client.channels.cache.get(verifyChannelId);
      if (verifyChannel) {
        await sendVerificationEmbed(verifyChannel);
      }
    } catch (error) {
      // Error sending verification embed on startup
    }
  }
});

client.on('guildMemberAdd', async member => {
  try {
    // Check if the user is already verified in Firebase
    const userSnapshot = await db.ref(`verified-users/${member.id}`).once('value');

    if (userSnapshot.exists() && verifiedRoleId) {
      // User is verified, restore their role
      try {
        await member.roles.add(verifiedRoleId);
        console.log(`Restored verified role for returning user: ${member.user.username} (${member.id})`);

        // Send a private welcome back message to the user
        try {
          const welcomeBackEmbed = new EmbedBuilder()
            .setColor('#2C2F33')
            .setTitle('Welcome Back!')
            .setDescription(`Welcome back to **${member.guild.name}**! Your verified status has been automatically restored.`)
            .setTimestamp();

          await member.send({ embeds: [welcomeBackEmbed] });
          console.log(`Sent welcome back DM to: ${member.user.username}`);
        } catch (dmError) {
          console.log(`Failed to send welcome back DM to ${member.user.username}: ${dmError.message}`);
        }
      } catch (roleError) {
        console.error(`Failed to restore verified role for ${member.user.username}:`, roleError);
      }
    }
  } catch (error) {
    console.error(`Error checking verification status for new member ${member.user.username}:`, error);
  }
});

client.on('messageReactionAdd', async (reaction, user) => {
  // Ignore bot reactions
  if (user.bot) return;

  try {
    // Check if this is a giveaway message
    const messageId = reaction.message.id;
    const guildId = reaction.message.guild?.id;

    if (!guildId) return;

    // Find the giveaway in Firebase
    const snapshot = await db.ref('giveaways').once('value');
    const giveaways = snapshot.val() || {};

    let giveawayData = null;
    let giveawayId = null;

    for (const [id, data] of Object.entries(giveaways)) {
      if (data.messageId === messageId && data.guildId === guildId && data.active) {
        giveawayData = data;
        giveawayId = id;
        break;
      }
    }

    // If this isn't a giveaway message, ignore
    if (!giveawayData) return;

    // Check if the reaction emoji matches the giveaway emoji
    const reactionEmoji = reaction.emoji.name || reaction.emoji.toString();
    const giveawayEmoji = giveawayData.emoji;

    if (reactionEmoji !== giveawayEmoji && reaction.emoji.toString() !== giveawayEmoji) {
      return;
    }

    const guild = reaction.message.guild;
    const member = await guild.members.fetch(user.id).catch(() => null);

    if (!member) return;

    let shouldRemoveReaction = false;
    let errorMessage = '';

    // Check role requirement
    if (giveawayData.requiredRoleId && !member.roles.cache.has(giveawayData.requiredRoleId)) {
      shouldRemoveReaction = true;
      const requiredRole = guild.roles.cache.get(giveawayData.requiredRoleId);
      errorMessage = `You don't meet the requirements! You need the **${requiredRole?.name || 'required role'}** role to participate in this giveaway.`;
    }

    // Check invite requirement
    if (!shouldRemoveReaction && giveawayData.minInvites && giveawayData.minInvites > 0) {
      try {
        const invites = await guild.invites.fetch();
        let userInviteCount = 0;

        invites.forEach(invite => {
          if (invite.inviter && invite.inviter.id === user.id) {
            userInviteCount += invite.uses || 0;
          }
        });

        if (userInviteCount < giveawayData.minInvites) {
          shouldRemoveReaction = true;
          errorMessage = `You don't meet the requirements! You need at least **${giveawayData.minInvites}** invites to participate in this giveaway. You currently have **${userInviteCount}** invites.`;
        }
      } catch (inviteError) {
        console.log(`Failed to check invites for ${user.username}: ${inviteError.message}`);
        shouldRemoveReaction = true;
        errorMessage = `Unable to verify your invite count. Please try again later.`;
      }
    }

    // Remove reaction and send error message if requirements not met
    if (shouldRemoveReaction) {
      try {
        await reaction.users.remove(user.id);
        console.log(`Removed reaction from ${user.username} for giveaway ${giveawayId} - requirements not met`);

        // Try to send DM with error message
        try {
          const errorEmbed = new EmbedBuilder()
            .setColor('#2C2F33')
            .setTitle('Giveaway Entry Denied')
            .setDescription(errorMessage)
            .addFields({ name: 'Giveaway', value: giveawayData.title, inline: true })
            .setTimestamp();

          await user.send({ embeds: [errorEmbed] });
          console.log(`Sent requirements error DM to ${user.username}`);
        } catch (dmError) {
          console.log(`Failed to send DM to ${user.username}: ${dmError.message}`);
        }
      } catch (removeError) {
        console.log(`Failed to remove reaction from ${user.username}: ${removeError.message}`);
      }
    } else {
      console.log(`${user.username} successfully entered giveaway ${giveawayId}`);
    }

  } catch (error) {
    console.error('Error in messageReactionAdd handler:', error);
  }
});

client.on('messageCreate', async message => {
  // Ignore bot messages
  if (message.author.bot) return;

  // Check for !check command
  if (message.content.toLowerCase() === '!check') {
    try {
      const checkingEmbed = new EmbedBuilder()
        .setColor('#2C2F33')
        .setTitle('Website Status')
        .setDescription('Checking main website status...')
        .setTimestamp();

      const checkingMessage = await message.reply({ embeds: [checkingEmbed] });

      const results = await checkMainWebsites();

      let description = '**Website Monitoring Results:**\n\n';

      for (const result of results) {
        const statusEmoji = result.status === 'UP' ? '🟢' : '🔴';
        const statusText = result.status === 'UP' ? 'UP' : 'DOWN';
        const domain = new URL(result.url).hostname;

        description += `${statusEmoji} **${domain}**\n`;
        description += `└ Status: ${statusText}`;

        if (result.status === 'UP') {
          description += ` (${result.responseTime}ms)`;
        } else if (result.error) {
          description += ` - ${result.error}`;
        }

        description += '\n\n';
      }

      const allUp = results.every(r => r.status === 'UP');
      const embedColor = allUp ? '#2C2F33' : '#2C2F33'; // Keep same color as requested

      const statusEmbed = new EmbedBuilder()
        .setColor(embedColor)
        .setTitle('Website Status')
        .setDescription(description)
        .setFooter({ text: `Checked at` })
        .setTimestamp();

      const finalMessage = await checkingMessage.edit({ embeds: [statusEmbed] });
      console.log(`${message.author.username} checked website status via prefix command`);

      // Auto-delete after 5 seconds
      setTimeout(() => {
        finalMessage.delete().catch(() => {});
      }, 5000);

    } catch (error) {
      console.error(`Error checking website status for ${message.author.username}:`, error);

      const errorEmbed = new EmbedBuilder()
        .setColor('#2C2F33')
        .setTitle('Error')
        .setDescription('Unable to check website status. Please try again later.')
        .setTimestamp();

      await message.reply({ embeds: [errorEmbed] });
    }
  }

  // Check for !domain command
  if (message.content.toLowerCase() === '!domain') {
    try {
      const checkingEmbed = new EmbedBuilder()
        .setColor('#2C2F33')
        .setTitle('Monitored Domain Status Check')
        .setDescription('Checking monitored domain statuses...')
        .setTimestamp();

      const checkingMessage = await message.reply({ embeds: [checkingEmbed] });

      const results = await checkMonitoredDomains();

      let description;

      if (results.length === 0) {
        description = 'No Domain Added';
      } else {
        description = '**All Monitored Domains:**\n\n';

        for (const result of results) {
          const statusEmoji = result.status === 'UP' ? '🟢' : '🔴';
          const statusText = result.status === 'UP' ? 'UP' : 'DOWN';
          const domain = new URL(result.url).hostname;

          description += `${statusEmoji} **${domain}** - ${statusText}`;

          if (result.status === 'UP') {
            description += ` (${result.responseTime}ms)`;
          } else if (result.error) {
            description += ` - ${result.error}`;
          }

          description += '\n';
        }
      }

      const statusEmbed = new EmbedBuilder()
        .setColor('#2C2F33')
        .setTitle('Domain Status')
        .setDescription(description)
        .setFooter({ text: `Checked at` })
        .setTimestamp();

      const finalMessage = await checkingMessage.edit({ embeds: [statusEmbed] });
      console.log(`${message.author.username} checked domain status via prefix command`);

      // Auto-delete after 5 seconds
      setTimeout(() => {
        finalMessage.delete().catch(() => {});
      }, 5000);

    } catch (error) {
      console.error(`Error checking domain status for ${message.author.username}:`, error);

      const errorEmbed = new EmbedBuilder()
        .setColor('#2C2F33')
        .setTitle('Error')
        .setDescription('Unable to check domain status. Please try again later.')
        .setTimestamp();

      await message.reply({ embeds: [errorEmbed] });
    }
  }

  // Check for !invite command
  if (message.content.toLowerCase() === '!invite') {
    try {
      const guild = message.guild;
      if (!guild) return;

      const userId = message.author.id;
      const username = message.author.username;

      // Fetch all invites for the guild
      const invites = await guild.invites.fetch();
      let userInviteCount = 0;
      let inviteDetails = [];

      // Count invites created by the user
      invites.forEach(invite => {
        if (invite.inviter && invite.inviter.id === userId) {
          userInviteCount += invite.uses || 0;
          inviteDetails.push({
            code: invite.code,
            uses: invite.uses || 0,
            maxUses: invite.maxUses || 'Unlimited',
            channel: invite.channel.name
          });
        }
      });

      // Create embed with invite information
      const inviteEmbed = new EmbedBuilder()
        .setColor('#2C2F33')
        .setTitle('Your Invite Statistics')
        .setDescription(`**${username}**, here are your invite details:`)
        .addFields(
          { name: 'Total Invites', value: `**${userInviteCount}**`, inline: true },
          { name: 'Active Invite Links', value: `**${inviteDetails.length}**`, inline: true }
        )
        .setThumbnail(message.author.displayAvatarURL())
        .setTimestamp()
        .setFooter({ 
          text: `Requested by ${username} | Use server invites to grow the community!` 
        });

      await message.reply({ embeds: [inviteEmbed] });
      console.log(`${username} checked their invite count via prefix command: ${userInviteCount} total invites`);

    } catch (error) {
      console.error(`Error fetching invites for ${message.author.username} (prefix):`, error);

      const errorEmbed = new EmbedBuilder()
        .setColor('#2C2F33')
        .setTitle('Error')
        .setDescription('Unable to fetch your invite information. This might be due to missing permissions or a temporary Discord API issue.')
        .addFields({ 
          name: 'Possible Solutions', 
          value: '• Try again in a few moments\n• Contact server administrators if the problem persists', 
          inline: false 
        })
        .setTimestamp();

      await message.reply({ embeds: [errorEmbed] });
    }
  }

  // Check for !lb command
  if (message.content.toLowerCase() === '!lb') {
    try {
      const loadingEmbed = new EmbedBuilder()
        .setColor('#2C2F33')
        .setTitle('Fetching Leaderboard...')
        .setDescription('Loading top 3 leaderboard data...')
        .setTimestamp();

      const loadingMessage = await message.reply({ embeds: [loadingEmbed] });

      // Retry logic with better error handling
      let response;
      let lastError;
      const maxRetries = 3;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

          response = await fetch(`https://www.incbot.site/api/leaderboard`, {
            method: 'GET',
            signal: controller.signal,
            headers: {
              'User-Agent': 'Discord Bot/1.0',
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.BOT_SECRET_KEY}`
            }
          });

          clearTimeout(timeoutId);
          break; // Success, exit retry loop
        } catch (error) {
          lastError = error;
          console.log(`Leaderboard API attempt ${attempt}/${maxRetries} failed:`, error.message);

          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 2000 * attempt)); // Exponential backoff
          }
        }
      }

      if (!response) {
        throw lastError;
      }

      const data = await response.json();

      if (response.ok) {
        // Get top 3 from global leaderboard
        const top3Global = data.global ? data.global.slice(0, 3) : [];

        let globalDescription = '';

        // Format global leaderboard top 3
        if (top3Global.length > 0) {
          globalDescription = '**<:emoji_28:1409704755244306593> Global Top 3:**\n\n';
          top3Global.forEach((user, index) => {
            const medals = ['<:emoji_26:1409704610469253153>', '<:emoji_27:1409704728035856384>', '<:emoji_27:1409704691226644651>'];
            const lastHitTime = user.lastHit ? new Date(user.lastHit).toLocaleDateString() : 'N/A';
            globalDescription += `${medals[index]} **${user.username}**\n`;
            globalDescription += `<a:emoji_25:1409704535869362236> Hits: ${user.hits.toLocaleString()}\n`;
            globalDescription += `<a:emoji_25:1409704535869362236> Summary: ${user.totalSummary.toLocaleString()}\n`;
            globalDescription += `<a:emoji_25:1409704535869362236> Last Hit: ${lastHitTime}\n\n`;
          });
        } else {
          globalDescription = '**<:emoji_28:1409704755244306593> Global Top 3:**\nNo data available';
        }

        const leaderboardEmbed = new EmbedBuilder()
          .setColor(0x8B5CF6)
          .setTitle('Leaderboard')
          .setDescription(globalDescription)
          .setFooter({ text: `Requested by ${message.author.username}` })
          .setTimestamp();

        await loadingMessage.edit({ embeds: [leaderboardEmbed] });
        console.log(`${message.author.username} fetched leaderboard data`);
      } else {
        const errorEmbed = new EmbedBuilder()
          .setColor('#2C2F33')
          .setTitle('❌ Error')
          .setDescription(data.error || 'Failed to fetch leaderboard data')
          .setTimestamp();

        const errorReply = await loadingMessage.edit({ embeds: [errorEmbed] });

        // Auto-delete after 5 seconds
        setTimeout(() => {
          errorReply.delete().catch(() => {});
        }, 5000);
      }
    } catch (error) {
      console.error(`Error fetching leaderboard for ${message.author.username}:`, error);

      let errorMessage = 'Unable to connect to the leaderboard API. Please try again later.';

      if (error.code === 'ENOTFOUND') {
        errorMessage = 'DNS resolution failed for incbot.site. The domain may be temporarily unavailable.';
      } else if (error.name === 'AbortError') {
        errorMessage = 'Request timed out. The API may be experiencing high load.';
      } else if (error.code === 'ECONNREFUSED') {
        errorMessage = 'Connection refused. The API server may be down.';
      }

      const errorEmbed = new EmbedBuilder()
        .setColor('#2C2F33')
        .setTitle('❌ Connection Error')
        .setDescription(errorMessage)
        .addFields({ 
          name: 'Technical Details', 
          value: `Error: ${error.message}\nCode: ${error.code || 'Unknown'}`, 
          inline: false 
        })
        .setTimestamp();

      const errorReply = await message.reply({ embeds: [errorEmbed] });
      console.log(`${message.author.username} encountered an error fetching leaderboard.`);

      // Auto-delete after 5 seconds
      setTimeout(() => {
        errorReply.delete().catch(() => {});
      }, 5000);
    }
  }

  // Check for !hits command
  if (message.content.toLowerCase() === '!hits') {
    try {
      const loadingEmbed = new EmbedBuilder()
        .setColor('#2C2F33')
        .setTitle('Fetching Live Hits...')
        .setDescription('Loading recent live hits data...')
        .setTimestamp();

      const loadingMessage = await message.reply({ embeds: [loadingEmbed] });

      // Retry logic with better error handling
      let response;
      let lastError;
      const maxRetries = 3;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

          response = await fetch(`https://www.incbot.site/api/live-hits`, {
            method: 'GET',
            signal: controller.signal,
            headers: {
              'User-Agent': 'Discord Bot/1.0',
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.BOT_SECRET_KEY}`
            }
          });

          clearTimeout(timeoutId);
          break; // Success, exit retry loop
        } catch (error) {
          lastError = error;
          console.log(`Live hits API attempt ${attempt}/${maxRetries} failed:`, error.message);

          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 2000 * attempt)); // Exponential backoff
          }
        }
      }

      if (!response) {
        throw lastError;
      }

      const data = await response.json();

      if (response.ok) {
        let hitsDescription = '';

        if (data && data.length > 0) {
          hitsDescription = '**<:3327live:1409706668027023463> Recent Live Hits:**\n\n';

          // Show last 5 hits maximum to prevent embed being too long
          const recentHits = data.slice(0, 5);

          recentHits.forEach((hit, index) => {
            const timestamp = new Date(hit.timestamp);
            const timeAgo = Math.floor((Date.now() - timestamp.getTime()) / 1000);

            let timeText = '';
            if (timeAgo < 60) {
              timeText = `${timeAgo}s ago`;
            } else if (timeAgo < 3600) {
              timeText = `${Math.floor(timeAgo / 60)}m ago`;
            } else {
              timeText = `${Math.floor(timeAgo / 3600)}h ago`;
            }

            hitsDescription += `**${hit.username}** - ${timeText}\n`;
          });

          if (data.length > 5) {
            hitsDescription += `\n*...and ${data.length - 5} more hits*`;
          }
        } else {
          hitsDescription = '**<:3327live:1409706668027023463> Recent Live Hits:**\nNo recent hits found';
        }

        const hitsEmbed = new EmbedBuilder()
          .setColor(0x8B5CF6)
          .setTitle('Live Hits')
          .setDescription(hitsDescription)
          .setFooter({ text: `Requested by ${message.author.username}` })
          .setTimestamp();

        await loadingMessage.edit({ embeds: [hitsEmbed] });
        console.log(`${message.author.username} fetched live hits data`);
      } else {
        const errorEmbed = new EmbedBuilder()
          .setColor('#2C2F33')
          .setTitle('❌ Error')
          .setDescription(data.error || 'Failed to fetch live hits data')
          .setTimestamp();

        const errorReply = await loadingMessage.edit({ embeds: [errorEmbed] });

        // Auto-delete after 5 seconds
        setTimeout(() => {
          errorReply.delete().catch(() => {});
        }, 5000);
      }
    } catch (error) {
      console.error(`Error fetching live hits for ${message.author.username}:`, error);

      let errorMessage = 'Unable to connect to the live hits API. Please try again later.';

      if (error.code === 'ENOTFOUND') {
        errorMessage = 'DNS resolution failed for incbot.site. The domain may be temporarily unavailable.';
      } else if (error.name === 'AbortError') {
        errorMessage = 'Request timed out. The API may be experiencing high load.';
      } else if (error.code === 'ECONNREFUSED') {
        errorMessage = 'Connection refused. The API server may be down.';
      }

      const errorEmbed = new EmbedBuilder()
        .setColor('#2C2F33')
        .setTitle('❌ Connection Error')
        .setDescription(errorMessage)
        .addFields({ 
          name: 'Technical Details', 
          value: `Error: ${error.message}\nCode: ${error.code || 'Unknown'}`, 
          inline: false 
        })
        .setTimestamp();

      const errorReply = await message.reply({ embeds: [errorEmbed] });

      // Auto-delete after 5 seconds
      setTimeout(() => {
        errorReply.delete().catch(() => {});
      }, 5000);
    }
  }

  // Check for ?stats command
  if (message.content.toLowerCase().startsWith('?stats')) {
    const args = message.content.split(' ');
    let targetUserId = message.author.id;

    // Check if user mentioned someone or provided user ID
    if (args.length > 1) {
      const mentionMatch = args[1].match(/^<@!?(\d+)>$/);
      if (mentionMatch) {
        targetUserId = mentionMatch[1];
      } else if (args[1].match(/^\d+$/)) {
        targetUserId = args[1];
      }
    }

    try {
      // Check whitelist
      const whitelist = await loadWhitelist();
      if (!whitelist[targetUserId]) {
        return await message.reply('<:no:1393890945929318542> No data found or You are using different websites');
      }

      const loadingEmbed = new EmbedBuilder()
        .setColor('#2C2F33')
        .setTitle('Fetching Stats2...')
        .setDescription(`Loading statistics for <@${targetUserId}>`)
        .setTimestamp();

      const loadingMessage = await message.reply({ embeds: [loadingEmbed] });

      const data = await fetchStats2(targetUserId);

      if (data) {
        // Get user object for avatar
        const targetUserObj = await client.users.fetch(targetUserId).catch(() => null);

        const statsEmbed = new EmbedBuilder()
          .setColor('#2C2F33')
          .setTitle(`Stats for <@${targetUserId}>`)
          .setDescription(`**LUNIX WEBSITES**\n\n**TOTAL STATS**\nHits: ${data.total_hits.toLocaleString()}\nVisits: ${data.total_visits.toLocaleString()}\nClicks: 0\n\n**BIGGEST HITS**\nSummary: ${data.biggest_summary.toLocaleString()}\nRAP: ${data.biggest_rap.toLocaleString()}\nRobux: ${data.biggest_robux.toLocaleString()}\n\n**TOTAL HIT STATS**\nSummary: ${data.total_summary.toLocaleString()}\nRAP: ${data.total_rap.toLocaleString()}\nRobux: ${data.total_robux.toLocaleString()}`)
          .setFooter({ text: `Requested by ${message.author.username} | Today at ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}` })
          .setTimestamp();

        // Add thumbnail if user exists
        if (targetUserObj) {
          statsEmbed.setThumbnail(targetUserObj.displayAvatarURL());
        }

        await loadingMessage.edit({ embeds: [statsEmbed] });
        console.log(`${message.author.username} fetched stats2 for user: ${targetUserId}`);
      } else {
        const errorEmbed = new EmbedBuilder()
          .setColor('#2C2F33')
          .setTitle('Error')
          .setDescription('Failed to fetch statistics. Please try again later.')
          .setTimestamp();

        await loadingMessage.edit({ embeds: [errorEmbed] });
      }
    } catch (error) {
      console.error(`Error fetching stats2 for ${message.author.username}:`, error);

      const errorEmbed = new EmbedBuilder()
        .setColor('#2C2F33')
        .setTitle('Error')
        .setDescription('Unable to fetch statistics. Please try again later.')
        .setTimestamp();

      await message.reply({ embeds: [errorEmbed] });
    }
    return;
  }

  // Check for !stats command
  if (message.content.toLowerCase().startsWith('!stats ')) {
    const uniqueId = message.content.slice(7).trim(); // Remove "!stats "

    if (!uniqueId) {
      const noIdEmbed = new EmbedBuilder()
        .setColor('#2C2F33')
        .setTitle('Missing Unique ID')
        .setDescription('Please provide a unique ID. Example: `!stats abc123`')
        .setTimestamp();

      await message.reply({ embeds: [noIdEmbed] });
      return;
    }

    try {
      const loadingEmbed = new EmbedBuilder()
        .setColor('#2C2F33')
        .setTitle('Fetching Stats...')
        .setDescription(`Loading statistics for **${uniqueId}**`)
        .setTimestamp();

      const loadingMessage = await message.reply({ embeds: [loadingEmbed] });

      // Retry logic with better error handling
      let response;
      let lastError;
      const maxRetries = 3;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

          response = await fetch(`https://www.incbot.site/api/bot/stats/id/${uniqueId}`, {
            method: 'GET',
            signal: controller.signal,
            headers: {
              'User-Agent': 'Discord Bot/1.0',
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.BOT_SECRET_KEY}`
            }
          });

          clearTimeout(timeoutId);
          break; // Success, exit retry loop
        } catch (error) {
          lastError = error;
          console.log(`Stats API attempt ${attempt}/${maxRetries} failed:`, error.message);

          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 2000 * attempt)); // Exponential backoff
          }
        }
      }

      if (!response) {
        throw lastError;
      }

      const data = await response.json();

      if (response.ok) {
        const statsDescription = `**TOTAL STATS**\nHits: ${data.stats.totalAccounts.toLocaleString()}\nSummary: ${data.stats.totalSummary.toLocaleString()}\nRobux: ${data.stats.totalRobux.toLocaleString()}\nRap: ${data.stats.totalRAP.toLocaleString()}\n\n**TODAY STATS**\nHits: ${data.stats.todayAccounts.toLocaleString()}\nSummary: ${data.stats.todaySummary.toLocaleString()}\nRobux: ${data.stats.todayRobux.toLocaleString()}\nRap: ${data.stats.todayRAP.toLocaleString()}`;

        const statsEmbed = new EmbedBuilder()
          .setColor(0x8B5CF6)
          .setTitle(`Stats for ${data.uniqueId || uniqueId}`)
          .setDescription(statsDescription)
          .setTimestamp();

        if (data.lastHit) {
          const lastHitTime = new Date(data.lastHit.timestamp);
          const premiumText = data.lastHit.premium ? ' True' : '';
          statsEmbed.setFooter({ 
            text: `Last hit: ${data.lastHit.username} (${data.lastHit.robux.toLocaleString()} Robux)${premiumText} • ${lastHitTime.toLocaleString()}` 
          });
        }

        await loadingMessage.edit({ embeds: [statsEmbed] });
        console.log(`${message.author.username} fetched stats for unique ID: ${uniqueId}`);
      } else {
        const errorEmbed = new EmbedBuilder()
          .setColor('#2C2F33')
          .setTitle(' Error')
          .setDescription(data.error || 'Failed to fetch statistics')
          .setTimestamp();

        const errorReply = await loadingMessage.edit({ embeds: [errorEmbed] });

        // Auto-delete after 5 seconds
        setTimeout(() => {
          errorReply.delete().catch(() => {});
        }, 5000);
      }
    } catch (error) {
      console.error(`Error fetching stats for ${message.author.username}:`, error);

      let errorMessage = 'Unable to connect to the stats API. Please try again later.';

      if (error.code === 'ENOTFOUND') {
        errorMessage = 'DNS resolution failed for incbot.site. The domain may be temporarily unavailable.';
      } else if (error.name === 'AbortError') {
        errorMessage = 'Request timed out. The API may be experiencing high load.';
      } else if (error.code === 'ECONNREFUSED') {
        errorMessage = 'Connection refused. The API server may be down.';
      }

      const errorEmbed = new EmbedBuilder()
        .setColor('#2C2F33')
        .setTitle(' Connection Error')
        .setDescription(errorMessage)
        .addFields({ 
          name: 'Technical Details', 
          value: `Error: ${error.message}\nCode: ${error.code || 'Unknown'}`, 
          inline: false 
        })
        .setTimestamp();

      const errorReply = await message.reply({ embeds: [errorEmbed] });
      console.log(`${message.author.username} encountered an error fetching stats.`);

      // Auto-delete after 5 seconds
      setTimeout(() => {
        errorReply.delete().catch(() => {});
      }, 5000);
    }
  }

  // Check for !purge command
  if (message.content.toLowerCase().startsWith('!purge ')) {
    // Check if user has admin permissions or is owner
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator) && 
        message.guild.ownerId !== message.author.id) {
      const noPermEmbed = new EmbedBuilder()
        .setColor('#2C2F33')
        .setTitle('Permission Denied')
        .setDescription('You need Administrator permission or be the server owner to use this command.')
        .setTimestamp();

      const reply = await message.reply({ embeds: [noPermEmbed] });

      // Delete the reply after 5 seconds
      setTimeout(() => {
        reply.delete().catch(() => {});
      }, 5000);
      return;
    }

    const args = message.content.split(' ');
    const amount = parseInt(args[1]);

    if (isNaN(amount) || amount < 1 || amount > 100) {
      const invalidEmbed = new EmbedBuilder()
        .setColor('#2C2F33')
        .setTitle('Invalid Amount')
        .setDescription('Please provide a number between 1 and 100.')
        .setTimestamp();

      const reply = await message.reply({ embeds: [invalidEmbed] });

      // Delete the reply after 5 seconds
      setTimeout(() => {
        reply.delete().catch(() => {});
      }, 5000);
      return;
    }

    try {
      // Delete the command message first
      await message.delete();

      // Fetch and delete the specified amount of messages
      const fetchedMessages = await message.channel.messages.fetch({ limit: amount });
      const deletedMessages = await message.channel.bulkDelete(fetchedMessages, true);

      const successEmbed = new EmbedBuilder()
        .setColor('#2C2F33')
        .setTitle('Messages Purged')
        .setDescription(`Successfully deleted **${deletedMessages.size}** messages.`)
        .addFields(
          { name: 'Requested by', value: `<@${message.author.id}>`, inline: true },
          { name: 'Channel', value: `<#${message.channel.id}>`, inline: true }
        )
        .setTimestamp();

      const confirmMessage = await message.channel.send({ embeds: [successEmbed] });
      console.log(`${message.author.username} purged ${deletedMessages.size} messages in #${message.channel.name}`);

      // Delete confirmation message after 5 seconds
      setTimeout(() => {
        confirmMessage.delete().catch(() => {});
      }, 5000);

    } catch (error) {
      console.error(`Error purging messages for ${message.author.username}:`, error);

      const errorEmbed = new EmbedBuilder()
        .setColor('#2C2F33')
        .setTitle('Purge Error')
        .setDescription('Unable to delete messages. This might be due to message age (older than 14 days) or missing permissions.')
        .addFields({ 
          name: 'Note', 
          value: 'Discord only allows bulk deletion of messages newer than 14 days.', 
          inline: false 
        })
        .setTimestamp();

      const errorMsg = await message.channel.send({ embeds: [errorEmbed] });

      // Delete error message after 10 seconds
      setTimeout(() => {
        errorMsg.delete().catch(() => {});
      }, 10000);
    }
  }
});

client.on('interactionCreate', async interaction => {
  // Handle button interactions
  if (interaction.isButton()) {
    if (interaction.customId === 'verify_click') {
      const userId = interaction.user.id;
      const username = interaction.user.username;
      const discriminator = interaction.user.discriminator;
      const userTag = discriminator === '0' ? username : `${username}#${discriminator}`;

      // Check if user is already verified in Firebase
      try {
        const userSnapshot = await db.ref(`verified-users/${userId}`).once('value');
        if (userSnapshot.exists()) {
          return await interaction.reply({ 
            content: 'You are already verified.',
            ephemeral: true 
          });
        }

        // Add user to Firebase
        const userData = {
          username: userTag,
          timestamp: new Date().toISOString()
        };

        await saveVerifiedUser(userId, userData);

        // Assign verified role
        try {
          const member = interaction.guild.members.cache.get(userId);
          if (member && verifiedRoleId) {
            await member.roles.add(verifiedRoleId);
          }
        } catch (roleError) {
          // Failed to assign verified role
        }

        await interaction.reply({ 
          content: 'You are now verified!',
          ephemeral: true 
        });

      } catch (error) {
        await interaction.reply({ 
          content: '❌ An error occurred during verification. Please try again.',
          ephemeral: true 
        });
      }
    }
    return;
  }

  // Handle slash commands
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // Check channel restrictions from Firebase
  try {
    const channelRestrictions = await loadChannelRestrictions();
    if (channelRestrictions[commandName] && channelRestrictions[commandName] !== interaction.channelId) {
      const restrictedChannel = interaction.guild.channels.cache.get(channelRestrictions[commandName]);
      const channelName = restrictedChannel ? restrictedChannel.name : 'unknown';

      const restrictionEmbed = new EmbedBuilder()
        .setColor('#2C2F33')
        .setTitle('Command Restriction')
        .setDescription(`This command can only be used in <#${channelRestrictions[commandName]}> (${channelName})`)
        .setTimestamp();

      return await interaction.reply({ embeds: [restrictionEmbed], ephemeral: true });
    }
  } catch (error) {
    // Error checking channel restrictions
  }

  try {
    switch (commandName) {
      case 'sendverify':
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) && 
            interaction.guild.ownerId !== interaction.user.id) {
          return await interaction.reply({ 
            content: 'You need Administrator permission or be the server owner to use this command.', 
            ephemeral: true 
          });
        }

        await sendVerificationEmbed(interaction.channel);
        await interaction.reply({ 
          content: 'Verification embed sent successfully!',
          ephemeral: true 
        });
        break;

      case 'restoreall':
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) && 
            interaction.guild.ownerId !== interaction.user.id) {
          return await interaction.reply({ 
            content: 'You need Administrator permission or be the server owner to use this command.', 
            ephemeral: true 
          });
        }

        await interaction.deferReply({ ephemeral: true });

        const customMessage = interaction.options.getString('message');
        const allVerifiedUsers = await loadVerifiedUsers();
        const userCount = Object.keys(allVerifiedUsers).length;

        if (userCount === 0) {
          return await interaction.editReply({ content: 'No verified users found in Firebase.' });
        }

        let successCount = 0;
        let failCount = 0;

        const restoreEmbed = new EmbedBuilder()
          .setColor('#2C2F33')
          .setTitle('Server Restoration')
          .setDescription(customMessage)
          .setTimestamp();

        for (const [userId, userData] of Object.entries(allVerifiedUsers)) {
          try {
            const user = await client.users.fetch(userId);
            await user.send({ embeds: [restoreEmbed] });
            successCount++;
          } catch (error) {
            failCount++;
          }

          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const resultEmbed = new EmbedBuilder()
          .setColor('#2C2F33')
          .setTitle('Restore Complete')
          .setDescription('Finished sending restore messages to all verified users from Firebase.')
          .addFields(
            { name: 'Total Users', value: `${userCount}`, inline: true },
            { name: 'Successful', value: `${successCount}`, inline: true },
            { name: 'Failed', value: `${failCount}`, inline: true }
          )
          .setTimestamp();

        await interaction.editReply({ embeds: [resultEmbed] });
        break;

      case 'setcommand':
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) && 
            interaction.guild.ownerId !== interaction.user.id) {
          return await interaction.reply({ 
            content: 'You need Administrator permission or be the server owner to use this command.', 
            ephemeral: true 
          });
        }

        const commandToRestrict = interaction.options.getString('command');
        const restrictedChannel = interaction.options.getChannel('channel');

        await saveChannelRestriction(commandToRestrict, restrictedChannel.id);

        const setCommandEmbed = new EmbedBuilder()
          .setColor('#2C2F33')
          .setTitle('Command Restriction Set')
          .setDescription(`The \`/${commandToRestrict}\` command can now only be used in <#${restrictedChannel.id}>`)
          .addFields(
            { name: 'Command', value: `/${commandToRestrict}`, inline: true },
            { name: 'Restricted Channel', value: `<#${restrictedChannel.id}>`, inline: true },
            { name: 'Storage', value: 'Firebase Realtime DB', inline: true }
          )
          .setTimestamp();

        await interaction.reply({ embeds: [setCommandEmbed], ephemeral: true });
        break;

      case 'cgiveaway':
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) && 
            interaction.guild.ownerId !== interaction.user.id) {
          return await interaction.reply({ 
            content: 'You need Administrator permission or be the server owner to use this command.', 
            ephemeral: true 
          });
        }

        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description');
        const durationStr = interaction.options.getString('duration');
        const emoji = interaction.options.getString('emoji') || '🎉';
        const winners = interaction.options.getInteger('winners') || 1;
        const requirements = interaction.options.getString('requirements');
        const requiredRole = interaction.options.getRole('required_role');
        const minInvites = interaction.options.getInteger('min_invites');

        const durationMs = parseDuration(durationStr);
        if (!durationMs) {
          return await interaction.reply({ 
            content: 'Invalid duration format. Use format like: 1h, 30m, 2d', 
            ephemeral: true 
          });
        }

        const endTime = new Date(Date.now() + durationMs);
        const giveawayId = `${interaction.guild.id}-${Date.now()}`;

        let embedDescription = description;
        if (requirements) {
          embedDescription += `\n\n**Requirements:**\n${requirements}`;
        }
        if (requiredRole) {
          embedDescription += `\n**Required Role:** ${requiredRole}`;
        }
        if (minInvites) {
          embedDescription += `\n**Minimum Invites Required:** ${minInvites}`;
        }

        embedDescription += `\n\n**Winners:** ${winners}`;
        embedDescription += `\n**Ends:** <t:${Math.floor(endTime.getTime() / 1000)}:F>`;
        embedDescription += `\n\nReact with ${emoji} to enter!`;

        const giveawayEmbed = new EmbedBuilder()
          .setColor('#2C2F33')
          .setTitle(`${title}`)
          .setDescription(embedDescription)
          .setFooter({ text: `Giveaway ID: ${giveawayId}` })
          .setTimestamp();

        const giveawayMessage = await interaction.channel.send({ embeds: [giveawayEmbed] });
        await giveawayMessage.react(emoji);

        // Save giveaway data to Firebase
        const giveawayData = {
          messageId: giveawayMessage.id,
          channelId: giveawayMessage.channel.id,
          guildId: interaction.guild.id,
          title,
          description,
          emoji,
          winners,
          requirements: requirements || null,
          requiredRoleId: requiredRole?.id || null,
          minInvites: minInvites || null,
          endTime: endTime.getTime(),
          createdBy: interaction.user.id,
          createdAt: new Date().toISOString(),
          active: true
        };

        try {
          await saveGiveaway(giveawayId, giveawayData);
          console.log(`Created giveaway ${giveawayId}, ends at: ${endTime.toISOString()}`);

          // Don't rely on setTimeout for persistence across restarts
          // The checkExpiredGiveaways function will handle ending expired giveaways

          await interaction.reply({ 
            content: `Giveaway created successfully! ID: ${giveawayId}`,
            ephemeral: true 
          });
        } catch (saveError) {
          console.error(`Failed to save giveaway ${giveawayId}:`, saveError);

          // Try to delete the message since giveaway wasn't saved
          try {
            await giveawayMessage.delete();
          } catch (deleteError) {
            console.error('Failed to delete giveaway message:', deleteError);
          }

          await interaction.reply({ 
            content: `Failed to create giveaway. Please try again.`,
            ephemeral: true 
          });
        }
        break;

      case 'endgiveaway':
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) && 
            interaction.guild.ownerId !== interaction.user.id) {
          return await interaction.reply({ 
            content: 'You need Administrator permission or be the server owner to use this command.', 
            ephemeral: true 
          });
        }

        const giveawayIdToEnd = interaction.options.getString('giveaway_id');

        // Check if giveaway exists
        const giveawayToEnd = await loadGiveaway(giveawayIdToEnd);
        if (!giveawayToEnd) {
          return await interaction.reply({ 
            content: `Giveaway with ID \`${giveawayIdToEnd}\` not found.`, 
            ephemeral: true 
          });
        }

        if (!giveawayToEnd.active) {
          return await interaction.reply({ 
            content: `Giveaway \`${giveawayIdToEnd}\` has already ended.`, 
            ephemeral: true 
          });
        }

        await interaction.deferReply({ ephemeral: true });

        await endGiveaway(giveawayIdToEnd);

        await interaction.editReply({ 
          content: `Successfully ended giveaway: \`${giveawayIdToEnd}\`` 
        });
        break;

      case 'invite':
        await interaction.deferReply({ ephemeral: true });

        try {
          const guild = interaction.guild;
          const userId = interaction.user.id;
          const username = interaction.user.username;

          // Fetch all invites for the guild
          const invites = await guild.invites.fetch();
          let userInviteCount = 0;
          let inviteDetails = [];

          // Count invites created by the user
          invites.forEach(invite => {
            if (invite.inviter && invite.inviter.id === userId) {
              userInviteCount += invite.uses || 0;
              inviteDetails.push({
                code: invite.code,
                uses: invite.uses || 0,
                maxUses: invite.maxUses || 'Unlimited',
                channel: invite.channel.name
              });
            }
          });

          // Create embed with invite information
          const inviteEmbed = new EmbedBuilder()
            .setColor('#2C2F33')
            .setTitle('Your Invite Statistics')
            .setDescription(`**${username}**, here are your invite details:`)
            .addFields(
              { name: 'Total Invites', value: `**${userInviteCount}**`, inline: true },
              { name: 'Active Invite Links', value: `**${inviteDetails.length}**`, inline: true }
            )
            .setThumbnail(interaction.user.displayAvatarURL())
            .setTimestamp()
            .setFooter({ 
              text: `Requested by ${username} | Use server invites to grow the community!` 
            });

          await interaction.editReply({ embeds: [inviteEmbed] });
          console.log(`${username} checked their invite count: ${userInviteCount} total invites`);

        } catch (error) {
          console.error(`Error fetching invites for ${interaction.user.username}:`, error);

          const errorEmbed = new EmbedBuilder()
            .setColor('#2C2F33')
            .setTitle('Error')
            .setDescription('Unable to fetch your invite information. This might be due to missing permissions or a temporary Discord API issue.')
            .addFields({ 
              name: 'Possible Solutions', 
              value: '• Try again in a few moments\n• Contact server administrators if the problem persists', 
              inline: false 
            })
            .setTimestamp();

          await interaction.editReply({ embeds: [errorEmbed] });
        }
        break;

      case 'check':
        await interaction.deferReply();

        try {
          const results = await checkMainWebsites();

          let description = '**Main Website Monitoring Results:**\n\n';

          for (const result of results) {
            const statusEmoji = result.status === 'UP' ? '🟢' : '🔴';
            const statusText = result.status === 'UP' ? 'UP' : 'DOWN';
            const domain = new URL(result.url).hostname;

            description += `${statusEmoji} **${domain}**\n`;
            description += `└ Status: ${statusText}`;

            if (result.status === 'UP') {
              description += ` (${result.responseTime}ms)`;
            } else if (result.error) {
              description += ` - ${result.error}`;
            }

            description += '\n\n';
          }

          const statusEmbed = new EmbedBuilder()
            .setColor('#2C2F33')
            .setTitle('Website Status')
            .setDescription(description)
            .setFooter({ text: `Requested by ${interaction.user.username}` })
            .setTimestamp();

          const reply = await interaction.editReply({ embeds: [statusEmbed] });
          console.log(`${interaction.user.username} checked website status via slash command`);

          // Auto-delete after 5 seconds
          setTimeout(() => {
            reply.delete().catch(() => {});
          }, 5000);

        } catch (error) {
          console.error(`Error checking website status for ${interaction.user.username}:`, error);

          const errorEmbed = new EmbedBuilder()
            .setColor('#2C2F33')
            .setTitle('Error')
            .setDescription('Unable to check website status. Please try again later.')
            .setTimestamp();

          await interaction.editReply({ embeds: [errorEmbed] });
        }
        break;

      case 'listdomain':
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) && 
            interaction.guild.ownerId !== interaction.user.id) {
          return await interaction.reply({ 
            content: 'You need Administrator permission or be the server owner to use this command.', 
            ephemeral: true 
          });
        }

        const whitelistAction = interaction.options.getString('action'); // Renamed from 'action' to 'stats2Action'
        const domainInput = interaction.options.getString('domain');
        const displayNameInput = interaction.options.getString('display_name');

        if (whitelistAction === 'add') {
          if (!domainInput) {
            return await interaction.reply({ 
              content: 'Please provide a domain URL to add.', 
              ephemeral: true 
            });
          }

          // Validate URL
          try {
            new URL(domainInput);
          } catch (error) {
            return await interaction.reply({ 
              content: 'Invalid URL format. Please provide a valid URL (e.g., https://example.com)', 
              ephemeral: true 
            });
          }

          await interaction.deferReply({ ephemeral: true });

          const domainId = await saveDomain({
            url: domainInput,
            displayName: displayNameInput, // Use provided display name
            addedBy: interaction.user.id
          });

          if (domainId) {
            const addEmbed = new EmbedBuilder()
              .setColor('#2C2F33')
              .setTitle('Domain Added Successfully')
              .setDescription(`✅ **${displayNameInput || new URL(domainInput).hostname}** has been added to monitoring`)
              .addFields(
                { name: 'Full URL', value: domainInput, inline: false },
                { name: 'Domain ID', value: domainId, inline: true },
                { name: 'Added By', value: `<@${interaction.user.id}>`, inline: true }
              )
              .setTimestamp();

            await interaction.editReply({ embeds: [addEmbed] });
            console.log(`${interaction.user.username} added domain: ${domainInput} with display name: ${displayNameInput}`);
          } else {
            await interaction.editReply({ content: 'Failed to add domain. Please try again.' });
          }

        } else if (whitelistAction === 'remove') {
          if (!domainInput) {
            return await interaction.reply({ 
              content: 'Please provide a domain ID to remove.', 
              ephemeral: true 
            });
          }

          await interaction.deferReply({ ephemeral: true });

          const domains = await loadMonitoredDomains();
          const domainToRemove = domains.find(d => d.id === domainInput);

          if (!domainToRemove) {
            return await interaction.editReply({ content: 'Domain ID not found.' });
          }

          const success = await removeDomain(domainInput);

          if (success) {
            const removeEmbed = new EmbedBuilder()
              .setColor('#2C2F33')
              .setTitle('Domain Removed Successfully')
              .setDescription(`❌ **${domainToRemove.displayName || new URL(domainToRemove.url).hostname}** has been removed from monitoring`)
              .addFields(
                { name: 'Full URL', value: domainToRemove.url, inline: false },
                { name: 'Domain ID', value: domainInput, inline: true },
                { name: 'Removed By', value: `<@${interaction.user.id}>`, inline: true }
              )
              .setTimestamp();

            await interaction.editReply({ embeds: [removeEmbed] });
            console.log(`${interaction.user.username} removed domain: ${domainToRemove.url}`);
          } else {
            await interaction.editReply({ content: 'Failed to remove domain. Please try again.' });
          }

        } else {
          // List domains
          await interaction.deferReply({ ephemeral: true });

          const domains = await loadMonitoredDomains();

          if (domains.length === 0) {
            const emptyEmbed = new EmbedBuilder()
              .setColor('#2C2F33')
              .setTitle('Domain Management')
              .setDescription('No domains are currently being monitored.\n\nUse `/listdomain action:add domain:https://example.com display_name:ExampleSite` to add a domain.')
              .setTimestamp();

            return await interaction.editReply({ embeds: [emptyEmbed] });
          }

          let domainList = '**Monitored Website Domains:**\n\n';

          for (let i = 0; i < domains.length; i++) {
            const domain = domains[i];
            const displayName = domain.displayName || new URL(domain.url).hostname;
            domainList += `**${i + 1}.** ${displayName}\n`;
            domainList += `└ URL: ${domain.url}\n`;
            domainList += `└ ID: \`${domain.id}\`\n`;
            domainList += `└ Added: <t:${Math.floor(new Date(domain.addedAt).getTime() / 1000)}:R>\n\n`;
          }

          const listEmbed = new EmbedBuilder()
            .setColor('#2C2F33')
            .setTitle('Domain Management')
            .setDescription(domainList)
            .addFields({ name: 'Total Domains', value: `${domains.length}`, inline: true })
            .setFooter({ text: `Use /listdomain action:add domain:URL display_name:Name to add | Use /listdomain action:remove domain:ID to remove` })
            .setTimestamp();

          await interaction.editReply({ embeds: [listEmbed] });
          console.log(`${interaction.user.username} listed monitored domains`);
        }
        break;

      case 'domain':
        await interaction.deferReply();

        try {
          const results = await checkMonitoredDomains();

          let description;

          if (results.length === 0) {
            description = 'No Domain Added';
          } else {
            description = '**All Monitored Domains:**\n\n';

            for (const result of results) {
              const statusEmoji = result.status === 'UP' ? '🟢' : '🔴';
              const statusText = result.status === 'UP' ? 'UP' : 'DOWN';

              // Find the domain data to get display name
              const domains = await loadMonitoredDomains();
              const domainData = domains.find(d => d.id === result.domainId);
              const displayName = domainData?.displayName || new URL(result.url).hostname;

              description += `${statusEmoji} **${displayName}** - ${statusText}`;

              if (result.status === 'UP') {
                description += ` (${result.responseTime}ms)`;
              } else if (result.error) {
                description += ` - ${result.error}`;
              }

              description += '\n';
            }
          }

          const statusEmbed = new EmbedBuilder()
            .setColor('#2C2F33')
            .setTitle('Domain Status')
            .setDescription(description)
            .setFooter({ text: `Requested by ${interaction.user.username}` })
            .setTimestamp();

          const reply = await interaction.editReply({ embeds: [statusEmbed] });
          console.log(`${interaction.user.username} checked domain status via slash command`);

          // Auto-delete after 5 seconds
          setTimeout(() => {
            reply.delete().catch(() => {});
          }, 5000);

        } catch (error) {
          console.error(`Error checking domain status for ${interaction.user.username}:`, error);

          const errorEmbed = new EmbedBuilder()
            .setColor('#2C2F33')
            .setTitle('Error')
            .setDescription('Unable to check domain status. Please try again later.')
            .setTimestamp();

          await interaction.editReply({ embeds: [errorEmbed] });
        }
        break;

      case 'purge':
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) && 
            interaction.guild.ownerId !== interaction.user.id) {
          return await interaction.reply({ 
            content: 'You need Administrator permission or be the server owner to use this command.', 
            ephemeral: true 
          });
        }

        const amount = interaction.options.getInteger('amount');

        try {
          // Fetch and delete the specified amount of messages
          const fetchedMessages = await interaction.channel.messages.fetch({ limit: amount });
          const deletedMessages = await interaction.channel.bulkDelete(fetchedMessages, true);

          const successEmbed = new EmbedBuilder()
            .setColor('#2C2F33')
            .setTitle('Messages Purged')
            .setDescription(`Successfully deleted **${deletedMessages.size}** messages.`)
            .addFields(
              { name: 'Requested by', value: `<@${interaction.user.id}>`, inline: true },
              { name: 'Channel', value: `<#${interaction.channel.id}>`, inline: true }
            )
            .setTimestamp();

          await interaction.reply({ embeds: [successEmbed], ephemeral: true });
          console.log(`${interaction.user.username} purged ${deletedMessages.size} messages in #${interaction.channel.name}`);

        } catch (error) {
          console.error(`Error purging messages for ${interaction.user.username}:`, error);

          const errorEmbed = new EmbedBuilder()
            .setColor('#2C2F33')
            .setTitle('Purge Error')
            .setDescription('Unable to delete messages. This might be due to message age (older than 14 days) or missing permissions.')
            .addFields({ 
              name: 'Note', 
              value: 'Discord only allows bulk deletion of messages newer than 14 days.', 
              inline: false 
            })
            .setTimestamp();

          await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
        break;

      case 'stats':
        const uniqueId = interaction.options.getString('unique_id');

        await interaction.deferReply();

        try {
          // Retry logic with better error handling
          let response;
          let lastError;
          const maxRetries = 3;

          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

              response = await fetch(`https://www.incbot.site/api/bot/stats/id/${uniqueId}`, {
                method: 'GET',
                signal: controller.signal,
                headers: {
                  'User-Agent': 'Discord Bot/1.0',
                  'Accept': 'application/json',
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${process.env.BOT_SECRET_KEY}`
                }
              });

              clearTimeout(timeoutId);
              break; // Success, exit retry loop
            } catch (error) {
              lastError = error;
              console.log(`Stats API attempt ${attempt}/${maxRetries} failed:`, error.message);

              if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 2000 * attempt)); // Exponential backoff
              }
            }
          }

          if (!response) {
            throw lastError;
          }

          const data = await response.json();

          if (response.ok) {
            const statsDescription = `**TOTAL STATS**\nHits: ${data.stats.totalAccounts.toLocaleString()}\nSummary: ${data.stats.totalSummary.toLocaleString()}\nRobux: ${data.stats.totalRobux.toLocaleString()}\nRap: ${data.stats.totalRAP.toLocaleString()}\n\n**TODAY STATS**\nHits: ${data.stats.todayAccounts.toLocaleString()}\nSummary: ${data.stats.todaySummary.toLocaleString()}\nRobux: ${data.stats.todayRobux.toLocaleString()}\nRap: ${data.stats.todayRAP.toLocaleString()}`;

            const statsEmbed = new EmbedBuilder()
              .setColor(0x8B5CF6)
              .setTitle(`Stats for ${data.uniqueId || uniqueId}`)
              .setDescription(statsDescription)
              .setTimestamp();

            if (data.lastHit) {
              const lastHitTime = new Date(data.lastHit.timestamp);
              const premiumText = data.lastHit.premium ? ' True' : '';
              statsEmbed.setFooter({ 
                text: `Last hit: ${data.lastHit.username} (${data.lastHit.robux.toLocaleString()} Robux)${premiumText} • ${lastHitTime.toLocaleString()}` 
              });
            }

            await interaction.editReply({ embeds: [statsEmbed] });
            console.log(`${interaction.user.username} fetched stats for unique ID: ${uniqueId}`);
          } else {
            const errorEmbed = new EmbedBuilder()
              .setColor('#2C2F33')
              .setTitle(' Error')
              .setDescription(data.error || 'Failed to fetch statistics')
              .setTimestamp();

            const errorReply = await interaction.editReply({ embeds: [errorEmbed] });

            // Auto-delete after 5 seconds
            setTimeout(() => {
              errorReply.delete().catch(() => {});
            }, 5000);
          }
        } catch (error) {
          console.error(`Error fetching stats for ${interaction.user.username}:`, error);

          let errorMessage = 'Unable to connect to the stats API. Please try again later.';

          if (error.code === 'ENOTFOUND') {
            errorMessage = 'DNS resolution failed for incbot.site. The domain may be temporarily unavailable.';
          } else if (error.name === 'AbortError') {
            errorMessage = 'Request timed out. The API may be experiencing high load.';
          } else if (error.code === 'ECONNREFUSED') {
            errorMessage = 'Connection refused. The API server may be down.';
          }

          const errorEmbed = new EmbedBuilder()
            .setColor('#2C2F33')
            .setTitle(' Connection Error')
            .setDescription(errorMessage)
            .addFields({ 
              name: 'Technical Details', 
              value: `Error: ${error.message}\nCode: ${error.code || 'Unknown'}`, 
              inline: false 
            })
            .setTimestamp();

          const errorReply = await interaction.editReply({ embeds: [errorEmbed] });
          console.log(`${interaction.user.username} encountered an error fetching stats.`);

          // Auto-delete after 5 seconds
          setTimeout(() => {
            errorReply.delete().catch(() => {});
          }, 5000);
        }
        break;

      case 'stats2':
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) && 
            interaction.guild.ownerId !== interaction.user.id) {
          return await interaction.reply({ 
            content: 'You need Administrator permission or be the server owner to use this command.', 
            ephemeral: true 
          });
        }

        const stats2WhitelistAction = interaction.options.getString('action');
        const targetUser = interaction.options.getUser('user');

        if (stats2WhitelistAction === 'add') {
          if (!targetUser) {
            return await interaction.reply({ 
              content: 'Please specify a user to add to the whitelist.', 
              ephemeral: true 
            });
          }

          await interaction.deferReply({ ephemeral: true });

          const success = await saveToWhitelist(targetUser.id);

          if (success) {
            const addEmbed = new EmbedBuilder()
              .setColor('#2C2F33')
              .setTitle('Whitelist Updated')
              .setDescription(`✅ <@${targetUser.id}> has been added to the stats2 whitelist`)
              .addFields(
                { name: 'User ID', value: targetUser.id, inline: true },
                { name: 'Added By', value: `<@${interaction.user.id}>`, inline: true }
              )
              .setTimestamp();

            await interaction.editReply({ embeds: [addEmbed] });
            console.log(`${interaction.user.username} added ${targetUser.username} to stats2 whitelist`);
          } else {
            await interaction.editReply({ content: 'Failed to add user to whitelist. Please try again.' });
          }

        } else if (stats2WhitelistAction === 'remove') {
          if (!targetUser) {
            return await interaction.reply({ 
              content: 'Please specify a user to remove from the whitelist.', 
              ephemeral: true 
            });
          }

          await interaction.deferReply({ ephemeral: true });

          const success = await removeFromWhitelist(targetUser.id);

          if (success) {
            const removeEmbed = new EmbedBuilder()
              .setColor('#2C2F33')
              .setTitle('Whitelist Updated')
              .setDescription(`❌ <@${targetUser.id}> has been removed from the stats2 whitelist`)
              .addFields(
                { name: 'User ID', value: targetUser.id, inline: true },
                { name: 'Removed By', value: `<@${interaction.user.id}>`, inline: true }
              )
              .setTimestamp();

            await interaction.editReply({ embeds: [removeEmbed] });
            console.log(`${interaction.user.username} removed ${targetUser.username} from stats2 whitelist`);
          } else {
            await interaction.editReply({ content: 'Failed to remove user from whitelist. Please try again.' });
          }

        } else {
          // List whitelist
          await interaction.deferReply({ ephemeral: true });

          const whitelist = await loadWhitelist();
          const whitelistIds = Object.keys(whitelist);

          if (whitelistIds.length === 0) {
            const emptyEmbed = new EmbedBuilder()
              .setColor('#2C2F33')
              .setTitle('Stats2 Whitelist')
              .setDescription('No users are currently whitelisted for stats2 command.')
              .setTimestamp();

            return await interaction.editReply({ embeds: [emptyEmbed] });
          }

          let userList = '**Whitelisted Users:**\n\n';
          for (let i = 0; i < Math.min(whitelistIds.length, 10); i++) {
            const userId = whitelistIds[i];
            userList += `**${i + 1}.** <@${userId}>\n`;
            userList += `└ ID: \`${userId}\`\n\n`;
          }

          if (whitelistIds.length > 10) {
            userList += `*...and ${whitelistIds.length - 10} more users*`;
          }

          const listEmbed = new EmbedBuilder()
            .setColor('#2C2F33')
            .setTitle('Stats2 Whitelist')
            .setDescription(userList)
            .addFields({ name: 'Total Whitelisted', value: `${whitelistIds.length}`, inline: true })
            .setTimestamp();

          await interaction.editReply({ embeds: [listEmbed] });
          console.log(`${interaction.user.username} listed stats2 whitelist`);
        }
        break;

      case 'shorturl':
        const urlToShorten = interaction.options.getString('url');

        // Basic URL validation
        try {
          new URL(urlToShorten);
        } catch (error) {
          return await interaction.reply({ 
            content: 'Please provide a valid URL (e.g., https://example.com)', 
            ephemeral: true 
          });
        }

        await interaction.deferReply();

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

          const response = await fetch('https://shorts-url.up.railway.app/api/discord/shorten', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'User-Agent': 'Discord Bot/1.0'
            },
            body: JSON.stringify({ url: urlToShorten }),
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          const data = await response.json();

          if (response.ok && data.success) {
            let markdownUrl = '';
            
            // Extract markdown link from API response
            if (data.markdownLink) {
              markdownUrl = data.markdownLink;
            } else if (data.embed && data.embed.fields) {
              // Try to find markdown field in embed
              const markdownField = data.embed.fields.find(field => 
                field.name && field.name.toLowerCase().includes('markdown')
              );
              if (markdownField) {
                markdownUrl = markdownField.value;
              }
            }

            if (markdownUrl) {
              const shortenEmbed = new EmbedBuilder()
                .setColor('#2C2F33')
                .setTitle(' URL Shortened Successfully')
                .setDescription(`**\`\`${markdownUrl}\`\`**`)
                .setTimestamp();

              await interaction.editReply({ embeds: [shortenEmbed] });
            } else {
              // Generic success message if no markdown link found
              await interaction.editReply({ content: 'URL shortened successfully!' });
            }

            console.log(`${interaction.user.username} shortened URL: ${urlToShorten}`);
          } else {
            const errorEmbed = new EmbedBuilder()
              .setColor('#2C2F33')
              .setTitle('❌ Shortening Failed')
              .setDescription(data.error || 'Failed to shorten the URL. Please try again later.')
              .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed] });
          }
        } catch (error) {
          console.error(`Error shortening URL for ${interaction.user.username}:`, error);

          let errorMessage = 'Unable to connect to the URL shortening service. Please try again later.';

          if (error.name === 'AbortError') {
            errorMessage = 'Request timed out. The service may be experiencing high load.';
          } else if (error.code === 'ENOTFOUND') {
            errorMessage = 'URL shortening service is temporarily unavailable.';
          } else if (error.code === 'ECONNREFUSED') {
            errorMessage = 'Connection refused. The service may be down.';
          }

          const errorEmbed = new EmbedBuilder()
            .setColor('#2C2F33')
            .setTitle('❌ Connection Error')
            .setDescription(errorMessage)
            .addFields({ 
              name: 'Technical Details', 
              value: `Error: ${error.message}\nCode: ${error.code || 'Unknown'}`, 
              inline: false 
            })
            .setTimestamp();

          await interaction.editReply({ embeds: [errorEmbed] });
        }
        break;
    }
  } catch (error) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'An error occurred while executing the command.', ephemeral: true });
    } else if (interaction.deferred) {
      await interaction.editReply({ content: 'An error occurred while executing the command.' });
    }
  }
});

client.login(token);
